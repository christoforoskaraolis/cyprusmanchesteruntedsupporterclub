import 'dotenv/config'
import pg from 'pg'

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

async function main(): Promise<void> {
  const db = await pool.query<{ size: string }>(
    `select pg_size_pretty(pg_database_size(current_database())) as size`,
  )
  const users = await pool.query<{ total: number; verified: number; unverified: number }>(
    `select count(*)::int as total,
            count(*) filter (where email_verified_at is not null)::int as verified,
            count(*) filter (where email_verified_at is null)::int as unverified
     from public.auth_users`,
  )
  const tables = await pool.query<{ table: string; size: string }>(
    `select relname as table,
            pg_size_pretty(pg_total_relation_size(quote_ident(relname)::regclass)) as size
     from pg_stat_user_tables
     order by pg_total_relation_size(quote_ident(relname)::regclass) desc
     limit 10`,
  )
  const embedded = await pool.query<{ posts_with_embedded: number }>(
    `select count(*)::int as posts_with_embedded
     from public.news_posts
     where coalesce(image_url_mobile, '') like 'data:image/%'
        or coalesce(image_url, '') like 'data:image/%'`,
  )

  console.log('[db-usage] Database size:', db.rows[0]?.size ?? 'unknown')
  console.log('[db-usage] Auth users:', users.rows[0])
  console.log('[db-usage] News posts with embedded base64 images:', embedded.rows[0]?.posts_with_embedded ?? 0)
  console.log('[db-usage] Largest tables:')
  for (const row of tables.rows) {
    console.log(`  ${row.table} — ${row.size}`)
  }
}

main()
  .catch((err) => {
    console.error('[db-usage] fatal:', err)
    process.exit(1)
  })
  .finally(() => {
    void pool.end().catch(() => {})
  })
