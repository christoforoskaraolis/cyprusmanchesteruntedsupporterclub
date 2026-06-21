import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest, notFound } from '../lib/errors.ts'
import { sendTicketDepositConfirmedEmail } from '../lib/ticketDepositConfirmedEmail.ts'
import { sendTicketBalancePaymentEmail } from '../lib/ticketBalancePaymentEmail.ts'
import {
  assertFixtureTicketCapacityAvailable,
  closeFixtureTicketWindowIfAtCapacity,
  countActiveFixtureTicketRequestsByMatchKeys,
} from '../lib/ticketWindowCapacity.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

const MAX_TRAVEL_COMPANIONS = 10

function parseTravelCompanionMembershipNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const item of raw) {
    const parsed = Number(item)
    if (!Number.isInteger(parsed) || parsed < 1) continue
    if (seen.has(parsed)) continue
    seen.add(parsed)
    out.push(parsed)
    if (out.length >= MAX_TRAVEL_COMPANIONS) break
  }
  return out
}

async function resolveTravelCompanionsByRequestId(
  requests: { id: string; travel_companion_membership_numbers: number[] | null }[],
): Promise<Map<string, { membershipNumber: number; fullName: string | null }[]>> {
  const allNumbers = new Set<number>()
  for (const request of requests) {
    for (const number of request.travel_companion_membership_numbers ?? []) {
      allNumbers.add(number)
    }
  }

  const nameByNumber = new Map<number, string | null>()
  if (allNumbers.size > 0) {
    const { rows } = await query<{
      membership_number: number
      first_name: string | null
      last_name: string | null
    }>(
      `select distinct on (membership_number) membership_number, first_name, last_name
       from public.membership_applications
       where membership_number = any($1::int[])
       order by membership_number, case when status = 'active' then 0 else 1 end, submitted_at desc`,
      [[...allNumbers]],
    )
    for (const row of rows) {
      const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null
      nameByNumber.set(row.membership_number, fullName)
    }
  }

  return new Map(
    requests.map((request) => [
      request.id,
      (request.travel_companion_membership_numbers ?? []).map((membershipNumber) => ({
        membershipNumber,
        fullName: nameByNumber.get(membershipNumber) ?? null,
      })),
    ]),
  )
}

export const ticketsRouter = Router()

