import { query } from '../db.ts'
import { env } from '../env.ts'
import { sendNewsPushToAllSubscribers } from './webPush.ts'

type DueNewsRow = {
  id: string
  title: string
}

function newsPushUrl(): string {
  const baseUrl = (env.publicAppUrl || '').replace(/\/$/, '')
  return baseUrl ? `${baseUrl}/news` : '/news'
}

function newsPushIcon(): string {
  const baseUrl = (env.publicAppUrl || '').replace(/\/$/, '')
  return baseUrl ? `${baseUrl}/icons/icon-192.png` : '/icons/icon-192.png'
}

/** Send push alerts for posts whose publish time has arrived. */
export async function publishDueNewsPosts(): Promise<number> {
  const { rows } = await query<DueNewsRow>(
    `select id, title
     from public.news_posts
     where push_sent_at is null
       and published_at <= now()
     order by published_at asc`,
  )

  if (rows.length === 0) return 0

  let published = 0
  for (const row of rows) {
    const result = await sendNewsPushToAllSubscribers({
      title: 'New club news',
      body: row.title,
      url: newsPushUrl(),
      icon: newsPushIcon(),
    })

    await query(`update public.news_posts set push_sent_at = now() where id = $1`, [row.id])
    published += 1

    if (result.attempted > 0) {
      console.log(
        `[web-push] scheduled news ${row.id}: sent ${result.sent}/${result.attempted}, failed ${result.failed}, removed ${result.removed}`,
      )
    }
  }

  return published
}
