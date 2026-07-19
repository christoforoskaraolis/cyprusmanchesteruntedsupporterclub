import { apiGet, apiSend, asError } from './apiClient'

export function pushSupportedInBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export async function fetchPushConfig() {
  try {
    const data = await apiGet<{ enabled: boolean; publicKey: string | null }>('/api/push/config')
    return { ...data, error: undefined as Error | undefined }
  } catch (error) {
    return { enabled: false, publicKey: null, error: asError(error) }
  }
}

export async function fetchPushStatus() {
  try {
    const data = await apiGet<{ subscribed: boolean; matchAlerts?: boolean }>('/api/push/status')
    return {
      subscribed: data.subscribed,
      matchAlerts: data.matchAlerts === true,
      error: undefined as Error | undefined,
    }
  } catch (error) {
    return { subscribed: false, matchAlerts: false, error: asError(error) }
  }
}

export async function subscribeToNewsPush(options?: {
  matchAlerts?: boolean
}): Promise<{ error?: Error }> {
  if (!pushSupportedInBrowser()) {
    return { error: new Error('Push notifications are not supported in this browser.') }
  }

  const { enabled, publicKey, error: configError } = await fetchPushConfig()
  if (configError) return { error: configError }
  if (!enabled || !publicKey) {
    return { error: new Error('Push notifications are not enabled on the server yet.') }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { error: new Error('Notification permission was not granted.') }
  }

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { error: new Error('Could not read push subscription from the browser.') }
  }

  try {
    await apiSend('/api/push/subscribe', 'POST', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      ...(typeof options?.matchAlerts === 'boolean' ? { matchAlerts: options.matchAlerts } : {}),
    })
    return {}
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateMatchAlertPreference(matchAlerts: boolean): Promise<{ error?: Error }> {
  try {
    await apiSend('/api/push/preferences', 'PUT', { matchAlerts })
    return {}
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function unsubscribeFromNewsPush(): Promise<{ error?: Error }> {
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    await apiSend('/api/push/unsubscribe', 'POST', {
      endpoint: subscription?.endpoint ?? null,
    })
    if (subscription) await subscription.unsubscribe()
    return {}
  } catch (error) {
    return { error: asError(error) }
  }
}
