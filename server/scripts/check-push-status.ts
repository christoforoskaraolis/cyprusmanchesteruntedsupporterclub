import 'dotenv/config'
import pg from 'pg'

function read(name: string): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : ''
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const { rows: counts } = await pool.query<{
    news_count: string
    push_count: string
    profiles_count: string
  }>(`select
    (select count(*)::text from public.news_posts) as news_count,
    (select count(*)::text from public.push_subscriptions) as push_count,
    (select count(*)::text from public.profiles) as profiles_count`)

  console.log('Database:')
  console.log('  news posts:', counts[0]?.news_count)
  console.log('  push subscriptions:', counts[0]?.push_count)
  console.log('  profiles:', counts[0]?.profiles_count)

  const { rows: subs } = await pool.query(
    `select ps.id, au.email, left(ps.endpoint, 70) as endpoint, ps.created_at
     from public.push_subscriptions ps
     left join public.auth_users au on au.user_id = ps.user_id`,
  )
  if (subs.length) {
    console.log('\nSubscriptions:')
    for (const s of subs) console.log(' ', s)
  }

  const { rows: news } = await pool.query(
    `select title, published_at from public.news_posts order by published_at desc limit 5`,
  )
  if (news.length) {
    console.log('\nRecent news:')
    for (const n of news) console.log(' ', n.title, n.published_at)
  }

  console.log('\nEnv check (local .env — Railway may differ):')
  const vapidOk = Boolean(read('VAPID_PUBLIC_KEY') && read('VAPID_PRIVATE_KEY') && read('VAPID_SUBJECT'))
  console.log('  VAPID configured:', vapidOk)
  console.log('  PUBLIC_APP_URL:', read('PUBLIC_APP_URL') || '(not set)')
  console.log('  VAPID_SUBJECT:', read('VAPID_SUBJECT') || '(not set)')

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
