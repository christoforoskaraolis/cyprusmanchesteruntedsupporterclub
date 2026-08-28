import { Router } from 'express'
import { query, pool } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import { type FixtureSummary } from '../lib/fixtureMatchKey.ts'
import { remapRescheduledFixtureMatchKeys } from '../lib/remapRescheduledFixtureMatchKeys.ts'
import { getCachedResponse, invalidateResponseCache, RESPONSE_CACHE_TTL_MS, responseCacheKeys } from '../lib/responseCache.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

export const fixturesRouter = Router()
const MANUTD_ICS_URL = 'https://www.manutd.com/en/Manchester_United.ics'
const MANUTD_LEAGUE_CUP_FIXTURES_URL = 'https://www.manutd.com/en/matches/mens-team/fixtures/league-cup'
const MU_TEAM_PATTERN = '(?:Manchester United|Man Utd)'

type ParsedFixtureSummary = {
  opponent: string
  home: boolean
  competition?: string
}

/** Normalize sponsor/official names so League Cup matches merge cleanly. */
function normalizeCompetitionName(raw: string): string {
  const value = raw.replace(/\\,/g, ',').trim()
  if (!value) return 'Match'
  const lower = value.toLowerCase()
  if (
    lower.includes('league cup') ||
    lower.includes('carabao') ||
    lower === 'efl cup' ||
    lower.includes('efl cup')
  ) {
    return 'League Cup'
  }
  return value
}

function fixtureDedupeKey(fixture: UpcomingFixture): string {
  const day = fixture.kickoffIso.slice(0, 10)
  return `${day}|${normalizeCompetitionName(fixture.competition).toLowerCase()}|${fixture.opponent.trim().toLowerCase()}|${fixture.home ? 'H' : 'A'}`
}

function mergeFixtures(primary: UpcomingFixture[], extras: UpcomingFixture[]): UpcomingFixture[] {
  const byKey = new Map<string, UpcomingFixture>()
  for (const fixture of primary) {
    byKey.set(fixtureDedupeKey(fixture), {
      ...fixture,
      competition: normalizeCompetitionName(fixture.competition),
    })
  }
  for (const fixture of extras) {
    const normalized = {
      ...fixture,
      competition: normalizeCompetitionName(fixture.competition),
    }
    const key = fixtureDedupeKey(normalized)
    if (!byKey.has(key)) byKey.set(key, normalized)
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(a.kickoffIso).getTime() - new Date(b.kickoffIso).getTime(),
  )
}

function parseFixtureFromSummary(summary: string): ParsedFixtureSummary | null {
  const clean = summary.replace(/\s+/g, ' ').trim()
  let mainPart = clean
  let competitionFromSummary: string | undefined

  const dashIdx = clean.lastIndexOf(' - ')
  if (dashIdx > 0) {
    mainPart = clean.slice(0, dashIdx).trim()
    competitionFromSummary = clean.slice(dashIdx + 3).trim()
  }

  const homeMatch = mainPart.match(new RegExp(`^${MU_TEAM_PATTERN}\\s+v(?:s)?\\.?\\s+(.+)$`, 'i'))
  if (homeMatch) {
    return { opponent: homeMatch[1].trim(), home: true, competition: competitionFromSummary }
  }

  const awayMatch = mainPart.match(new RegExp(`^(.+?)\\s+v(?:s)?\\.?\\s+${MU_TEAM_PATTERN}$`, 'i'))
  if (awayMatch) {
    return { opponent: awayMatch[1].trim(), home: false, competition: competitionFromSummary }
  }

  return null
}

type UpcomingFixture = FixtureSummary

function parseIcsDateToIso(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (value.includes('T')) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z?$/)
    if (!m) return null
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    const d = Number(m[3])
    const h = Number(m[4])
    const mi = Number(m[5])
    const s = Number(m[6] ?? '0')
    const dt = value.endsWith('Z') ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s)
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!m) return null
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

function parseManUtdIcsFixtures(ics: string): UpcomingFixture[] {
  const events = ics.split('BEGIN:VEVENT').slice(1)
  const fixtures: UpcomingFixture[] = []
  for (const ev of events) {
    const block = ev.split('END:VEVENT')[0] ?? ''
    const dtRaw =
      block.match(/DTSTART(?:;[^:]+)?:([^\r\n]+)/)?.[1] ??
      block.match(/DTSTART;VALUE=DATE:([^\r\n]+)/)?.[1]
    const summary = block.match(/SUMMARY:([^\r\n]+)/)?.[1] ?? ''
    const location = block.match(/LOCATION:([^\r\n]+)/)?.[1] ?? ''
    const competition =
      block.match(/CATEGORIES:([^\r\n]+)/)?.[1] ??
      block.match(/DESCRIPTION:[^\r\n]*Competition[:\s-]+([^\r\n]+)/i)?.[1] ??
      'Match'
    if (!dtRaw || !summary) continue
    const kickoffIso = parseIcsDateToIso(dtRaw)
    if (!kickoffIso) continue
    const parsed = parseFixtureFromSummary(summary)
    if (!parsed) continue
    const resolvedCompetition = normalizeCompetitionName(
      parsed.competition ?? competition.replace(/\\,/g, ',').trim() ?? 'Match',
    )
    fixtures.push({
      kickoffIso,
      competition: resolvedCompetition || 'Match',
      opponent: parsed.opponent,
      home: parsed.home,
      venue: location.replace(/\\,/g, ',').trim() || (parsed.home ? 'Old Trafford' : 'Away'),
    })
  }
  return fixtures
}

