import { query } from '../db.ts'
import {
  apiFootballConfigured,
  fetchFixtureById,
  fetchLiveManchesterUnitedFixtures,
  fetchNextManchesterUnitedFixtures,
  isFinishedStatus,
  isLiveStatus,
  shortTeamName,
  type ApiFootballEvent,
  type ApiFootballFixture,
} from './apiFootball.ts'
import { sendMatchPushToOptedIn } from './webPush.ts'

type LivescoreRow = {
  fixture_id: number | null
  status_short: string | null
  elapsed: number | null
  home_team: string | null
  away_team: string | null
  home_goals: number | null
  away_goals: number | null
  competition: string | null
  kickoff_at: string | null
  is_live: boolean
  updated_at: string
}

let watcherStarted = false
let tickInFlight = false
let nextTickTimer: ReturnType<typeof setTimeout> | null = null

function formatMinute(elapsed: number | null | undefined, extra?: number | null): string {
  if (elapsed == null || !Number.isFinite(elapsed)) return ''
  if (extra != null && extra > 0) return `${elapsed}+${extra}'`
  return `${elapsed}'`
}

function goalEventKey(event: ApiFootballEvent): string {
  const elapsed = event.time?.elapsed ?? 0
  const extra = event.time?.extra ?? 0
  const teamId = event.team?.id ?? 0
  const playerId = event.player?.id ?? 0
  const playerName = (event.player?.name ?? '').trim().toLowerCase()
  const detail = (event.detail ?? '').trim().toLowerCase()
  return `goal:${elapsed}:${extra}:${teamId}:${playerId}:${playerName}:${detail}`
}

async function alreadyNotified(fixtureId: number, eventKey: string): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    `select count(*)::text as n
     from public.livescore_notified_events
     where fixture_id = $1 and event_key = $2`,
    [fixtureId, eventKey],
  )
  return Number(rows[0]?.n ?? 0) > 0
}

async function markNotified(fixtureId: number, eventKey: string): Promise<boolean> {
  const { rowCount } = await query(
    `insert into public.livescore_notified_events (fixture_id, event_key)
     values ($1, $2)
     on conflict (fixture_id, event_key) do nothing`,
    [fixtureId, eventKey],
  )
  return (rowCount ?? 0) > 0
}

async function notifyOnce(
  fixtureId: number,
  eventKey: string,
  title: string,
  body: string,
): Promise<void> {
  if (await alreadyNotified(fixtureId, eventKey)) return
  const inserted = await markNotified(fixtureId, eventKey)
  if (!inserted) return
  const result = await sendMatchPushToOptedIn({
    title,
    body,
    url: '/',
  })
  console.log(
    `[livescore] push ${eventKey}: sent ${result.sent}/${result.attempted}, failed ${result.failed}`,
  )
}

function scoreLine(fixture: ApiFootballFixture): string {
  const home = shortTeamName(fixture.teams.home.name)
  const away = shortTeamName(fixture.teams.away.name)
  const hg = fixture.goals.home ?? 0
  const ag = fixture.goals.away ?? 0
  return `${home} ${hg}–${ag} ${away}`
}

async function upsertCurrent(fixture: ApiFootballFixture): Promise<void> {
  const status = fixture.fixture.status.short
  await query(
    `update public.livescore_current
     set fixture_id = $1,
         status_short = $2,
         elapsed = $3,
         home_team = $4,
         away_team = $5,
         home_goals = $6,
         away_goals = $7,
         competition = $8,
         kickoff_at = $9::timestamptz,
         is_live = $10,
         payload = $11::jsonb,
         updated_at = now()
     where id = 1`,
    [
      fixture.fixture.id,
      status,
      fixture.fixture.status.elapsed,
      fixture.teams.home.name,
      fixture.teams.away.name,
      fixture.goals.home,
      fixture.goals.away,
      fixture.league.name,
      fixture.fixture.date,
      isLiveStatus(status),
      JSON.stringify(fixture),
    ],
  )
}

