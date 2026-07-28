/**
 * Mark "Purchased Membership" for records already marked "Registered to Microsite".
 * Usage: npx tsx server/scripts/mark-membership-purchased-from-microsite.ts [--dry-run]
 */
import 'dotenv/config'
import pg from 'pg'

const dryRun = process.argv.includes('--dry-run')

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

async function main(): Promise<void> {
  const client = await pool.connect()
  try {
    const { rows: beforeRows } = await client.query<{ count: string }>(
      `select count(*)::text as count
       from public.membership_applications
       where admin_send_microsite = true
         and admin_member = false`,
    )
    const toMark = Number(beforeRows[0]?.count ?? '0')
    console.log(`[membership] Microsite=true and Purchased=false: ${toMark}${dryRun ? ' (dry-run)' : ''}`)

    if (!dryRun && toMark > 0) {
      const { rowCount } = await client.query(
        `update public.membership_applications
         set admin_member = true,
             admin_member_at = coalesce(admin_member_at, now()),
             official_mu_membership_status = case
               when official_mu_membership_status is null then 'activated'
               else official_mu_membership_status
             end
         where admin_send_microsite = true
           and admin_member = false`,
      )
      console.log(`[membership] Updated rows: ${rowCount ?? 0}`)
    }

    const { rows: afterRows } = await client.query<{ count: string }>(
      `select count(*)::text as count
       from public.membership_applications
       where admin_send_microsite = true
         and admin_member = false`,
    )
    const remaining = Number(afterRows[0]?.count ?? '0')
    console.log(`[membership] Remaining not purchased (with microsite=true): ${remaining}`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
