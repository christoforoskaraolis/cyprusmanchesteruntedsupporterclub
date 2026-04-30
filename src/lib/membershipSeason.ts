/** Season marketing years (1 June startYear → 31 May endYear). Update when the cycle changes. */
export const MEMBERSHIP_DISPLAY_START_YEAR = 2026
export const MEMBERSHIP_DISPLAY_END_YEAR = 2027

/** ISO date (YYYY-MM-DD) for last day of the current configured season. */
export function defaultMembershipValidUntilIso(): string {
  return `${MEMBERSHIP_DISPLAY_END_YEAR}-05-31`
}

export function parseIsoDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatValidUntilLabel(iso: string): string {
  const end = parseIsoDateOnly(iso)
  return end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Renewal notice: from the 1st of the month containing valid_until through valid_until (inclusive). */
export function renewalNoticeStart(validUntilIso: string): Date {
  const end = parseIsoDateOnly(validUntilIso)
  return new Date(end.getFullYear(), end.getMonth(), 1)
}

export function isInRenewalNoticeWindow(validUntilIso: string, now = new Date()): boolean {
  const start = renewalNoticeStart(validUntilIso)
  const end = parseIsoDateOnly(validUntilIso)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  const t = now.getTime()
  return t >= start.getTime() && t <= end.getTime()
}

/** Next season end: 31 May one year after the current valid_until year. */
export function nextSeasonValidUntilIso(currentValidUntilIso: string): string {
  const end = parseIsoDateOnly(currentValidUntilIso)
  return `${end.getFullYear() + 1}-05-31`
}

/** Club year paid for by a renewal after valid_until (e.g. after 31 May 2027 → 1 Jun 2027 – 31 May 2028). */
export function nextSeasonPeriodLabels(validUntilIso: string): { start: string; end: string } {
  const d = parseIsoDateOnly(validUntilIso)
  const y = d.getFullYear()
  const seasonStart = new Date(y, 5, 1)
  const seasonEnd = new Date(y + 1, 4, 31)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  return {
    start: seasonStart.toLocaleDateString('en-GB', opts),
    end: seasonEnd.toLocaleDateString('en-GB', opts),
  }
}