/**
 * League Cup / Carabao Cup fixtures are often on manutd.com match pages before they
 * appear in the public ICS calendar. Pull fixture cards from the League Cup page.
 */
async function fetchManutdLeagueCupFixtures(): Promise<UpcomingFixture[]> {
  try {
    const response = await fetch(MANUTD_LEAGUE_CUP_FIXTURES_URL, {
      headers: {
        'User-Agent': 'CyprusMUSC-FixturesSync/1.0',
        Accept: 'text/html',
      },
    })
    if (!response.ok) return []
    // Next.js RSC payloads escape quotes as \"; normalize before parsing.
    const html = (await response.text()).replace(/\\"/g, '"').replace(/\\u0026/g, '&')
    const fixtures: UpcomingFixture[] = []
    const seen = new Set<string>()

    for (const kickMatch of html.matchAll(/"kickOffUtc":"([^"]+)"/g)) {
      const kickoffIso = kickMatch[1]
      if (!kickoffIso) continue
      const start = Math.max(0, (kickMatch.index ?? 0) - 4500)
      const window = html.slice(start, (kickMatch.index ?? 0) + kickMatch[0].length)
      if (!/"leagueTitle":"(?:League Cup|Carabao Cup|EFL Cup)"/i.test(window)) continue

      const location = window.match(/"matchLocation":"([^"]+)"/)?.[1] ?? ''
      const shortNames = [...window.matchAll(/"clubShortName":"([^"]+)"/g)].map((m) => m[1])
      if (shortNames.length < 2) continue
      const homeName = shortNames[0]!
      const awayName = shortNames[1]!
      const homeIsUnited = /^(man utd|manchester united)$/i.test(homeName)
      const awayIsUnited = /^(man utd|manchester united)$/i.test(awayName)
      if (!homeIsUnited && !awayIsUnited) continue

      const home = homeIsUnited
      const opponent = home ? awayName : homeName
      const leagueTitle = window.match(/"leagueTitle":"([^"]+)"/)?.[1] ?? 'League Cup'
      const fixture: UpcomingFixture = {
        kickoffIso,
        competition: normalizeCompetitionName(leagueTitle),
        opponent,
        home,
        venue: location.trim() || (home ? 'Old Trafford' : 'Away'),
      }
      const key = fixtureDedupeKey(fixture)
      if (seen.has(key)) continue
      seen.add(key)
      fixtures.push(fixture)
    }
    return fixtures
  } catch {
    return []
  }
}

fixturesRouter.get(
  '/cache',
  requireUser,
  asyncHandler(async (_req, res) => {
    const payload = await getCachedResponse(responseCacheKeys.fixturesCache, RESPONSE_CACHE_TTL_MS, async () => {
      const { rows } = await query<{ payload: unknown; updated_at: string }>(
        `select payload, updated_at from public.fixtures_cache where id = 1`,
      )
      const row = rows[0]
      return {
        fixtures: Array.isArray(row?.payload) ? row.payload : [],
        updatedAt: row?.updated_at ?? null,
      }
    })
    res.json(payload)
  }),
)

fixturesRouter.put(
  '/cache',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { fixtures, sourceUrl } = req.body as { fixtures?: unknown[]; sourceUrl?: string }
    await query(
      `insert into public.fixtures_cache (id, source_url, payload, updated_by)
       values (1, $1, $2::jsonb, $3)
       on conflict (id) do update set source_url = excluded.source_url, payload = excluded.payload, updated_by = excluded.updated_by`,
      [sourceUrl ?? '', JSON.stringify(Array.isArray(fixtures) ? fixtures : []), req.user!.id],
    )
    invalidateResponseCache(responseCacheKeys.fixturesCache)
    res.json({ ok: true })
  }),
)

fixturesRouter.post(
  '/sync',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const urls = [MANUTD_ICS_URL]
    let lastError: string | null = null
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'CyprusMUSC-FixturesSync/1.0' },
        })
        if (!response.ok) {
          lastError = `HTTP ${response.status}`
          continue
        }
        const text = await response.text()
        const icsFixtures = parseManUtdIcsFixtures(text)
        const leagueCupFixtures = await fetchManutdLeagueCupFixtures()
        const fixtures = mergeFixtures(icsFixtures, leagueCupFixtures)
        if (fixtures.length === 0) {
          lastError = 'Calendar fetched but no fixtures could be parsed'
          continue
        }
        const { rows: cacheRows } = await query<{ payload: unknown }>(
          `select payload from public.fixtures_cache where id = 1`,
        )
        const previousFixtures = Array.isArray(cacheRows[0]?.payload)
          ? (cacheRows[0].payload as FixtureSummary[])
          : []
        const remapped = await remapRescheduledFixtureMatchKeys(
          pool,
          previousFixtures,
          fixtures,
          req.user!.id,
        )
        await query(
          `insert into public.fixtures_cache (id, source_url, payload, updated_by)
           values (1, $1, $2::jsonb, $3)
           on conflict (id) do update set source_url = excluded.source_url, payload = excluded.payload, updated_by = excluded.updated_by`,
          [MANUTD_ICS_URL, JSON.stringify(fixtures), req.user!.id],
        )
        invalidateResponseCache(responseCacheKeys.fixturesCache)
        return res.json({ ok: true, count: fixtures.length, remapped })
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Fetch failed'
      }
    }
    throw badRequest(
      lastError
        ? `Could not fetch fixtures from manutd.com right now (${lastError}).`
        : 'Could not fetch fixtures from manutd.com right now.',
    )
  }),
)
