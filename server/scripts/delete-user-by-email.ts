/**
 * Delete a single non-admin account by email so the user can sign up again.
 * Usage: npx tsx server/scripts/delete-user-by-email.ts <email>
 */
import 'dotenv/config'
import pg from 'pg'

const email = (process.argv[2] ?? '').trim().toLowerCase()
if (!email) {
  console.error('Usage: npx tsx server/scripts/delete-user-by-email.ts <email>')
  process.exit(1)
}

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

async function main(): Promise<void> {
  const client = await pool.connect()
  try {
    const { rows } = await client.query<{
      user_id: string
      email: string
      full_name: string | null
      email_verified_at: string | null
      is_admin: boolean
    }>(
      `select au.user_id, au.email, p.full_name, au.email_verified_at, coalesce(p.is_admin, false) as is_admin
       from public.auth_users au
       join public.profiles p on p.id = au.user_id
       where lower(au.email) = $1`,
      [email],
    )

    if (rows.length === 0) {
      console.log(`[delete-user] No account found for ${email}`)
      return
    }

    const user = rows[0]
    if (user.is_admin) {
      console.error('[delete-user] Refusing to delete an admin account.')
      process.exit(1)
    }

    console.log(
      `[delete-user] Found: ${user.email} — ${user.full_name?.trim() || '(no name)'} — verified: ${user.email_verified_at ?? 'NO'}`,
    )

    await client.query('begin')
    await client.query(`delete from public.official_membership_requests where user_id = $1`, [user.user_id])
    await client.query(`delete from public.fixture_ticket_requests where user_id = $1`, [user.user_id])
    await client.query(`delete from public.merchandise_orders where user_id = $1`, [user.user_id])
    await client.query(`delete from public.push_subscriptions where user_id = $1`, [user.user_id])
    await client.query(`delete from public.membership_renewal_requests where user_id = $1`, [user.user_id])
    await client.query(`delete from public.membership_applications where user_id = $1`, [user.user_id])
    const deleted = await client.query(`delete from public.profiles where id = $1 and coalesce(is_admin, false) = false`, [
      user.user_id,
    ])
    await client.query('commit')

    console.log(`[delete-user] Removed ${deleted.rowCount ?? 0} account(s). You can now sign up again with ${email}.`)
  } catch (err) {
    await client.query('rollback')
    console.error('[delete-user] Failed — rolled back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[delete-user] fatal:', err)
  void pool.end().catch(() => {})
  process.exit(1)
})
