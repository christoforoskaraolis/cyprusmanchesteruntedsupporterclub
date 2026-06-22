import { query } from '../db.ts'

export const MAX_NEWS_POSTS = 8

/** Keep only the newest posts by publish date; removes older rows from Neon storage. */
export async function pruneNewsPostsToLimit(limit = MAX_NEWS_POSTS): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1) return 0

  const { rows } = await query<{ id: string }>(
    `with ranked as (
       select id,
              row_number() over (order by published_at desc, created_at desc, id desc) as rn
       from public.news_posts
     )
     delete from public.news_posts
     where id in (select id from ranked where rn > $1)
     returning id`,
    [limit],
  )

  if (rows.length > 0) {
    console.log(`[news] pruned ${rows.length} older post(s); keeping latest ${limit}`)
  }

  return rows.length
}
