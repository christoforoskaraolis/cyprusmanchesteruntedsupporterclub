import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import { env } from '../env.ts'
import { publishDueNewsPosts } from '../lib/publishScheduledNews.ts'
import { pruneNewsPostsToLimit } from '../lib/pruneNewsPosts.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'
import { sendNewsPushToAllSubscribers } from '../lib/webPush.ts'

type NewsRow = {
  id: string
  title: string
  body: string
  image_url: string | null
  image_url_mobile: string | null
  body_photos: unknown
  published_at: string
  updated_at: string
}

function parseBodyPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function mapNewsRow(r: NewsRow) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    imageUrl: r.image_url,
    imageUrlMobile: r.image_url_mobile,
    bodyPhotos: parseBodyPhotos(r.body_photos),
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  }
}

function parsePublishedAt(raw: string): Date {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw badRequest('publishedAt must be a valid date/time')
  }
  return date
}

function isScheduledForFuture(publishedAt: Date): boolean {
  return publishedAt.getTime() > Date.now()
}

function newsPushUrl(): string {
  const baseUrl = (env.publicAppUrl || '').replace(/\/$/, '')
  return baseUrl ? `${baseUrl}/news` : '/news'
}

function newsPushIcon(): string {
  const baseUrl = (env.publicAppUrl || '').replace(/\/$/, '')
  return baseUrl ? `${baseUrl}/icons/icon-192.png` : '/icons/icon-192.png'
}

async function sendImmediateNewsPush(postId: string, title: string): Promise<void> {
  const result = await sendNewsPushToAllSubscribers({
    title: 'New club news',
    body: title,
    url: newsPushUrl(),
    icon: newsPushIcon(),
  })
  if (result.attempted > 0) {
    console.log(
      `[web-push] news ${postId}: sent ${result.sent}/${result.attempted}, failed ${result.failed}, removed ${result.removed}`,
    )
  }
}

export const newsRouter = Router()

newsRouter.get(
  '/',
  requireUser,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<NewsRow>(
      `select id, title, body, image_url, image_url_mobile, body_photos, published_at, updated_at
       from public.news_posts
       where published_at <= now()
       order by published_at desc`,
    )
    res.json({ rows: rows.map(mapNewsRow) })
  }),
)

newsRouter.get(
  '/admin',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<NewsRow>(
      `select id, title, body, image_url, image_url_mobile, body_photos, published_at, updated_at
       from public.news_posts
       order by published_at desc`,
    )
    res.json({ rows: rows.map(mapNewsRow) })
  }),
)

newsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, body, imageUrl, imageUrlMobile, bodyPhotos, publishedAt } = req.body as {
      title?: string
      body?: string
      imageUrl?: string | null
      imageUrlMobile?: string | null
      bodyPhotos?: string[]
      publishedAt?: string
    }
    if (!title?.trim() || !body?.trim() || !publishedAt) {
      throw badRequest('title, body and publishedAt are required')
    }

    const publishAt = parsePublishedAt(publishedAt)
    const scheduled = isScheduledForFuture(publishAt)
    const photos = parseBodyPhotos(bodyPhotos)

    const { rows } = await query<{ id: string }>(
      `insert into public.news_posts (
         title, body, image_url, image_url_mobile, body_photos, published_at, created_by, updated_by, push_sent_at
       )
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $7, $8)
       returning id`,
      [
        title.trim(),
        body.trim(),
        imageUrl ?? null,
        imageUrlMobile ?? null,
        JSON.stringify(photos),
        publishAt.toISOString(),
        req.user!.id,
        scheduled ? null : new Date().toISOString(),
      ],
    )
    const postId = rows[0]?.id
    const newsTitle = title.trim()

    if (!scheduled && postId) {
      try {
        await sendImmediateNewsPush(postId, newsTitle)
      } catch (err) {
        console.error('[web-push] news broadcast failed:', err)
      }
    }

    await pruneNewsPostsToLimit()

    res.status(201).json({ ok: true, scheduled })
  }),
)

newsRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, body, imageUrl, imageUrlMobile, bodyPhotos, publishedAt } = req.body as {
      title?: string
      body?: string
      imageUrl?: string | null
      imageUrlMobile?: string | null
      bodyPhotos?: string[]
      publishedAt?: string
    }
    if (!title?.trim() || !body?.trim() || !publishedAt) {
      throw badRequest('title, body and publishedAt are required')
    }

    const publishAt = parsePublishedAt(publishedAt)
    const photos = parseBodyPhotos(bodyPhotos)

    await query(
      `update public.news_posts
       set title = $1,
           body = $2,
           image_url = $3,
           image_url_mobile = $4,
           body_photos = $5::jsonb,
           published_at = $6,
           updated_by = $7,
           push_sent_at = case
             when push_sent_at is not null then push_sent_at
             when $6::timestamptz > now() then null
             else push_sent_at
           end
       where id = $8`,
      [
        title.trim(),
        body.trim(),
        imageUrl ?? null,
        imageUrlMobile ?? null,
        JSON.stringify(photos),
        publishAt.toISOString(),
        req.user!.id,
        req.params.id,
      ],
    )

    void publishDueNewsPosts().catch((err) => console.error('[news] publish due posts failed:', err))

    res.json({ ok: true })
  }),
)

newsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await query(`delete from public.news_posts where id = $1`, [req.params.id])
    res.json({ ok: true })
  }),
)
