import { useEffect, useRef, useState } from 'react'
import {
  fetchPushConfig,
  fetchPushStatus,
  isIosDevice,
  isStandalonePwa,
  pushSupportedInBrowser,
  subscribeToNewsPush,
  unsubscribeFromNewsPush,
  updateMatchAlertPreference,
} from '../lib/pushApi.ts'

function IconBell({ filled, topbar }: { filled: boolean; topbar?: boolean }) {
  return (
    <svg
      className={topbar ? 'top-bar-icon news-push-bell-icon' : 'news-push-bell-icon'}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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

type NewsPushBellProps = {
  /** Page header (mobile News) or desktop top bar bell. */
  variant?: 'page' | 'topbar'
}

export function NewsPushBell({ variant = 'page' }: NewsPushBellProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [matchBusy, setMatchBusy] = useState(false)
  const [serverEnabled, setServerEnabled] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [matchAlerts, setMatchAlerts] = useState(false)
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
      setMatchAlerts(status.matchAlerts)
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
        setMatchAlerts(false)
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

  async function handleMatchToggle() {
    setMatchBusy(true)
    setError(null)
    setMessage(null)

    if (!subscribed) {
      const { error: subError } = await subscribeToNewsPush({ matchAlerts: true })
      if (subError) {
        setError(subError.message)
        setMatchBusy(false)
        return
      }
      setSubscribed(true)
      setMatchAlerts(true)
      setMessage('Match alerts on')
      setMatchBusy(false)
      return
    }

    const next = !matchAlerts
    const { error: prefError } = await updateMatchAlertPreference(next)
    if (prefError) setError(prefError.message)
    else {
      setMatchAlerts(next)
      setMessage(next ? 'Match alerts on' : 'Match alerts off')
    }
    setMatchBusy(false)
  }

  if (!browserSupported) return null

  const anyOn = subscribed || matchAlerts
  const bellLabel = anyOn ? 'Notification alerts on' : 'Notification alerts off'
  const isTopbar = variant === 'topbar'

  return (
    <div
      className={`news-push-bell-wrap ${isTopbar ? 'news-push-bell-wrap--topbar' : 'news-push-bell-wrap--page'}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className={
          isTopbar
            ? `top-bar-icon-btn news-push-bell-topbar-btn ${anyOn ? 'is-on is-subscribed' : ''} ${open ? 'is-open' : ''}`
            : `news-push-bell-btn ${anyOn ? 'is-on' : ''} ${open ? 'is-open' : ''}`
        }
        aria-label={bellLabel}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={loading}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell filled={anyOn} topbar={isTopbar} />
        {anyOn && <span className="news-push-bell-dot" aria-hidden />}
      </button>

      {open && (
        <div
          className={`news-push-bell-popover ${isTopbar ? 'news-push-bell-popover--topbar' : ''}`}
          role="dialog"
          aria-label="Alert settings"
        >
          <p className="news-push-bell-popover-title">Alerts</p>
          {!serverEnabled ? (
            <p className="news-push-bell-popover-text">Alerts are not configured on the server yet.</p>
          ) : (
            <>
              {ios && !standalone && !subscribed && (
                <p className="news-push-bell-ios-hint">
                  On iPhone, add this site to your Home Screen first, then turn alerts on.
                </p>
              )}

              <p className="news-push-bell-popover-text">Get notified when new club news is published.</p>
              <button
                type="button"
                className={`news-push-bell-toggle ${subscribed ? 'is-on' : ''}`}
                onClick={() => void handleToggle()}
                disabled={busy || (!subscribed && ios && !standalone)}
              >
                <span className="news-push-bell-toggle-track" aria-hidden>
                  <span className="news-push-bell-toggle-thumb" />
                </span>
                <span>{busy ? 'Updating…' : subscribed ? 'News alerts on' : 'News alerts off'}</span>
              </button>

              <p className="news-push-bell-popover-text news-push-bell-popover-text--spaced">
                Match alerts: kick-off, goals, half-time and full-time.
              </p>
              <button
                type="button"
                className={`news-push-bell-toggle ${matchAlerts ? 'is-on' : ''}`}
                onClick={() => void handleMatchToggle()}
                disabled={matchBusy || (!subscribed && ios && !standalone)}
              >
                <span className="news-push-bell-toggle-track" aria-hidden>
                  <span className="news-push-bell-toggle-thumb" />
                </span>
                <span>
                  {matchBusy ? 'Updating…' : matchAlerts ? 'Match alerts on' : 'Match alerts off'}
                </span>
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
