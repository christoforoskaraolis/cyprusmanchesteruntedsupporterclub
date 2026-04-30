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
       order by created_at desc`,
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
      `insert into public.merchandise_products (title, description, price_eur, photos, created_by, updated_by)
       values ($1, '', $2, $3::jsonb, $4, $4)`,
      [title.trim(), priceEur, JSON.stringify(Array.isArray(photos) ? photos : []), req.user!.id],
    )
    res.status(201).json({ ok: true })
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
