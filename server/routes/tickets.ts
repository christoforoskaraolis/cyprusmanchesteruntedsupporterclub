import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

export const ticketsRouter = Router()

ticketsRouter.post(
  '/windows/list',
  requireUser,
  asyncHandler(async (req, res) => {
    const { matchKeys } = req.body as { matchKeys?: string[] }
    const keys = Array.isArray(matchKeys) ? matchKeys : []
    if (keys.length === 0) return res.json({ rows: [] })
    const { rows } = await query<{ match_key: string; request_status: string; updated_at: string }>(
      `select match_key, request_status, updated_at
       from public.fixture_ticket_windows
       where match_key = any($1::text[])`,
      [keys],
    )
    res.json({
      rows: rows.map((r) => ({
        matchKey: r.match_key,
        requestStatus: r.request_status,
        updatedAt: r.updated_at,
      })),
    })
  }),
)

ticketsRouter.put(
  '/windows/:matchKey',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { fixture, status } = req.body as { fixture: any; status: string }
    await query(
      `insert into public.fixture_ticket_windows (match_key, kickoff_iso, competition, opponent, venue, home, request_status, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (match_key) do update
       set kickoff_iso=excluded.kickoff_iso, competition=excluded.competition, opponent=excluded.opponent, venue=excluded.venue, home=excluded.home, request_status=excluded.request_status, updated_by=excluded.updated_by`,
      [req.params.matchKey, fixture.kickoffIso, fixture.competition, fixture.opponent, fixture.venue, fixture.home, status, req.user!.id],
    )
    res.json({ ok: true })
  }),
)

ticketsRouter.post(
  '/requests/my/list',
  requireUser,
  asyncHandler(async (req, res) => {
    const { matchKeys } = req.body as { matchKeys?: string[] }
    const keys = Array.isArray(matchKeys) ? matchKeys : []
    if (keys.length === 0) return res.json({ rows: [] })
    const { rows } = await query<{ match_key: string; status: string }>(
      `select match_key, status from public.fixture_ticket_requests
       where user_id = $1 and match_key = any($2::text[])`,
      [req.user!.id, keys],
    )
    res.json({ rows: rows.map((r) => ({ matchKey: r.match_key, status: r.status })) })
  }),
)

ticketsRouter.post(
  '/requests/my/:matchKey',
  requireUser,
  asyncHandler(async (req, res) => {
    const matchKey = req.params.matchKey
    const { rows } = await query<{ id: string }>(
      `select id from public.fixture_ticket_requests where match_key = $1 and user_id = $2 order by requested_at desc limit 1`,
      [matchKey, req.user!.id],
    )
    if (rows[0]?.id) {
      await query(`update public.fixture_ticket_requests set status = 'pending', updated_at = now() where id = $1`, [
        rows[0].id,
      ])
    } else {
      await query(`insert into public.fixture_ticket_requests (match_key, user_id, status) values ($1, $2, 'pending')`, [
        matchKey,
        req.user!.id,
      ])
    }
    res.json({ ok: true })
  }),
)

ticketsRouter.get(
  '/requests/admin',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{
      id: string
      match_key: string
      user_id: string
      status: 'pending' | 'approved' | 'completed' | 'rejected' | 'cancelled'
      requested_at: string
    }>(`select id, match_key, user_id, status, requested_at from public.fixture_ticket_requests order by requested_at desc`)
    res.json({
      rows: rows.map((r) => ({
        id: r.id,
        matchKey: r.match_key,
        userId: r.user_id,
        status: r.status,
        requestedAt: r.requested_at,
      })),
    })
  }),
)

ticketsRouter.put(
  '/requests/:id/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: 'approved' | 'completed' | 'cancelled' }
    await query(`update public.fixture_ticket_requests set status = $1, updated_at = now() where id = $2`, [
      status,
      req.params.id,
    ])
    res.json({ ok: true })
  }),
)

ticketsRouter.put(
  '/requests/my/:matchKey/completed',
  requireUser,
  asyncHandler(async (req, res) => {
    await query(
      `update public.fixture_ticket_requests
       set status = 'completed', updated_at = now()
       where match_key = $1 and user_id = $2 and status = 'approved'`,
      [req.params.matchKey, req.user!.id],
    )
    res.json({ ok: true })
  }),
)
