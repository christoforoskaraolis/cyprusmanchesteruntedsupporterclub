import { apiGet, asError } from './apiClient'

export type PublicLivescore = {
  configured: boolean
  active: boolean
  fixtureId: number | null
  statusShort: string | null
  elapsed: number | null
  homeTeam: string | null
  awayTeam: string | null
  homeGoals: number | null
  awayGoals: number | null
  competition: string | null
  kickoffAt: string | null
  isLive: boolean
  label: string | null
  updatedAt: string | null
}

export async function fetchCurrentLivescore() {
  try {
    const data = await apiGet<PublicLivescore>('/api/livescore/current')
    return { livescore: data, error: undefined as Error | undefined }
  } catch (error) {
    return { livescore: null as PublicLivescore | null, error: asError(error) }
  }
}
