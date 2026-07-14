import { Router } from 'express'
import { query, withTransaction } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { parseExternalImageUrls } from '../lib/externalImageUrl.ts'
import { badRequest } from '../lib/errors.ts'
import {
  decrementMerchandiseStock,
  parseMerchOrderLines,
  parseStockQuantity,
  restoreMerchandiseStock,
} from '../lib/merchandiseStock.ts'
import { getCachedResponse, invalidateResponseCache, RESPONSE_CACHE_TTL_MS, responseCacheKeys } from '../lib/responseCache.ts'
import { reorderSortOrderRows } from '../lib/reorderSortOrder.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

export const merchandiseRouter = Router()

merchandiseRouter.get(
  '/products',
  requireUser,
  asyncHandler(async (_req, res) => {
    const payload = await getCachedResponse(responseCacheKeys.merchandiseProducts, RESPONSE_CACHE_TTL_MS, async () => {
      const { rows } = await query<any>(
        `select id, title, price_eur, photos, stock_quantity, created_at, updated_at
         from public.merchandise_products
         order by sort_order asc, created_at asc`,
      )
      return {
        rows: rows.map((r) => ({
          id: r.id,
          title: r.title,
          priceEur: Number(r.price_eur),
          photos: Array.isArray(r.photos) ? r.photos : [],
          stockQuantity: Number(r.stock_quantity ?? 0),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      }
    })
    res.json(payload)
  }),
)

merchandiseRouter.post(
  '/products',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, priceEur, photos, stockQuantity } = req.body as {
      title: string
      priceEur: number
      photos: string[]
      stockQuantity?: unknown
    }
    const photoUrls = parseExternalImageUrls(photos)
    if (photoUrls.length === 0) throw badRequest('At least one product photo URL is required')
    const stock = parseStockQuantity(stockQuantity)
    await query(
      `insert into public.merchandise_products (title, description, price_eur, photos, stock_quantity, sort_order, created_by, updated_by)
       values (
         $1,
         '',
         $2,
         $3::jsonb,
         $4,
         coalesce((select max(sort_order) + 1 from public.merchandise_products), 1),
         $5,
         $5
       )`,
      [title.trim(), priceEur, JSON.stringify(photoUrls), stock, req.user!.id],
    )
    invalidateResponseCache(responseCacheKeys.merchandiseProducts)
    res.status(201).json({ ok: true })
  }),
)

merchandiseRouter.put(
  '/products/reorder',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids are required' })
    await reorderSortOrderRows('merchandise_products', ids, req.user!.id)
    invalidateResponseCache(responseCacheKeys.merchandiseProducts)
    res.json({ ok: true })
  }),
)

merchandiseRouter.put(
  '/products/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, priceEur, photos, stockQuantity } = req.body as {
      title: string
      priceEur: number
      photos?: string[]
      stockQuantity?: unknown
    }
    const photoUrls = photos != null ? parseExternalImageUrls(photos) : null
    if (photoUrls != null && photoUrls.length === 0) throw badRequest('At least one product photo URL is required')
    const stock = stockQuantity != null ? parseStockQuantity(stockQuantity) : null
    await query(
      `update public.merchandise_products
       set title = $1,
           price_eur = $2,
           photos = coalesce($3::jsonb, photos),
           stock_quantity = coalesce($4, stock_quantity),
           updated_by = $5
       where id = $6`,
      [title.trim(), priceEur, photoUrls ? JSON.stringify(photoUrls) : null, stock, req.user!.id, req.params.id],
    )
    invalidateResponseCache(responseCacheKeys.merchandiseProducts)
    res.json({ ok: true })
  }),
)

merchandiseRouter.delete(
  '/products/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await query(`delete from public.merchandise_products where id = $1`, [req.params.id])
    invalidateResponseCache(responseCacheKeys.merchandiseProducts)
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
    const parsedLines = parseMerchOrderLines(lines)
    const branch = deliveryBranch.trim()
    if (!branch) throw badRequest('Delivery branch is required')

    await withTransaction(async (client) => {
      await decrementMerchandiseStock(client, parsedLines)
      await client.query(
        `insert into public.merchandise_orders (user_id, lines, total_eur, delivery_branch, status)
         values ($1, $2::jsonb, $3, $4, 'pending')`,
        [req.user!.id, JSON.stringify(lines ?? []), totalEur, branch],
      )
    })

    invalidateResponseCache(responseCacheKeys.merchandiseProducts)
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
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ status: string; lines: unknown }>(
        `select status, lines from public.merchandise_orders where id = $1 for update`,
        [req.params.id],
      )
      const existing = rows[0]
      if (!existing) throw badRequest('Order not found')

      if (status === 'cancelled' && existing.status === 'pending') {
        await restoreMerchandiseStock(client, parseMerchOrderLines(existing.lines))
      }

      await client.query(`update public.merchandise_orders set status = $1 where id = $2`, [status, req.params.id])
    })

    if (status === 'cancelled') {
      invalidateResponseCache(responseCacheKeys.merchandiseProducts)
    }
    res.json({ ok: true })
  }),
)
