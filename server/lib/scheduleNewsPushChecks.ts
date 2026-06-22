import { publishDueNewsPosts } from './publishScheduledNews.ts'

const HOURLY_PUSH_CHECK_MS = 60 * 60 * 1000

/** Run publishDueNewsPosts() every hour for scheduled news notifications. */
export function startScheduledNewsPushChecks(): void {
  console.log('[news] Hourly push checks enabled (every 60 minutes)')
  setInterval(() => {
    void publishDueNewsPosts().catch((err) => console.error('[news] hourly push check failed:', err))
  }, HOURLY_PUSH_CHECK_MS)
}