ticketsRouter.post(
  '/windows/list',
  requireUser,
  asyncHandler(async (req, res) => {
    const { matchKeys } = req.body as { matchKeys?: string[] }
    const keys = Array.isArray(matchKeys) ? matchKeys : []
    if (keys.length === 0) return res.json({ rows: [] })
    const { rows } = await query<{
      match_key: string
      request_status: string
      updated_at: string
      max_tickets: number | null
    }>(
      `select match_key, request_status, updated_at, max_tickets
       from public.fixture_ticket_windows
       where match_key = any($1::text[])`,
      [keys],
    )
    const activeCounts = await countActiveFixtureTicketRequestsByMatchKeys(keys)
    res.json({
      rows: rows.map((r) => ({
        matchKey: r.match_key,
        requestStatus: r.request_status,
        updatedAt: r.updated_at,
        maxTickets: r.max_tickets,
        activeRequestCount: activeCounts.get(r.match_key) ?? 0,
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
    if (status === 'open') {
      await closeFixtureTicketWindowIfAtCapacity(req.params.matchKey)
    }
    res.json({ ok: true })
  }),
)

ticketsRouter.put(
  '/windows/:matchKey/max-tickets',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const matchKey = String(req.params.matchKey ?? '').trim()
    if (!matchKey) throw badRequest('Match key is required')

    const raw = (req.body as { maxTickets?: unknown })?.maxTickets
    let maxTickets: number | null = null
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      const parsed = Number(raw)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw badRequest('Maximum tickets must be a positive whole number.')
      }
      maxTickets = parsed
    }

    const { fixture } = req.body as { fixture?: { kickoffIso?: string; competition?: string; opponent?: string; venue?: string; home?: boolean } }
    if (!fixture?.kickoffIso) throw badRequest('Fixture details are required.')

    await query(
      `insert into public.fixture_ticket_windows (
         match_key, kickoff_iso, competition, opponent, venue, home, request_status, max_tickets, updated_by
       )
       values ($1, $2, $3, $4, $5, $6, 'disabled', $7, $8)
       on conflict (match_key) do update
       set kickoff_iso = excluded.kickoff_iso,
           competition = excluded.competition,
           opponent = excluded.opponent,
           venue = excluded.venue,
           home = excluded.home,
           max_tickets = excluded.max_tickets,
           updated_at = now(),
           updated_by = excluded.updated_by`,
      [
        matchKey,
        fixture.kickoffIso,
        fixture.competition,
        fixture.opponent,
        fixture.venue,
        fixture.home,
        maxTickets,
        req.user!.id,
      ],
    )

    await closeFixtureTicketWindowIfAtCapacity(matchKey)

    const { rows } = await query<{ request_status: string; max_tickets: number | null }>(
      `select request_status, max_tickets from public.fixture_ticket_windows where match_key = $1 limit 1`,
      [matchKey],
    )
    const activeRequestCount = (await countActiveFixtureTicketRequestsByMatchKeys([matchKey])).get(matchKey) ?? 0

    res.json({
      ok: true,
      requestStatus: rows[0]?.request_status ?? 'disabled',
      maxTickets: rows[0]?.max_tickets ?? null,
      activeRequestCount,
    })
  }),
)

ticketsRouter.post(
  '/requests/my/list',
  requireUser,
  asyncHandler(async (req, res) => {
    const { matchKeys } = req.body as { matchKeys?: string[] }
    const keys = Array.isArray(matchKeys) ? matchKeys : []
    if (keys.length === 0) return res.json({ rows: [] })
    const { rows } = await query<{
      match_key: string
      status: string
      deposit_confirmed: boolean
      user_cancelled_at: string | null
      balance_remaining_amount_eur: string | number | null
      balance_payment_notified: boolean
      balance_payment_deadline: string | null
      ticket_confirmed: boolean
    }>(
      `select distinct on (match_key) match_key, status, deposit_confirmed, user_cancelled_at,
              balance_remaining_amount_eur, balance_payment_notified, balance_payment_deadline,
              ticket_confirmed
       from public.fixture_ticket_requests
       where user_id = $1 and match_key = any($2::text[])
       order by match_key, requested_at desc`,
      [req.user!.id, keys],
    )
    res.json({
      rows: rows.map((r) => ({
        matchKey: r.match_key,
        status: r.status,
        depositConfirmed: r.deposit_confirmed,
        userCancelledAt: r.user_cancelled_at,
        balanceRemainingAmountEur:
          r.balance_remaining_amount_eur == null ? null : Number(r.balance_remaining_amount_eur),
        balancePaymentNotified: r.balance_payment_notified,
        balancePaymentDeadline: r.balance_payment_deadline,
        ticketConfirmed: r.ticket_confirmed,
      })),
    })
  }),
)

ticketsRouter.post(
  '/requests/my/:matchKey',
  requireUser,
  asyncHandler(async (req, res) => {
    const matchKey = req.params.matchKey
    const travelCompanionMembershipNumbers = parseTravelCompanionMembershipNumbers(
      (req.body as { travelCompanionMembershipNumbers?: unknown })?.travelCompanionMembershipNumbers,
    )

    const { rows: requesterRows } = await query<{ membership_number: number | null }>(
      `select membership_number
       from public.membership_applications
       where user_id = $1 and status = 'active'
       order by submitted_at desc
       limit 1`,
      [req.user!.id],
    )
    const requesterMembershipNumber = requesterRows[0]?.membership_number ?? null
    const filteredTravelCompanions = travelCompanionMembershipNumbers.filter(
      (n) => requesterMembershipNumber == null || n !== requesterMembershipNumber,
    )

    const { rows } = await query<{ id: string }>(
      `select id from public.fixture_ticket_requests where match_key = $1 and user_id = $2 order by requested_at desc limit 1`,
      [matchKey, req.user!.id],
    )
    await assertFixtureTicketCapacityAvailable(matchKey, { existingRequestId: rows[0]?.id ?? null })
    if (rows[0]?.id) {
      await query(
        `update public.fixture_ticket_requests
         set status = 'pending',
             user_cancelled_at = null,
             deposit_confirmed = false,
             deposit_confirmed_at = null,
             balance_remaining_amount_eur = null,
             balance_payment_notified = false,
             balance_payment_notified_at = null,
             balance_payment_deadline = null,
             ticket_confirmed = false,
             ticket_confirmed_at = null,
             travel_companion_membership_numbers = $2,
             requested_at = now(),
             updated_at = now()
         where id = $1`,
        [rows[0].id, filteredTravelCompanions],
      )
    } else {
      await query(
        `insert into public.fixture_ticket_requests (match_key, user_id, status, travel_companion_membership_numbers)
         values ($1, $2, 'pending', $3)`,
        [matchKey, req.user!.id, filteredTravelCompanions],
      )
    }
    await closeFixtureTicketWindowIfAtCapacity(matchKey)
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
      first_name: string | null
      last_name: string | null
      profile_full_name: string | null
      mobile_phone: string | null
      official_mu_membership_id: string | null
      official_mu_membership_status: string | null
      application_id: string | null
      deposit_confirmed: boolean
      deposit_confirmed_at: string | null
      user_cancelled_at: string | null
      balance_remaining_amount_eur: string | number | null
      balance_payment_notified: boolean
      balance_payment_notified_at: string | null
      balance_payment_deadline: string | null
      ticket_confirmed: boolean
      ticket_confirmed_at: string | null
      travel_companion_membership_numbers: number[] | null
    }>(
      `select ftr.id, ftr.match_key, ftr.user_id, ftr.status, ftr.requested_at,
              ftr.deposit_confirmed, ftr.deposit_confirmed_at, ftr.user_cancelled_at,
              ftr.balance_remaining_amount_eur, ftr.balance_payment_notified,
              ftr.balance_payment_notified_at, ftr.balance_payment_deadline,
              ftr.ticket_confirmed, ftr.ticket_confirmed_at, ftr.travel_companion_membership_numbers,
              m.first_name, m.last_name, p.full_name as profile_full_name,
              m.mobile_phone, m.official_mu_membership_id, m.official_mu_membership_status, m.application_id
       from public.fixture_ticket_requests ftr
       left join public.profiles p on p.id = ftr.user_id
       left join lateral (
         select ma.first_name, ma.last_name, ma.mobile_phone,
                ma.official_mu_membership_id, ma.official_mu_membership_status, ma.application_id
         from public.membership_applications ma
         where ma.user_id = ftr.user_id
         order by case when ma.status = 'active' then 0 else 1 end, ma.submitted_at desc
         limit 1
       ) m on true
       order by ftr.requested_at desc`,
    )
    const travelCompanionsByRequestId = await resolveTravelCompanionsByRequestId(
      rows.map((r) => ({
        id: r.id,
        travel_companion_membership_numbers: r.travel_companion_membership_numbers,
      })),
    )
    res.json({
      rows: rows.map((r) => {
        const membershipName = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
        const fullName = membershipName || r.profile_full_name?.trim() || null
        return {
          id: r.id,
          matchKey: r.match_key,
          userId: r.user_id,
          status: r.status,
          requestedAt: r.requested_at,
          depositConfirmed: r.deposit_confirmed,
          depositConfirmedAt: r.deposit_confirmed_at,
          userCancelledAt: r.user_cancelled_at,
          balanceRemainingAmountEur:
            r.balance_remaining_amount_eur == null ? null : Number(r.balance_remaining_amount_eur),
          balancePaymentNotified: r.balance_payment_notified,
          balancePaymentNotifiedAt: r.balance_payment_notified_at,
          balancePaymentDeadline: r.balance_payment_deadline,
          ticketConfirmed: r.ticket_confirmed,
          ticketConfirmedAt: r.ticket_confirmed_at,
          travelCompanions: travelCompanionsByRequestId.get(r.id) ?? [],
          user: {
            fullName,
            mobilePhone: r.mobile_phone,
            officialMuMembershipId: r.official_mu_membership_id,
            officialMuMembershipStatus:
              r.official_mu_membership_status === 'activated' || r.official_mu_membership_status === 'pending'
                ? r.official_mu_membership_status
                : null,
            applicationId: r.application_id,
          },
        }
      }),
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
  '/requests/:id/deposit-confirmed',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const requestId = String(req.params.id ?? '').trim()
    const depositConfirmed = (req.body as { depositConfirmed?: unknown })?.depositConfirmed === true
    if (!requestId) throw badRequest('Request ID is required')

    const { rows: existingRows } = await query<{
      deposit_confirmed: boolean
      match_key: string
      profile_email: string | null
      auth_email: string | null
    }>(
      `select ftr.deposit_confirmed, ftr.match_key, p.email as profile_email, au.email as auth_email
       from public.fixture_ticket_requests ftr
       left join public.profiles p on p.id = ftr.user_id
       left join public.auth_users au on au.user_id = ftr.user_id
       where ftr.id = $1
       limit 1`,
      [requestId],
    )
    const existing = existingRows[0]
    if (!existing) throw notFound('Ticket request not found')

    const { rows } = await query<{
      id: string
      deposit_confirmed: boolean
      deposit_confirmed_at: string | null
    }>(
      `update public.fixture_ticket_requests
       set deposit_confirmed = $1,
           deposit_confirmed_at = case when $1 then now() else null end,
           updated_at = now()
       where id = $2
       returning id, deposit_confirmed, deposit_confirmed_at`,
      [depositConfirmed, requestId],
    )
    if (rows.length === 0) throw notFound('Ticket request not found')

    if (depositConfirmed && !existing.deposit_confirmed) {
      const to = (existing.profile_email || existing.auth_email || '').trim()
      if (!to) {
        throw badRequest('No email address on file for this member.')
      }
      await sendTicketDepositConfirmedEmail({ to, matchKey: existing.match_key })
    }

    const row = rows[0]
    res.json({
      ok: true,
      depositConfirmed: row.deposit_confirmed,
      depositConfirmedAt: row.deposit_confirmed_at,
    })
  }),
)

ticketsRouter.put(
  '/requests/my/:matchKey/cancel',
  requireUser,
  asyncHandler(async (req, res) => {
    const matchKey = String(req.params.matchKey ?? '').trim()
    if (!matchKey) throw badRequest('Match key is required')

    const { rows: existingRows } = await query<{
      id: string
      deposit_confirmed: boolean
      user_cancelled_at: string | null
      status: string
    }>(
      `select id, deposit_confirmed, user_cancelled_at, status
       from public.fixture_ticket_requests
       where match_key = $1 and user_id = $2
       order by requested_at desc
       limit 1`,
      [matchKey, req.user!.id],
    )
    const existing = existingRows[0]
    if (!existing) throw notFound('Ticket request not found')
    if (!existing.deposit_confirmed) {
      throw badRequest('Your deposit must be confirmed before you can cancel this request.')
    }
    if (existing.user_cancelled_at) {
      throw badRequest('This request has already been cancelled.')
    }
    if (existing.status === 'completed' || existing.status === 'cancelled' || existing.status === 'rejected') {
      throw badRequest('This request can no longer be cancelled.')
    }

    const { rows } = await query<{ user_cancelled_at: string }>(
      `update public.fixture_ticket_requests
       set user_cancelled_at = now(), updated_at = now()
       where id = $1
       returning user_cancelled_at`,
      [existing.id],
    )
    if (rows.length === 0) throw notFound('Ticket request not found')

    res.json({ ok: true, userCancelledAt: rows[0].user_cancelled_at })
  }),
)

ticketsRouter.put(
  '/requests/:id/balance-payment',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const requestId = String(req.params.id ?? '').trim()
    const body = req.body as {
      balanceRemainingAmountEur?: unknown
      balancePaymentNotified?: unknown
      balancePaymentDeadline?: unknown
    }
    const balancePaymentNotified = body.balancePaymentNotified === true
    if (!requestId) throw badRequest('Request ID is required')

    const rawAmount = body.balanceRemainingAmountEur
    let balanceRemainingAmountEur: number | null = null
    if (rawAmount !== null && rawAmount !== undefined && String(rawAmount).trim() !== '') {
      const parsed = Number(rawAmount)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw badRequest('Remaining ticket amount must be a positive number.')
      }
      balanceRemainingAmountEur = Math.round(parsed * 100) / 100
    }

    const rawDeadline = body.balancePaymentDeadline
    let balancePaymentDeadlineIso: string | null = null
    if (rawDeadline !== null && rawDeadline !== undefined && String(rawDeadline).trim() !== '') {
      const trimmed = String(rawDeadline).trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        throw badRequest('Payment deadline must be a valid date (YYYY-MM-DD).')
      }
      balancePaymentDeadlineIso = trimmed
    }

    const { rows: existingRows } = await query<{
      balance_payment_notified: boolean
      match_key: string
      profile_email: string | null
      auth_email: string | null
      balance_remaining_amount_eur: string | number | null
      balance_payment_deadline: string | null
    }>(
      `select ftr.balance_payment_notified, ftr.match_key, p.email as profile_email, au.email as auth_email,
              ftr.balance_remaining_amount_eur, ftr.balance_payment_deadline
       from public.fixture_ticket_requests ftr
       left join public.profiles p on p.id = ftr.user_id
       left join public.auth_users au on au.user_id = ftr.user_id
       where ftr.id = $1
       limit 1`,
      [requestId],
    )
    const existing = existingRows[0]
    if (!existing) throw notFound('Ticket request not found')

    const resolvedAmount =
      balanceRemainingAmountEur ??
      (existing.balance_remaining_amount_eur == null ? null : Number(existing.balance_remaining_amount_eur))
    const resolvedDeadline =
      balancePaymentDeadlineIso ??
      (existing.balance_payment_deadline ? String(existing.balance_payment_deadline).slice(0, 10) : null)

    if (balancePaymentNotified) {
      if (resolvedAmount == null || resolvedAmount <= 0) {
        throw badRequest('Enter the remaining ticket amount before sending the payment email.')
      }
      if (!resolvedDeadline) {
        throw badRequest('Enter the payment deadline before sending the payment email.')
      }
    }

    const { rows } = await query<{
      balance_remaining_amount_eur: string
      balance_payment_notified: boolean
      balance_payment_notified_at: string | null
      balance_payment_deadline: string | null
    }>(
      `update public.fixture_ticket_requests
       set balance_remaining_amount_eur = coalesce($1, balance_remaining_amount_eur),
           balance_payment_notified = $2,
           balance_payment_notified_at = case
             when $2 then now()
             else null
           end,
           balance_payment_deadline = coalesce($3::date, balance_payment_deadline),
           updated_at = now()
       where id = $4
       returning balance_remaining_amount_eur, balance_payment_notified, balance_payment_notified_at, balance_payment_deadline`,
      [balanceRemainingAmountEur, balancePaymentNotified, balancePaymentDeadlineIso, requestId],
    )
    if (rows.length === 0) throw notFound('Ticket request not found')

    if (balancePaymentNotified && !existing.balance_payment_notified) {
      const to = (existing.profile_email || existing.auth_email || '').trim()
      if (!to) {
        throw badRequest('No email address on file for this member.')
      }
      const amountForEmail = resolvedAmount!
      const rawDeadline = rows[0].balance_payment_deadline ?? resolvedDeadline!
      const deadlineForEmail =
        rawDeadline instanceof Date
          ? `${rawDeadline.getUTCFullYear()}-${String(rawDeadline.getUTCMonth() + 1).padStart(2, '0')}-${String(rawDeadline.getUTCDate()).padStart(2, '0')}`
          : String(rawDeadline).slice(0, 10)
      await sendTicketBalancePaymentEmail({
        to,
        matchKey: existing.match_key,
        balanceRemainingAmountEur: amountForEmail,
        paymentDeadlineIso: deadlineForEmail,
      })
    }

    const row = rows[0]
    res.json({
      ok: true,
      balanceRemainingAmountEur: Number(row.balance_remaining_amount_eur),
      balancePaymentNotified: row.balance_payment_notified,
      balancePaymentNotifiedAt: row.balance_payment_notified_at,
      balancePaymentDeadline: row.balance_payment_deadline,
    })
  }),
)