async function clearCurrentIfStale(): Promise<void> {
  await query(
    `update public.livescore_current
     set fixture_id = null,
         status_short = null,
         elapsed = null,
         home_team = null,
         away_team = null,
         home_goals = null,
         away_goals = null,
         competition = null,
         kickoff_at = null,
         is_live = false,
         payload = '{}'::jsonb,
         updated_at = now()
     where id = 1
       and fixture_id is not null
       and (
         (is_live = false and status_short in ('FT', 'AET', 'PEN') and updated_at < now() - interval '3 hours')
         or (is_live = false and status_short is not null and status_short not in ('FT', 'AET', 'PEN') and updated_at < now() - interval '30 minutes')
       )`,
  )
}

async function processFixtureNotifications(fixture: ApiFootballFixture): Promise<void> {
  const fixtureId = fixture.fixture.id
  const status = fixture.fixture.status.short.toUpperCase()
  const line = scoreLine(fixture)

  if (isLiveStatus(status) || isFinishedStatus(status)) {
    await notifyOnce(fixtureId, 'kickoff', 'Match kicked off', `${line} has started.`)
  }

  const events = Array.isArray(fixture.events) ? fixture.events : []
  for (const event of events) {
    if (event.type !== 'Goal') continue
    if (/missed penalty/i.test(event.detail ?? '')) continue

    const eventKey = goalEventKey(event)
    const scorer = event.player?.name?.trim() || 'Unknown'
    const minute = formatMinute(event.time?.elapsed, event.time?.extra)
    const team = shortTeamName(event.team?.name ?? '')
    const detail = /own goal/i.test(event.detail ?? '')
      ? ' (OG)'
      : /penalty/i.test(event.detail ?? '')
        ? ' (pen)'
        : ''
    const body = minute
      ? `GOAL! ${line} — ${scorer}${detail} (${team}) ${minute}`
      : `GOAL! ${line} — ${scorer}${detail} (${team})`
    await notifyOnce(fixtureId, eventKey, 'Goal!', body)
  }

  if (status === 'HT') {
    await notifyOnce(fixtureId, 'ht', 'Half-time', `HT: ${line}`)
  }

  if (isFinishedStatus(status)) {
    await notifyOnce(fixtureId, 'ft', 'Full-time', `FT: ${line}`)
  }
}

async function loadStored(): Promise<LivescoreRow | null> {
  const { rows } = await query<LivescoreRow>(
    `select fixture_id, status_short, elapsed, home_team, away_team, home_goals, away_goals,
            competition, kickoff_at, is_live, updated_at
     from public.livescore_current
     where id = 1`,
  )
  return rows[0] ?? null
}

function msUntilNextPoll(options: { hasLive: boolean; kickoffSoon: boolean }): number {
  if (options.hasLive) return 45_000
  if (options.kickoffSoon) return 60_000
  return 5 * 60_000
}

function kickoffWithinMinutes(fixture: ApiFootballFixture, minutes: number): boolean {
  const kickoff = new Date(fixture.fixture.date).getTime()
  if (!Number.isFinite(kickoff)) return false
  const delta = kickoff - Date.now()
  return delta <= minutes * 60_000 && delta >= -15 * 60_000
}

async function tick(): Promise<{ hasLive: boolean; kickoffSoon: boolean }> {
  if (!apiFootballConfigured()) {
    return { hasLive: false, kickoffSoon: false }
  }

  await clearCurrentIfStale()

  const live = await fetchLiveManchesterUnitedFixtures()
  if (live.length > 0) {
    const fixture = live[0]!
    await upsertCurrent(fixture)
    await processFixtureNotifications(fixture)
    return { hasLive: true, kickoffSoon: false }
  }

  const stored = await loadStored()
  if (stored?.fixture_id && stored.is_live) {
    const refreshed = await fetchFixtureById(stored.fixture_id)
    if (refreshed) {
      await upsertCurrent(refreshed)
      await processFixtureNotifications(refreshed)
      return {
        hasLive: isLiveStatus(refreshed.fixture.status.short),
        kickoffSoon: false,
      }
    }
  }

  if (stored?.fixture_id && isFinishedStatus(stored.status_short) && !stored.is_live) {
    // Keep FT on homepage until stale cleaner removes it.
  } else if (!stored?.fixture_id || (!stored.is_live && !isFinishedStatus(stored.status_short))) {
    // No live match — optionally seed upcoming kickoff soon display? Skip UI until live.
  }

  let kickoffSoon = false
  try {
    const upcoming = await fetchNextManchesterUnitedFixtures(2)
    kickoffSoon = upcoming.some((f) => kickoffWithinMinutes(f, 30))
  } catch (err) {
    console.warn('[livescore] upcoming fixtures check failed:', err)
  }

  return { hasLive: false, kickoffSoon }
}

