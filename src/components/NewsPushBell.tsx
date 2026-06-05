import { useEffect, useRef, useState } from 'react'
import {
  fetchPushConfig,
  fetchPushStatus,
  isIosDevice,
  isStandalonePwa,
  pushSupportedInBrowser,
  subscribeToNewsPush,
  unsubscribeFromNewsPush,
} from '../lib/pushApi.ts'

function IconBell({ filled }: { filled: boolean }) {
  return (
    <svg className="news-push-bell-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 22a2.2 2.2 0 0 0 2.1-1.55H9.9A2.2 2.2 0 0 0 12 22Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M18 16.5v-4.9c0-3.1-2.1-5.7-5-6.4V4.6a1.5 1.5 0 0 0-3 0v.6c-2.9.7-5 3.3-5 6.4v4.9L4 18v.5h16v-.5l-2-1.5Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function NewsPushBell() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
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

  useEffect(() => {
    if (!open) return
    function onDocClick(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  async function handleToggle() {
    setBusy(true)
    setError(null)
    setMessage(null)
    if (subscribed) {
      const { error: unsubError } = await unsubscribeFromNewsPush()
      if (unsubError) setError(unsubError.message)
      else {
        setSubscribed(false)
        setMessage('Alerts off')
      }
    } else {
      const { error: subError } = await subscribeToNewsPush()
      if (subError) {
        setError(subError.message)
        setSubscribed(false)
      } else {
        setSubscribed(true)
        setMessage('Alerts on')
      }
    }
    setBusy(false)
  }

  if (!browserSupported) return null

  const bellLabel = subscribed ? 'News alerts on' : 'News alerts off'

  return (
    <div className="news-push-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`news-push-bell-btn ${subscribed ? 'is-on' : ''} ${open ? 'is-open' : ''}`}
        aria-label={bellLabel}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={loading}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell filled={subscribed} />
        {subscribed && <span className="news-push-bell-dot" aria-hidden />}
      </button>

      {open && (
        <div className="news-push-bell-popover" role="dialog" aria-label="News alert settings">
          <p className="news-push-bell-popover-title">News alerts</p>
          {!serverEnabled ? (
            <p className="news-push-bell-popover-text">Alerts are not configured on the server yet.</p>
          ) : (
            <>
              <p className="news-push-bell-popover-text">
                {subscribed ? 'Phone alerts are on for this device.' : 'Get notified when new club news is published.'}
              </p>
              {ios && !standalone && !subscribed && (
                <p className="news-push-bell-ios-hint">
                  On iPhone, add this site to your Home Screen first, then turn alerts on.
                </p>
              )}
              <button
                type="button"
                className={`news-push-bell-toggle ${subscribed ? 'is-on' : ''}`}
                onClick={() => void handleToggle()}
                disabled={busy || (!subscribed && ios && !standalone)}
              >
                <span className="news-push-bell-toggle-track" aria-hidden>
                  <span className="news-push-bell-toggle-thumb" />
                </span>
                <span>{busy ? 'Updating…' : subscribed ? 'Alerts on' : 'Alerts off'}</span>
              </button>
            </>
          )}
          {message && <p className="news-push-bell-feedback is-success">{message}</p>}
          {error && <p className="news-push-bell-feedback is-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
