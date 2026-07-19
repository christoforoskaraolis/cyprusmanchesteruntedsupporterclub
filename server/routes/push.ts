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
    const { rows } = await query<{ n: string; match_alerts: boolean | null }>(
      `select count(*)::text as n,
              bool_or(match_alerts) as match_alerts
       from public.push_subscriptions
       where user_id = $1`,
      [req.user!.id],
    )
    res.json({
      subscribed: Number(rows[0]?.n ?? 0) > 0,
      matchAlerts: rows[0]?.match_alerts === true,
    })
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

    const matchAlerts =
      typeof req.body?.matchAlerts === 'boolean' ? req.body.matchAlerts : undefined
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null

    await query(
      `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent, match_alerts)
       values ($1, $2, $3, $4, $5, coalesce($6, false))
       on conflict (endpoint) do update
         set user_id = excluded.user_id,
             p256dh = excluded.p256dh,
             auth_key = excluded.auth_key,
             user_agent = excluded.user_agent,
             match_alerts = coalesce($6, public.push_subscriptions.match_alerts),
             updated_at = now()`,
      [req.user!.id, endpoint, p256dh, authKey, userAgent, matchAlerts ?? null],
    )

    res.status(201).json({ ok: true })
  }),
)

pushRouter.put(
  '/preferences',
  requireUser,
  asyncHandler(async (req, res) => {
    const matchAlerts = req.body?.matchAlerts
    if (typeof matchAlerts !== 'boolean') {
      throw badRequest('matchAlerts (boolean) is required')
    }

    const { rowCount } = await query(
      `update public.push_subscriptions
       set match_alerts = $2, updated_at = now()
       where user_id = $1`,
      [req.user!.id, matchAlerts],
    )
    if ((rowCount ?? 0) === 0) {
      throw badRequest('Turn on device alerts first, then enable match alerts.')
    }

    res.json({ ok: true, matchAlerts })
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