async function scheduleNext(delayMs: number): Promise<void> {
  if (nextTickTimer) clearTimeout(nextTickTimer)
  nextTickTimer = setTimeout(() => {
    void runTick()
  }, delayMs)
}

async function runTick(): Promise<void> {
  if (tickInFlight) return
  tickInFlight = true
  try {
    const result = await tick()
    await scheduleNext(msUntilNextPoll(result))
  } catch (err) {
    console.error('[livescore] tick failed:', err)
    await scheduleNext(2 * 60_000)
  } finally {
    tickInFlight = false
  }
}

export function startLivescoreWatcher(): void {
  if (watcherStarted) return
  watcherStarted = true

  if (!apiFootballConfigured()) {
    console.warn('[livescore] API_FOOTBALL_KEY not set — live score watcher disabled')
    return
  }

  console.log('[livescore] watcher started')
  void runTick()
}

export type PublicLivescore = {
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

export async function getPublicLivescore(): Promise<PublicLivescore> {
  const stored = await loadStored()
  if (!stored?.fixture_id || !stored.home_team || !stored.away_team) {
    return {
      active: false,
      fixtureId: null,
      statusShort: null,
      elapsed: null,
      homeTeam: null,
      awayTeam: null,
      homeGoals: null,
      awayGoals: null,
      competition: null,
      kickoffAt: null,
      isLive: false,
      label: null,
      updatedAt: null,
    }
  }

  const showFinished =
    isFinishedStatus(stored.status_short) &&
    stored.updated_at &&
    Date.now() - new Date(stored.updated_at).getTime() < 3 * 60 * 60 * 1000

  const active = stored.is_live || Boolean(showFinished)
  if (!active) {
    return {
      active: false,
      fixtureId: stored.fixture_id,
      statusShort: stored.status_short,
      elapsed: stored.elapsed,
      homeTeam: stored.home_team,
      awayTeam: stored.away_team,
      homeGoals: stored.home_goals,
      awayGoals: stored.away_goals,
      competition: stored.competition,
      kickoffAt: stored.kickoff_at,
      isLive: false,
      label: null,
      updatedAt: stored.updated_at,
    }
  }

  const home = shortTeamName(stored.home_team)
  const away = shortTeamName(stored.away_team)
  const hg = stored.home_goals ?? 0
  const ag = stored.away_goals ?? 0
  const status = (stored.status_short ?? '').toUpperCase()
  let clock = ''
  if (stored.is_live && status === 'HT') clock = 'HT'
  else if (stored.is_live && stored.elapsed != null) clock = formatMinute(stored.elapsed)
  else if (isFinishedStatus(status)) clock = 'FT'

  const label = clock
    ? `${home} ${hg}–${ag} ${away} · ${clock}`
    : `${home} ${hg}–${ag} ${away}`

  return {
    active: true,
    fixtureId: stored.fixture_id,
    statusShort: stored.status_short,
    elapsed: stored.elapsed,
    homeTeam: stored.home_team,
    awayTeam: stored.away_team,
    homeGoals: stored.home_goals,
    awayGoals: stored.away_goals,
    competition: stored.competition,
    kickoffAt: stored.kickoff_at,
    isLive: stored.is_live,
    label,
    updatedAt: stored.updated_at,
  }
}
