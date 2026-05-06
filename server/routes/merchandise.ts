import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

export const merchandiseRouter = Router()

merchandiseRouter.get(
  '/products',
  requireUser,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<any>(
      `select id, title, price_eur, photos, created_at, updated_at
       from public.merchandise_products
       order by sort_order asc, created_at asc`,
    )
    res.json({
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        priceEur: Number(r.price_eur),
        photos: Array.isArray(r.photos) ? r.photos : [],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    })
  }),
)

merchandiseRouter.post(
  '/products',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, priceEur, photos } = req.body as { title: string; priceEur: number; photos: string[] }
    await query(
      `insert into public.merchandise_products (title, description, price_eur, photos, sort_order, created_by, updated_by)
       values (
         $1,
         '',
         $2,
         $3::jsonb,
         coalesce((select max(sort_order) + 1 from public.merchandise_products), 1),
         $4,
         $4
       )`,
      [title.trim(), priceEur, JSON.stringify(Array.isArray(photos) ? photos : []), req.user!.id],
    )
    res.status(201).json({ ok: true })
  }),
)

merchandiseRouter.put(
  '/products/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, priceEur, photos } = req.body as { title: string; priceEur: number; photos?: string[] }
    await query(
      `update public.merchandise_products
       set title = $1,
           price_eur = $2,
           photos = coalesce($3::jsonb, photos),
           updated_by = $4
       where id = $5`,
      [title.trim(), priceEur, photos ? JSON.stringify(photos) : null, req.user!.id, req.params.id],
    )
    res.json({ ok: true })
  }),
)

merchandiseRouter.put(
  '/products/reorder',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids are required' })
    await query('begin')
    try {
      for (let i = 0; i < ids.length; i += 1) {
        await query(
          `update public.merchandise_products
           set sort_order = $1, updated_by = $2
           where id = $3`,
          [i + 1, req.user!.id, ids[i]],
        )
      }
      await query('commit')
      res.json({ ok: true })
    } catch (error) {
      await query('rollback')
      throw error
    }
  }),
)

merchandiseRouter.delete(
  '/products/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await query(`delete from public.merchandise_products where id = $1`, [req.params.id])
    res.json({ ok: true })
  }),
)

merchandiseRouter.post(
  '/orders',
  requireUser,
  asyncHandler(async (req, res) => {
    const { lines, totalEur, deliveryBranch } = req.body as {
      lines: unknown[]
      totalEur: number
      deliveryBranch: string
    }
    await query(
      `insert into public.merchandise_orders (user_id, lines, total_eur, delivery_branch, status)
       values ($1, $2::jsonb, $3, $4, 'pending')`,
      [req.user!.id, JSON.stringify(lines ?? []), totalEur, deliveryBranch.trim()],
    )
    res.status(201).json({ ok: true })
  }),
)

merchandiseRouter.get(
  '/orders/my',
  requireUser,
  asyncHandler(async (req, res) => {
    const { rows } = await query<any>(
      `select id, user_id, lines, total_eur, delivery_branch, status, created_at
       from public.merchandise_orders where user_id = $1 order by created_at desc`,
      [req.user!.id],
    )
    res.json({
      rows: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        lines: Array.isArray(r.lines) ? r.lines : [],
        totalEur: Number(r.total_eur),
        deliveryBranch: r.delivery_branch,
        status: r.status,
        createdAt: r.created_at,
      })),
    })
  }),
)

merchandiseRouter.get(
  '/orders',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<any>(
      `select id, user_id, lines, total_eur, delivery_branch, status, created_at
       from public.merchandise_orders order by created_at desc`,
    )
    res.json({
      rows: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        lines: Array.isArray(r.lines) ? r.lines : [],
        totalEur: Number(r.total_eur),
        deliveryBranch: r.delivery_branch,
        status: r.status,
        createdAt: r.created_at,
      })),
    })
  }),
)

merchandiseRouter.put(
  '/orders/:id/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: 'pending' | 'paid' | 'cancelled' }
    await query(`update public.merchandise_orders set status = $1 where id = $2`, [status, req.params.id])
    res.json({ ok: true })
  }),
)
