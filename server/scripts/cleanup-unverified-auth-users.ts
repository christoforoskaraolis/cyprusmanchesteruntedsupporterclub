/**
 * Remove accounts that never verified their email so those users can sign up again.
 * Deletes related membership, ticket, merch, and push rows, then removes the profile
 * (auth_users and verification tokens cascade from profile deletion).
 *
 * Admins are never removed, even if unverified.
 *
 * Usage:
 *   npm run cleanup:unverified-auth              # dry-run (preview only)
 *   npm run cleanup:unverified-auth -- --execute
 */
import 'dotenv/config'
import pg from 'pg'

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('[cleanup:unverified-auth] Missing DATABASE_URL.')
  process.exit(1)
}

const execute = process.argv.includes('--execute')

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

type UnverifiedUserRow = {
  user_id: string
  email: string
  full_name: string | null
  created_at: string
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(sql, params)
  return Number(rows[0]?.n ?? 0)
}

async function main(): Promise<void> {
  const { rows: users } = await pool.query<UnverifiedUserRow>(
    `select au.user_id, au.email, p.full_name, au.created_at
     from public.auth_users au
     join public.profiles p on p.id = au.user_id
     where au.email_verified_at is null
       and coalesce(p.is_admin, false) = false
     order by au.created_at asc`,
  )

  const userIds = users.map((user) => user.user_id)

  console.log('[cleanup:unverified-auth] Unverified accounts:')
  if (users.length === 0) {
    console.log('  (none)')
  } else {
    for (const user of users) {
      const name = user.full_name?.trim() || '(no name)'
      console.log(`  ${user.email} — ${name} — created ${new Date(user.created_at).toLocaleString('en-GB')}`)
    }
    console.log(`  total: ${users.length}`)
  }

  if (userIds.length === 0) {
    console.log('')
    console.log('[cleanup:unverified-auth] Nothing to remove.')
    await pool.end()
    return
  }

  const [
    membershipApplications,
    renewalRequests,
    ticketRequests,
    merchOrders,
    officialRequests,
    pushSubscriptions,
    pendingVerifications,
  ] = await Promise.all([
    count(`select count(*)::text as n from public.membership_applications where user_id = any($1::uuid[])`, [userIds]),
    count(`select count(*)::text as n from public.membership_renewal_requests where user_id = any($1::uuid[])`, [userIds]),
    count(`select count(*)::text as n from public.fixture_ticket_requests where user_id = any($1::uuid[])`, [userIds]),
    count(`select count(*)::text as n from public.merchandise_orders where user_id = any($1::uuid[])`, [userIds]),
    count(`select count(*)::text as n from public.official_membership_requests where user_id = any($1::uuid[])`, [userIds]),
    count(`select count(*)::text as n from public.push_subscriptions where user_id = any($1::uuid[])`, [userIds]),
    count(`select count(*)::text as n from public.auth_email_verifications where user_id = any($1::uuid[])`, [userIds]),
  ])

  console.log('')
  console.log('[cleanup:unverified-auth] Related rows to remove:')
  console.log(`  membership_applications:        ${membershipApplications}`)
  console.log(`  membership_renewal_requests:      ${renewalRequests}`)
  console.log(`  fixture_ticket_requests:        ${ticketRequests}`)
  console.log(`  merchandise_orders:               ${merchOrders}`)
  console.log(`  official_membership_requests:   ${officialRequests}`)
  console.log(`  push_subscriptions:             ${pushSubscriptions}`)
  console.log(`  auth_email_verifications:       ${pendingVerifications}`)
  console.log(`  auth_users + profiles:          ${users.length}`)

  if (!execute) {
    console.log('')
    console.log('[cleanup:unverified-auth] Dry run only. Re-run with --execute to apply changes.')
    await pool.end()
    return
  }

  const client = await pool.connect()
  try {
    await client.query('begin')

    await client.query(`delete from public.official_membership_requests where user_id = any($1::uuid[])`, [userIds])
    await client.query(`delete from public.fixture_ticket_requests where user_id = any($1::uuid[])`, [userIds])
    await client.query(`delete from public.merchandise_orders where user_id = any($1::uuid[])`, [userIds])
    await client.query(`delete from public.push_subscriptions where user_id = any($1::uuid[])`, [userIds])
    await client.query(`delete from public.membership_renewal_requests where user_id = any($1::uuid[])`, [userIds])
    await client.query(`delete from public.membership_applications where user_id = any($1::uuid[])`, [userIds])
    const deletedProfiles = await client.query(
      `delete from public.profiles
       where id = any($1::uuid[])
         and coalesce(is_admin, false) = false`,
      [userIds],
    )

    await client.query('commit')
    console.log('')
    console.log(`[cleanup:unverified-auth] Removed ${deletedProfiles.rowCount ?? 0} unverified account(s).`)
    console.log('[cleanup:unverified-auth] Those users can now sign up again from scratch.')
  } catch (err) {
    await client.query('rollback')
    console.error('[cleanup:unverified-auth] Failed — rolled back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[cleanup:unverified-auth] fatal:', err)
  void pool.end().catch(() => {})
  process.exit(1)
})
