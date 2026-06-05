/**
 * One-off database cleanup: keep only the account tied to club member #01
 * (membership_number = 1) and remove all other users + their related rows.
 *
 * Site content (news, merchandise products, fixture cache, offers) is kept.
 *
 * Usage:
 *   npm run cleanup:member-01          # dry-run (preview only)
 *   npm run cleanup:member-01 -- --execute
 */
import 'dotenv/config'
import pg from 'pg'

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('[cleanup] Missing DATABASE_URL. Add it to .env (local) or Railway Service Variables.')
  process.exit(1)
}

const execute = process.argv.includes('--execute')

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

type KeeperRow = {
  user_id: string
  application_id: string
  email: string | null
  auth_email: string | null
  first_name: string
  last_name: string
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(sql, params)
  return Number(rows[0]?.n ?? 0)
}

async function main(): Promise<void> {
  const { rows: keepers } = await pool.query<KeeperRow>(
    `select
       ma.user_id,
       ma.application_id,
       p.email,
       au.email as auth_email,
       ma.first_name,
       ma.last_name
     from public.membership_applications ma
     join public.profiles p on p.id = ma.user_id
     left join public.auth_users au on au.user_id = ma.user_id
     where ma.membership_number = 1`,
  )

  if (keepers.length === 0) {
    console.error('[cleanup] No active member with membership_number = 1 (displayed as 01). Aborting.')
    process.exit(1)
  }
  if (keepers.length > 1) {
    console.error('[cleanup] Multiple rows with membership_number = 1 — data issue. Aborting.')
    for (const k of keepers) {
      console.error(`  - ${k.user_id} ${k.email ?? k.auth_email ?? '(no email)'}`)
    }
    process.exit(1)
  }

  const keeper = keepers[0]!
  const keeperEmail = (keeper.auth_email ?? keeper.email ?? '').trim().toLowerCase()
  if (!keeperEmail) {
    console.error('[cleanup] Keeper account has no email. Aborting.')
    process.exit(1)
  }

  const [
    otherProfiles,
    otherAuthUsers,
    otherMembershipApps,
    otherRenewals,
    otherOfficialRequests,
    otherTicketRequests,
    otherMerchOrders,
    otherAdminEmails,
  ] = await Promise.all([
    count(`select count(*)::text as n from public.profiles where id <> $1`, [keeper.user_id]),
    count(`select count(*)::text as n from public.auth_users where user_id <> $1`, [keeper.user_id]),
    count(
      `select count(*)::text as n from public.membership_applications
       where user_id <> $1 or application_id <> $2`,
      [keeper.user_id, keeper.application_id],
    ),
    count(
      `select count(*)::text as n from public.membership_renewal_requests
       where user_id <> $1 or application_id <> $2`,
      [keeper.user_id, keeper.application_id],
    ),
    count(`select count(*)::text as n from public.official_membership_requests where user_id <> $1`, [
      keeper.user_id,
    ]),
    count(`select count(*)::text as n from public.fixture_ticket_requests where user_id <> $1`, [keeper.user_id]),
    count(`select count(*)::text as n from public.merchandise_orders where user_id <> $1`, [keeper.user_id]),
    count(`select count(*)::text as n from public.admin_user_emails where lower(email) <> $1`, [keeperEmail]),
  ])

  console.log('[cleanup] Keeper (member #01):')
  console.log(`  user_id:        ${keeper.user_id}`)
  console.log(`  application_id: ${keeper.application_id}`)
  console.log(`  email:          ${keeperEmail}`)
  console.log(`  name:           ${keeper.first_name} ${keeper.last_name}`)
  console.log('')
  console.log('[cleanup] Rows to remove:')
  console.log(`  profiles (other users):              ${otherProfiles}`)
  console.log(`  auth_users (other users):            ${otherAuthUsers}`)
  console.log(`  membership_applications:             ${otherMembershipApps}`)
  console.log(`  membership_renewal_requests:         ${otherRenewals}`)
  console.log(`  official_membership_requests:        ${otherOfficialRequests}`)
  console.log(`  fixture_ticket_requests:             ${otherTicketRequests}`)
  console.log(`  merchandise_orders:                  ${otherMerchOrders}`)
  console.log(`  admin_user_emails (other admins):    ${otherAdminEmails}`)
  console.log('')
  console.log('[cleanup] Kept unchanged: news_posts, merchandise_products, fixture caches, official offers')

  if (!execute) {
    console.log('')
    console.log('[cleanup] Dry run only. Re-run with --execute to apply changes.')
    await pool.end()
    return
  }

  const client = await pool.connect()
  try {
    await client.query('begin')

    await client.query(`delete from public.official_membership_requests where user_id <> $1`, [keeper.user_id])
    await client.query(`delete from public.fixture_ticket_requests where user_id <> $1`, [keeper.user_id])
    await client.query(`delete from public.merchandise_orders where user_id <> $1`, [keeper.user_id])
    await client.query(
      `delete from public.membership_renewal_requests
       where user_id <> $1 or application_id <> $2`,
      [keeper.user_id, keeper.application_id],
    )
    await client.query(
      `delete from public.membership_applications
       where user_id <> $1 or application_id <> $2`,
      [keeper.user_id, keeper.application_id],
    )

    await client.query(`update public.profiles set is_admin = false where id <> $1`, [keeper.user_id])
    await client.query(`update public.profiles set is_admin = true where id = $1`, [keeper.user_id])

    await client.query(`delete from public.admin_user_emails where lower(email) <> $1`, [keeperEmail])
    await client.query(
      `insert into public.admin_user_emails (email)
       values ($1)
       on conflict (email) do nothing`,
      [keeperEmail],
    )

    await client.query(`delete from public.profiles where id <> $1`, [keeper.user_id])

    await client.query(`select setval('public.membership_member_number_seq', 1, true)`)

    await client.query('commit')
    console.log('[cleanup] Done. Only member #01 remains as the sole admin account.')
  } catch (err) {
    await client.query('rollback')
    console.error('[cleanup] Failed — rolled back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[cleanup] fatal:', err)
  void pool.end().catch(() => {})
  process.exit(1)
})
