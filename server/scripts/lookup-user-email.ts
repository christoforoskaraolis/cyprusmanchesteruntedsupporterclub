import 'dotenv/config'
import pg from 'pg'

const email = (process.argv[2] ?? '').trim().toLowerCase()
if (!email) {
  console.error('Usage: npx tsx server/scripts/lookup-user-email.ts <email>')
  process.exit(1)
}

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

async function main(): Promise<void> {
  const { rows: authRows } = await pool.query(
    `select user_id, email, email_verified_at, created_at, updated_at
     from public.auth_users
     where lower(email) = $1`,
    [email],
  )

  const { rows: profileRows } = await pool.query(
    `select id, email, full_name, is_admin, created_at
     from public.profiles
     where lower(trim(email)) = $1`,
    [email],
  )

  const userIds = [...new Set([...authRows.map((r) => r.user_id), ...profileRows.map((r) => r.id)])]

  let membershipRows: Record<string, unknown>[] = []
  if (userIds.length > 0) {
    const { rows } = await pool.query(
      `select application_id, user_id, status, membership_number, first_name, last_name,
              mobile_phone, official_mu_membership_id, official_mu_membership_status,
              sponsor_application_id, submitted_at, activated_at, activation_email_status
       from public.membership_applications
       where user_id = any($1::uuid[])
       order by submitted_at desc`,
      [userIds],
    )
    membershipRows = rows
  }

  let pendingVerification = 0
  if (authRows[0]?.user_id) {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n
       from public.auth_email_verifications
       where user_id = $1 and consumed_at is null and expires_at > now()`,
      [authRows[0].user_id],
    )
    pendingVerification = Number(rows[0]?.n ?? 0)
  }

  console.log(`[lookup] email: ${email}`)
  console.log('')
  console.log('[auth_users]')
  if (authRows.length === 0) console.log('  (not found)')
  else {
    for (const row of authRows) {
      console.log(`  user_id: ${row.user_id}`)
      console.log(`  email: ${row.email}`)
      console.log(`  email_verified_at: ${row.email_verified_at ?? 'NOT VERIFIED (cannot sign in)'}`)
      console.log(`  created_at: ${row.created_at}`)
    }
  }

  console.log('')
  console.log('[profiles]')
  if (profileRows.length === 0) console.log('  (not found)')
  else {
    for (const row of profileRows) {
      console.log(`  id: ${row.id}`)
      console.log(`  email: ${row.email}`)
      console.log(`  full_name: ${row.full_name ?? '—'}`)
      console.log(`  is_admin: ${row.is_admin}`)
    }
  }

  console.log('')
  console.log('[membership_applications]')
  if (membershipRows.length === 0) console.log('  (none)')
  else {
    for (const row of membershipRows) {
      console.log(`  application_id: ${row.application_id}`)
      console.log(`  status: ${row.status}`)
      console.log(`  membership_number: ${row.membership_number ?? '—'}`)
      console.log(`  name: ${row.first_name} ${row.last_name}`)
      console.log(`  official_mu_status: ${row.official_mu_membership_status ?? '—'}`)
      console.log(`  sponsor_application_id: ${row.sponsor_application_id ?? 'primary member'}`)
      console.log(`  activation_email_status: ${row.activation_email_status ?? '—'}`)
      console.log('  ---')
    }
  }

  console.log('')
  console.log(`[pending_email_verification_tokens] ${pendingVerification}`)

  if (authRows.length === 0 && profileRows.length === 0) {
    console.log('')
    console.log('[summary] No account or profile found for this email.')
  } else if (authRows.length === 0 && profileRows.length > 0) {
    console.log('')
    console.log('[summary] Profile exists but NO auth account — user cannot sign in. They need to sign up.')
  } else if (authRows[0] && !authRows[0].email_verified_at) {
    console.log('')
    console.log('[summary] Account exists but email is NOT VERIFIED — sign-in is blocked until they verify.')
  } else if (authRows[0]?.email_verified_at) {
    console.log('')
    console.log('[summary] Account exists and email is verified — sign-in should work with correct password.')
  }

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  void pool.end().catch(() => {})
  process.exit(1)
})
