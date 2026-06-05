import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import { requireUser } from '../middleware/auth.ts'
import { env } from '../env.ts'
import { webPushConfigured } from '../lib/webPush.ts'

export const pushRouter = Router()

pushRouter.get(
  '/config',
  requireUser,
  asyncHandler(async (_req, res) => {
    res.json({
      enabled: webPushConfigured(),
      publicKey: webPushConfigured() ? env.vapidPublicKey : null,
    })
  }),
)

pushRouter.get(
  '/status',
  requireUser,
  asyncHandler(async (req, res) => {
    const { rows } = await query<{ n: string }>(
      `select count(*)::text as n from public.push_subscriptions where user_id = $1`,
      [req.user!.id],
    )
    res.json({ subscribed: Number(rows[0]?.n ?? 0) > 0 })
  }),
)

pushRouter.post(
  '/subscribe',
  requireUser,
  asyncHandler(async (req, res) => {
    if (!webPushConfigured()) throw badRequest('Push notifications are not configured on this server.')

    const endpoint = String(req.body?.endpoint ?? '').trim()
    const p256dh = String(req.body?.keys?.p256dh ?? '').trim()
    const authKey = String(req.body?.keys?.auth ?? '').trim()
    if (!endpoint || !p256dh || !authKey) {
      throw badRequest('endpoint and keys (p256dh, auth) are required')
    }

    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null

    await query(
      `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
       values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update
         set user_id = excluded.user_id,
             p256dh = excluded.p256dh,
             auth_key = excluded.auth_key,
             user_agent = excluded.user_agent,
             updated_at = now()`,
      [req.user!.id, endpoint, p256dh, authKey, userAgent],
    )

    res.status(201).json({ ok: true })
  }),
)

pushRouter.post(
  '/unsubscribe',
  requireUser,
  asyncHandler(async (req, res) => {
    const endpoint = String(req.body?.endpoint ?? '').trim()
    if (endpoint) {
      await query(`delete from public.push_subscriptions where user_id = $1 and endpoint = $2`, [
        req.user!.id,
        endpoint,
      ])
    } else {
      await query(`delete from public.push_subscriptions where user_id = $1`, [req.user!.id])
    }
    res.json({ ok: true })
  }),
)
