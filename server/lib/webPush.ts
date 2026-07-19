import webpush from 'web-push'
import { env } from '../env.ts'
import { query } from '../db.ts'

export type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth_key: string
}

export function webPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject)
}

function ensureVapid(): void {
  if (!webPushConfigured()) {
    throw new Error(
      '[server] Web push is not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.',
    )
  }
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey)
}

export type NewsPushPayload = {
  title: string
  body: string
  url: string
  icon?: string
}

export type MatchPushPayload = NewsPushPayload

function rowToSubscription(row: PushSubscriptionRow): webpush.PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth_key,
    },
  }
}

async function sendPushToRows(
  rows: PushSubscriptionRow[],
  payload: NewsPushPayload,
): Promise<{ attempted: number; sent: number; failed: number; removed: number }> {
  if (!webPushConfigured()) {
    console.warn('[web-push] Skipping push — VAPID keys not configured')
    return { attempted: 0, sent: 0, failed: 0, removed: 0 }
  }

  ensureVapid()

  let sent = 0
  let failed = 0
  let removed = 0
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    icon: payload.icon ?? '/icons/icon-192.png',
  })

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(rowToSubscription(row), body)
        sent += 1
      } catch (err) {
        failed += 1
        const status = typeof err === 'object' && err !== null && 'statusCode' in err ? Number(err.statusCode) : 0
        if (status === 404 || status === 410) {
          await query(`delete from public.push_subscriptions where id = $1`, [row.id])
          removed += 1
        } else {
          console.error('[web-push] send failed:', row.endpoint.slice(0, 48), err)
        }
      }
    }),
  )

  return { attempted: rows.length, sent, failed, removed }
}

export async function sendNewsPushToAllSubscribers(payload: NewsPushPayload): Promise<{
  attempted: number
  sent: number
  failed: number
  removed: number
}> {
  const { rows } = await query<PushSubscriptionRow>(
    `select id, user_id, endpoint, p256dh, auth_key from public.push_subscriptions`,
  )
  return sendPushToRows(rows, payload)
}

export async function sendMatchPushToOptedIn(payload: MatchPushPayload): Promise<{
  attempted: number
  sent: number
  failed: number
  removed: number
}> {
  const { rows } = await query<PushSubscriptionRow>(
    `select id, user_id, endpoint, p256dh, auth_key
     from public.push_subscriptions
     where match_alerts = true`,
  )
  return sendPushToRows(rows, payload)
}
