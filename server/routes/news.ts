import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import { env } from '../env.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'
import { sendNewsPushToAllSubscribers } from '../lib/webPush.ts'

type NewsRow = {
  id: string
  title: string
  body: string
  image_url: string | null
  image_url_mobile: string | null
  published_at: string
  updated_at: string
}

function mapNewsRow(r: NewsRow) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    imageUrl: r.image_url,
    imageUrlMobile: r.image_url_mobile,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  }
}

export const newsRouter = Router()

newsRouter.get(
  '/',
  requireUser,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<NewsRow>(
      `select id, title, body, image_url, image_url_mobile, published_at, updated_at
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
    const { title, body, imageUrl, imageUrlMobile, publishedAt } = req.body as {
      title?: string
      body?: string
      imageUrl?: string | null
      imageUrlMobile?: string | null
      publishedAt?: string
    }
    if (!title?.trim() || !body?.trim() || !publishedAt) {
      throw badRequest('title, body and publishedAt are required')
    }
    const { rows } = await query<{ id: string }>(
      `insert into public.news_posts (title, body, image_url, image_url_mobile, published_at, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $6)
       returning id`,
      [
        title.trim(),
        body.trim(),
        imageUrl ?? null,
        imageUrlMobile ?? null,
        publishedAt,
        req.user!.id,
      ],
    )
    const postId = rows[0]?.id
    const newsTitle = title.trim()
    const baseUrl = (env.publicAppUrl || '').replace(/\/$/, '')

    void sendNewsPushToAllSubscribers({
      title: 'New club news',
      body: newsTitle,
      url: baseUrl ? `${baseUrl}/news` : '/news',
      icon: baseUrl ? `${baseUrl}/icons/icon-192.png` : '/icons/icon-192.png',
    })
      .then((result) => {
        if (result.attempted > 0) {
          console.log(
            `[web-push] news ${postId ?? 'new'}: sent ${result.sent}/${result.attempted}, failed ${result.failed}, removed ${result.removed}`,
          )
        }
      })
      .catch((err) => console.error('[web-push] news broadcast failed:', err))

    res.status(201).json({ ok: true })
  }),
)

newsRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, body, imageUrl, imageUrlMobile, publishedAt } = req.body as {
      title?: string
      body?: string
      imageUrl?: string | null
      imageUrlMobile?: string | null
      publishedAt?: string
    }
    if (!title?.trim() || !body?.trim() || !publishedAt) {
      throw badRequest('title, body and publishedAt are required')
    }
    await query(
      `update public.news_posts
       set title = $1,
           body = $2,
           image_url = $3,
           image_url_mobile = $4,
           published_at = $5,
           updated_by = $6
       where id = $7`,
      [
        title.trim(),
        body.trim(),
        imageUrl ?? null,
        imageUrlMobile ?? null,
        publishedAt,
        req.user!.id,
        req.params.id,
      ],
    )
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
