/**
 * Manually verify a user's email (admin/support use).
 * Usage: npx tsx server/scripts/verify-user-by-email.ts <email>
 */
import 'dotenv/config'
import pg from 'pg'

const email = (process.argv[2] ?? '').trim().toLowerCase()
if (!email) {
  console.error('Usage: npx tsx server/scripts/verify-user-by-email.ts <email>')
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
    }>(
      `select au.user_id, au.email, p.full_name, au.email_verified_at
       from public.auth_users au
       join public.profiles p on p.id = au.user_id
       where lower(au.email) = $1`,
      [email],
    )

    if (rows.length === 0) {
      console.log(`[verify-user] No account found for ${email}`)
      return
    }

    const user = rows[0]
    if (user.email_verified_at) {
      console.log(`[verify-user] ${user.email} (${user.full_name?.trim() || 'no name'}) is already verified.`)
      return
    }

    await client.query('begin')
    const consumed = await client.query(
      `update public.auth_email_verifications
       set consumed_at = now()
       where user_id = $1 and consumed_at is null`,
      [user.user_id],
    )
    const verified = await client.query(
      `update public.auth_users
       set email_verified_at = now(), updated_at = now()
       where user_id = $1 and email_verified_at is null`,
      [user.user_id],
    )
    await client.query('commit')

    console.log(
      `[verify-user] Verified ${user.email} (${user.full_name?.trim() || 'no name'}) — tokens consumed: ${consumed.rowCount ?? 0}`,
    )
    if ((verified.rowCount ?? 0) === 0) {
      console.log('[verify-user] No auth_users row updated (may already be verified).')
    } else {
      console.log('[verify-user] User can now sign in with their password.')
    }
  } catch (err) {
    await client.query('rollback')
    console.error('[verify-user] Failed — rolled back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[verify-user] fatal:', err)
  void pool.end().catch(() => {})
  process.exit(1)
})
