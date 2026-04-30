import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

type NewsRow = {
  id: string
  title: string
  body: string
  image_url: string | null
  published_at: string
  updated_at: string
}

export const newsRouter = Router()

newsRouter.get(
  '/',
  requireUser,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<NewsRow>(
      `select id, title, body, image_url, published_at, updated_at
       from public.news_posts
       order by published_at desc`,
    )
    res.json({
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        imageUrl: r.image_url,
        publishedAt: r.published_at,
        updatedAt: r.updated_at,
      })),
    })
  }),
)

newsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, body, imageUrl, publishedAt } = req.body as {
      title?: string
      body?: string
      imageUrl?: string | null
      publishedAt?: string
    }
    if (!title?.trim() || !body?.trim() || !publishedAt) {
      throw badRequest('title, body and publishedAt are required')
    }
    await query(
      `insert into public.news_posts (title, body, image_url, published_at, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $5)`,
      [title.trim(), body.trim(), imageUrl ?? null, publishedAt, req.user!.id],
    )
    res.status(201).json({ ok: true })
  }),
)

newsRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, body, imageUrl, publishedAt } = req.body as {
      title?: string
      body?: string
      imageUrl?: string | null
      publishedAt?: string
    }
    if (!title?.trim() || !body?.trim() || !publishedAt) {
      throw badRequest('title, body and publishedAt are required')
    }
    await query(
      `update public.news_posts
       set title = $1, body = $2, image_url = $3, published_at = $4, updated_by = $5
       where id = $6`,
      [title.trim(), body.trim(), imageUrl ?? null, publishedAt, req.user!.id, req.params.id],
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