ticketsRouter.put(
  '/requests/:id/ticket-confirmed',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const requestId = String(req.params.id ?? '').trim()
    const ticketConfirmed = (req.body as { ticketConfirmed?: unknown })?.ticketConfirmed === true
    if (!requestId) throw badRequest('Request ID is required')
    if (!ticketConfirmed) throw badRequest('Ticket confirmation can only be set to true.')

    const { rows: existingRows } = await query<{
      ticket_confirmed: boolean
      balance_payment_notified: boolean
    }>(
      `select ticket_confirmed, balance_payment_notified
       from public.fixture_ticket_requests
       where id = $1
       limit 1`,
      [requestId],
    )
    const existing = existingRows[0]
    if (!existing) throw notFound('Ticket request not found')
    if (existing.ticket_confirmed) {
      throw badRequest('This ticket has already been confirmed.')
    }
    if (!existing.balance_payment_notified) {
      throw badRequest('Send the ticket payment email before confirming the ticket.')
    }

    const { rows } = await query<{
      ticket_confirmed: boolean
      ticket_confirmed_at: string | null
    }>(
      `update public.fixture_ticket_requests
       set ticket_confirmed = true,
           ticket_confirmed_at = now(),
           updated_at = now()
       where id = $1
       returning ticket_confirmed, ticket_confirmed_at`,
      [requestId],
    )
    if (rows.length === 0) throw notFound('Ticket request not found')

    const row = rows[0]
    res.json({
      ok: true,
      ticketConfirmed: row.ticket_confirmed,
      ticketConfirmedAt: row.ticket_confirmed_at,
    })
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
