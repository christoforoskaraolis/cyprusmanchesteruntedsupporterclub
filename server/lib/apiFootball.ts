import { env } from '../env.ts'

export const MAN_UNITED_TEAM_ID_DEFAULT = 33

const LIVE_STATUS = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'])
const FINISHED_STATUS = new Set(['FT', 'AET', 'PEN'])

export function apiFootballConfigured(): boolean {
  return Boolean(env.apiFootballKey)
}

export function isLiveStatus(statusShort: string | null | undefined): boolean {
  return LIVE_STATUS.has(String(statusShort ?? '').toUpperCase())
}

export function isFinishedStatus(statusShort: string | null | undefined): boolean {
  return FINISHED_STATUS.has(String(statusShort ?? '').toUpperCase())
}

export type ApiFootballFixture = {
  fixture: {
    id: number
    date: string
    status: {
      short: string
      elapsed: number | null
      long?: string
    }
  }
  league: {
    name: string
    round?: string
  }
  teams: {
    home: { id: number; name: string }
    away: { id: number; name: string }
  }
  goals: {
    home: number | null
    away: number | null
  }
  events?: ApiFootballEvent[]
}

export type ApiFootballEvent = {
  time: { elapsed: number | null; extra: number | null }
  team: { id: number; name: string }
  player: { id: number | null; name: string | null }
  assist?: { id: number | null; name: string | null }
  type: string
  detail: string
  comments?: string | null
}

type ApiFootballResponse<T> = {
  response?: T
  errors?: unknown
  message?: string
}

async function apiFootballGet<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!apiFootballConfigured()) {
    throw new Error('API_FOOTBALL_KEY is not configured')
  }

  const url = new URL(path.replace(/^\//, ''), `${env.apiFootballBaseUrl.replace(/\/+$/, '')}/`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url, {
    headers: {
      'x-apisports-key': env.apiFootballKey,
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`API-Football ${response.status}: ${text.slice(0, 200) || response.statusText}`)
  }

  const payload = (await response.json()) as ApiFootballResponse<T>
  if (payload.errors && typeof payload.errors === 'object' && Object.keys(payload.errors as object).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(payload.errors)}`)
  }
  return (payload.response ?? []) as T
}

export async function fetchLiveManchesterUnitedFixtures(): Promise<ApiFootballFixture[]> {
  const teamId = String(env.apiFootballTeamId || MAN_UNITED_TEAM_ID_DEFAULT)
  const rows = await apiFootballGet<ApiFootballFixture[]>('fixtures', {
    live: 'all',
    team: teamId,
  })
  return Array.isArray(rows) ? rows : []
}

/** Free-plan safe: uses `date` instead of Pro-only `next`. */
export async function fetchManchesterUnitedFixturesForDate(dateIso: string): Promise<ApiFootballFixture[]> {
  const teamId = String(env.apiFootballTeamId || MAN_UNITED_TEAM_ID_DEFAULT)
  const rows = await apiFootballGet<ApiFootballFixture[]>('fixtures', {
    team: teamId,
    date: dateIso,
  })
  return Array.isArray(rows) ? rows : []
}

export async function fetchFixtureById(fixtureId: number): Promise<ApiFootballFixture | null> {
  const rows = await apiFootballGet<ApiFootballFixture[]>('fixtures', {
    id: String(fixtureId),
  })
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

export function shortTeamName(name: string): string {
  const trimmed = name.trim()
  if (/manchester united/i.test(trimmed)) return 'Man Utd'
  if (/manchester city/i.test(trimmed)) return 'Man City'
  if (/tottenham/i.test(trimmed)) return 'Spurs'
  if (/nottingham forest/i.test(trimmed)) return 'Nott\'m Forest'
  if (/wolverhampton/i.test(trimmed)) return 'Wolves'
  return trimmed
}
