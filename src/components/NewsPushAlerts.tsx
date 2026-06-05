import { useEffect, useState } from 'react'
import {
  fetchPushConfig,
  fetchPushStatus,
  isIosDevice,
  isStandalonePwa,
  pushSupportedInBrowser,
  subscribeToNewsPush,
  unsubscribeFromNewsPush,
} from '../lib/pushApi.ts'

export function NewsPushAlerts() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [serverEnabled, setServerEnabled] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const browserSupported = pushSupportedInBrowser()
  const ios = isIosDevice()
  const standalone = isStandalonePwa()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!browserSupported) {
        setLoading(false)
        return
      }
      const [config, status] = await Promise.all([fetchPushConfig(), fetchPushStatus()])
      if (cancelled) return
      setServerEnabled(config.enabled)
      setSubscribed(status.subscribed)
      if (config.error) setError(config.error.message)
      else if (status.error) setError(status.error.message)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [browserSupported])

  async function handleEnable() {
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: subError } = await subscribeToNewsPush()
    if (subError) {
      setError(subError.message)
      setSubscribed(false)
    } else {
      setSubscribed(true)
      setMessage('News alerts are on for this device.')
    }
    setBusy(false)
  }

  async function handleDisable() {
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: unsubError } = await unsubscribeFromNewsPush()
    if (unsubError) {
      setError(unsubError.message)
    } else {
      setSubscribed(false)
      setMessage('News alerts turned off on this device.')
    }
    setBusy(false)
  }

  if (!browserSupported) {
    return (
      <section className="news-push-card" aria-label="News alerts">
        <h2 className="news-push-card-title">News alerts</h2>
        <p className="news-push-lead">
          Push notifications are not available in this browser. Try Chrome on Android, or add the site to your iPhone
          Home Screen and open it from there.
        </p>
      </section>
    )
  }

  return (
    <section className="news-push-card" aria-label="News alerts">
      <h2 className="news-push-card-title">News alerts</h2>
      <p className="news-push-lead">
        Get a phone alert when the club publishes news. You can turn this off anytime.
      </p>

      {ios && !standalone && (
        <p className="news-push-ios-hint" role="note">
          On iPhone: open this site in <strong>Safari</strong>, tap Share, then <strong>Add to Home Screen</strong>.
          Open the app from your home screen, then enable alerts here.
        </p>
      )}

      {loading ? (
        <p className="news-push-status">Checking alert settings…</p>
      ) : !serverEnabled ? (
        <p className="news-push-status">Push alerts are not configured on the server yet.</p>
      ) : subscribed ? (
        <>
          <p className="news-push-status news-push-status--on">Alerts enabled on this device</p>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={() => void handleDisable()}
            disabled={busy}
          >
            {busy ? 'Updating…' : 'Turn off alerts'}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="mycmusc-reg-btn mycmusc-reg-btn--primary"
          onClick={() => void handleEnable()}
          disabled={busy || (ios && !standalone)}
        >
          {busy ? 'Enabling…' : 'Enable news alerts'}
        </button>
      )}

      {message && <p className="auth-message is-success">{message}</p>}
      {error && <p className="auth-message is-error">{error}</p>}
    </section>
  )
}
