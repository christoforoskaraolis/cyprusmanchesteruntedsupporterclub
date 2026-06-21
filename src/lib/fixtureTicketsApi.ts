import type { OfficialMuMembershipStatus } from './membershipApi.ts'
import type { UpcomingFixture } from './fixturesApi.ts'
import { apiGet, apiSend, asError } from './apiClient'

export type FixtureTicketWindowStatus = 'disabled' | 'open' | 'closed'

export type FixtureTicketWindow = {
  matchKey: string
  requestStatus: FixtureTicketWindowStatus
  updatedAt: string
  maxTickets: number | null
  activeRequestCount: number
}

export type MyFixtureTicketRequest = {
  matchKey: string
  status: 'pending' | 'approved' | 'completed' | 'rejected' | 'cancelled'
  depositConfirmed: boolean
  userCancelledAt: string | null
  balanceRemainingAmountEur: number | null
  balancePaymentNotified: boolean
  balancePaymentDeadline: string | null
  ticketConfirmed: boolean
  ticketSlotCount: number
  travelCompanionCount: number
}

export type FixtureTicketTravelCompanion = {
  membershipNumber: number
  fullName: string | null
  mobilePhone: string | null
  email: string | null
  officialMuMembershipId: string | null
  officialMuMembershipStatus: OfficialMuMembershipStatus | null
}

export type AdminFixtureTicketRequest = {
  id: string
  matchKey: string
  userId: string
  status: 'pending' | 'approved' | 'completed' | 'rejected' | 'cancelled'
  requestedAt: string
  depositConfirmed: boolean
  depositConfirmedAt: string | null
  userCancelledAt: string | null
  balanceRemainingAmountEur: number | null
  balancePaymentNotified: boolean
  balancePaymentNotifiedAt: string | null
  balancePaymentDeadline: string | null
  ticketConfirmed: boolean
  ticketConfirmedAt: string | null
  travelCompanions: FixtureTicketTravelCompanion[]
  user: {
    fullName: string | null
    mobilePhone: string | null
    officialMuMembershipId: string | null
    officialMuMembershipStatus: OfficialMuMembershipStatus | null
    applicationId: string | null
  }
}

export function parseFixtureMatchKey(matchKey: string): {
  kickoffIso: string
  competition: string
  opponent: string
  home: boolean
  venue: string
} | null {
  const parts = matchKey.split('|')
  if (parts.length < 5) return null
  const [kickoffIso, competition, opponent, homeAway, ...venueParts] = parts
  if (!kickoffIso || !competition || !opponent || !homeAway) return null
  return {
    kickoffIso,
    competition,
    opponent,
    home: homeAway === 'H',
    venue: venueParts.join('|'),
  }
}

export function formatFixtureMatchKeyLabel(matchKey: string): string {
  const parsed = parseFixtureMatchKey(matchKey)
  if (!parsed) return matchKey
  if (parsed.home) return `Manchester United vs ${parsed.opponent}`
  return `${parsed.opponent} vs Manchester United`
}

export function fixtureMatchKey(f: UpcomingFixture): string {
  return `${f.kickoffIso}|${f.competition}|${f.opponent}|${f.home ? 'H' : 'A'}|${f.venue}`
}

export async function fetchFixtureTicketWindows(matchKeys: string[]) {
  if (matchKeys.length === 0) return { rows: [] as FixtureTicketWindow[], error: undefined }
  try {
    const data = await apiSend<{ rows: FixtureTicketWindow[] }>('/api/tickets/windows/list', 'POST', { matchKeys })
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as FixtureTicketWindow[], error: asError(error) }
  }
}

export async function upsertFixtureTicketWindow(
  fixture: UpcomingFixture,
  status: FixtureTicketWindowStatus,
  updatedBy: string | null,
) {
  const matchKey = fixtureMatchKey(fixture)
  void updatedBy
  try {
    await apiSend(`/api/tickets/windows/${encodeURIComponent(matchKey)}`, 'PUT', { fixture, status })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateFixtureTicketWindowMaxTickets(
  fixture: UpcomingFixture,
  maxTickets: number | null,
) {
  const matchKey = fixtureMatchKey(fixture)
  try {
    const data = await apiSend<{
      requestStatus: FixtureTicketWindowStatus
      maxTickets: number | null
      activeRequestCount: number
    }>(`/api/tickets/windows/${encodeURIComponent(matchKey)}/max-tickets`, 'PUT', { fixture, maxTickets })
    return { data, error: undefined }
  } catch (error) {
    return { data: undefined, error: asError(error) }
  }
}

export async function fetchMyFixtureTicketRequests(matchKeys: string[], userId: string) {
  void userId
  if (matchKeys.length === 0) return { rows: [] as MyFixtureTicketRequest[], error: undefined }
  try {
    const data = await apiSend<{ rows: MyFixtureTicketRequest[] }>('/api/tickets/requests/my/list', 'POST', {
      matchKeys,
    })
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as MyFixtureTicketRequest[], error: asError(error) }
  }
}

export async function requestFixtureTicket(
  matchKey: string,
  userId: string,
  options?: { travelCompanionMembershipNumbers?: number[] },
) {
  void userId
  try {
    await apiSend(`/api/tickets/requests/my/${encodeURIComponent(matchKey)}`, 'POST', options ?? {})
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function fetchPendingFixtureTicketRequests() {
  try {
    const data = await apiGet<{ rows: AdminFixtureTicketRequest[] }>('/api/tickets/requests/admin')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as AdminFixtureTicketRequest[], error: asError(error) }
  }
}

export async function setFixtureTicketRequestStatus(
  requestId: string,
  status: 'approved' | 'completed' | 'cancelled',
) {
  try {
    await apiSend(`/api/tickets/requests/${requestId}/status`, 'PUT', { status })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateFixtureTicketRequestDepositConfirmed(requestId: string, depositConfirmed: boolean) {
  try {
    await apiSend(`/api/tickets/requests/${requestId}/deposit-confirmed`, 'PUT', { depositConfirmed })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function cancelMyFixtureTicketRequest(matchKey: string, userId: string) {
  void userId
  try {
    await apiSend(`/api/tickets/requests/my/${encodeURIComponent(matchKey)}/cancel`, 'PUT')
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateFixtureTicketRequestBalancePayment(
  requestId: string,
  options: {
    balanceRemainingAmountEur?: number | null
    balancePaymentDeadline?: string | null
    balancePaymentNotified: boolean
  },
) {
  try {
    await apiSend(`/api/tickets/requests/${requestId}/balance-payment`, 'PUT', options)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateFixtureTicketRequestTicketConfirmed(requestId: string) {
  try {
    await apiSend(`/api/tickets/requests/${requestId}/ticket-confirmed`, 'PUT', { ticketConfirmed: true })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function completeMyAcceptedTicketRequest(matchKey: string, userId: string) {
  void userId
  try {
    await apiSend(`/api/tickets/requests/my/${encodeURIComponent(matchKey)}/completed`, 'PUT')
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

