import { apiGet, apiSend, asError } from './apiClient'

export type UpcomingFixture = {
  kickoffIso: string
  competition: string
  opponent: string
  home: boolean
  venue: string
}

function isUpcomingFixtureArray(value: unknown): value is UpcomingFixture[] {
  if (!Array.isArray(value)) return false
  return value.every((v) => {
    if (typeof v !== 'object' || v === null) return false
    const o = v as Record<string, unknown>
    return (
      typeof o.kickoffIso === 'string' &&
      typeof o.competition === 'string' &&
      typeof o.opponent === 'string' &&
      typeof o.home === 'boolean' &&
      typeof o.venue === 'string'
    )
  })
}

export async function fetchCachedFixtures() {
  try {
    const data = await apiGet<{ fixtures: unknown; updatedAt: string | null }>('/api/fixtures/cache')
    const fixtures = isUpcomingFixtureArray(data.fixtures) ? data.fixtures : []
    return { fixtures, updatedAt: data.updatedAt ?? null, error: undefined }
  } catch (error) {
    return { fixtures: [] as UpcomingFixture[], updatedAt: null as string | null, error: asError(error) }
  }
}

export async function upsertCachedFixtures(
  fixtures: UpcomingFixture[],
  sourceUrl: string,
  updatedBy: string | null,
) {
  void updatedBy
  try {
    await apiSend('/api/fixtures/cache', 'PUT', { fixtures, sourceUrl })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function syncFixturesFromManutd() {
  try {
    const data = await apiSend<{ ok: boolean; count: number }>('/api/fixtures/sync', 'POST')
    return { ok: data.ok, count: data.count, error: undefined }
  } catch (error) {
    return { ok: false, count: 0, error: asError(error) }
  }
}

