import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

export const fixturesRouter = Router()
const MANUTD_ICS_URL = 'https://www.manutd.com/en/Manchester_United.ics'

type UpcomingFixture = {
  kickoffIso: string
  competition: string
  opponent: string
  home: boolean
  venue: string
}

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

function parseFixtureFromSummary(summary: string): { opponent: string; home: boolean } | null {
  const clean = summary.replace(/\s+/g, ' ').trim()
  const vsMatch = clean.match(/Manchester United\s+v(?:s)?\s+(.+)/i)
  if (vsMatch) return { opponent: vsMatch[1].trim(), home: true }
  const awayMatch = clean.match(/(.+)\s+v(?:s)?\s+Manchester United/i)
  if (awayMatch) return { opponent: awayMatch[1].trim(), home: false }
  return null
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
    fixtures.push({
      kickoffIso,
      competition: competition.replace(/\\,/g, ',').trim(),
      opponent: parsed.opponent,
      home: parsed.home,
      venue: location.replace(/\\,/g, ',').trim() || (parsed.home ? 'Old Trafford' : 'Away'),
    })
  }
  return fixtures
}

fixturesRouter.get(
  '/cache',
  requireUser,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{ payload: unknown; updated_at: string }>(
      `select payload, updated_at from public.fixtures_cache where id = 1`,
    )
    const row = rows[0]
    res.json({
      fixtures: Array.isArray(row?.payload) ? row.payload : [],
      updatedAt: row?.updated_at ?? null,
    })
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
    res.json({ ok: true })
  }),
)

fixturesRouter.post(
  '/sync',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const urls = [MANUTD_ICS_URL, `https://api.allorigins.win/raw?url=${encodeURIComponent(MANUTD_ICS_URL)}`]
    for (const url of urls) {
      try {
        const response = await fetch(url)
        if (!response.ok) continue
        const text = await response.text()
        const fixtures = parseManUtdIcsFixtures(text)
        if (fixtures.length === 0) continue
        await query(
          `insert into public.fixtures_cache (id, source_url, payload, updated_by)
           values (1, $1, $2::jsonb, $3)
           on conflict (id) do update set source_url = excluded.source_url, payload = excluded.payload, updated_by = excluded.updated_by`,
          [MANUTD_ICS_URL, JSON.stringify(fixtures), req.user!.id],
        )
        return res.json({ ok: true, count: fixtures.length })
      } catch {
        // Try next source.
      }
    }
    throw badRequest('Could not fetch fixtures from manutd.com right now.')
  }),
)
