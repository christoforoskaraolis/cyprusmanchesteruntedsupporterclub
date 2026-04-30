import type { UpcomingFixture } from './fixturesApi.ts'
import { apiGet, apiSend, asError } from './apiClient'

export type FixtureTicketWindowStatus = 'disabled' | 'open' | 'closed'

export type FixtureTicketWindow = {
  matchKey: string
  requestStatus: FixtureTicketWindowStatus
  updatedAt: string
}

export type MyFixtureTicketRequest = {
  matchKey: string
  status: 'pending' | 'approved' | 'completed' | 'rejected' | 'cancelled'
}

export type AdminFixtureTicketRequest = {
  id: string
  matchKey: string
  userId: string
  status: 'pending' | 'approved' | 'completed' | 'rejected' | 'cancelled'
  requestedAt: string
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

export async function requestFixtureTicket(matchKey: string, userId: string) {
  void userId
  try {
    await apiSend(`/api/tickets/requests/my/${encodeURIComponent(matchKey)}`, 'POST')
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

export async function completeMyAcceptedTicketRequest(matchKey: string, userId: string) {
  void userId
  try {
    await apiSend(`/api/tickets/requests/my/${encodeURIComponent(matchKey)}/completed`, 'PUT')
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

