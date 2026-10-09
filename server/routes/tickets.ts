import { Router } from 'express'
import Stripe from 'stripe'
import { query } from '../db.ts'
import { env } from '../env.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest, notFound } from '../lib/errors.ts'
import { sendTicketDepositConfirmedEmail } from '../lib/ticketDepositConfirmedEmail.ts'
import { sendTicketDepositPaymentReminderEmail } from '../lib/ticketDepositPaymentReminderEmail.ts'
import { sendTicketBalancePaymentReminderEmail } from '../lib/ticketBalancePaymentReminderEmail.ts'
import { sendTicketBalancePaymentEmail } from '../lib/ticketBalancePaymentEmail.ts'
import { sendTicketCompletedEmail } from '../lib/ticketCompletedEmail.ts'
import { sendClubTripConfirmedEmail } from '../lib/clubTripConfirmedEmail.ts'
import {
  lookupMembersByMembershipNumbers,
  ticketDepositAmountEurFromCompanionNumbers,
  ticketSlotCountFromCompanionNumbers,
  validateTravelCompanionMembershipNumbers,
} from '../lib/ticketTravelCompanions.ts'
import {
  assertFixtureTicketCapacityAvailable,
  closeFixtureTicketWindowIfAtCapacity,
  countActiveFixtureTicketSlotsByMatchKeys,
} from '../lib/ticketWindowCapacity.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

const MAX_TRAVEL_COMPANIONS = 10

/** Club-trip deposit base amount. Stripe checkout adds the €1 service charge (€151 total). */
export const CLUB_TRIP_DEPOSIT_EUR = 150

function getStripeClient(): Stripe | null {
  if (!env.stripeSecretKey) return null
  return new Stripe(env.stripeSecretKey)
}

export type OrganizedTripDetails = {
  fullName: string
  passportNumber: string
  dateOfBirth: string
  passportIssuedAt: string
  passportExpiresAt: string
  officialMuMembershipId: string
  telephone: string
}

function isHullCityMatchKey(matchKey: string): boolean {
  const parts = String(matchKey).split('|')
  const opponent = (parts[2] ?? '').trim().toLowerCase()
  const homeAway = (parts[3] ?? '').trim().toUpperCase()
  return homeAway === 'H' && opponent.includes('hull')
}

function parseIsoDateOnly(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const [y, m, d] = trimmed.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12, 0, 0, 0)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return trimmed
}

function parseOrganizedTripDetails(raw: unknown): OrganizedTripDetails | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const passportNumber = typeof body.passportNumber === 'string' ? body.passportNumber.trim() : ''
  const officialMuMembershipId =
    typeof body.officialMuMembershipId === 'string' ? body.officialMuMembershipId.trim() : ''
  const telephone = typeof body.telephone === 'string' ? body.telephone.trim() : ''
  const dateOfBirth = parseIsoDateOnly(body.dateOfBirth)
  const passportIssuedAt = parseIsoDateOnly(body.passportIssuedAt)
  const passportExpiresAt = parseIsoDateOnly(body.passportExpiresAt)
  if (!fullName || fullName.length > 200) return null
  if (!passportNumber || passportNumber.length > 64) return null
  if (!officialMuMembershipId || officialMuMembershipId.length > 64) return null
  if (!telephone || telephone.length > 40) return null
  if (!dateOfBirth || !passportIssuedAt || !passportExpiresAt) return null
  if (passportExpiresAt < passportIssuedAt) return null
  return {
    fullName,
    passportNumber,
    dateOfBirth,
    passportIssuedAt,
    passportExpiresAt,
    officialMuMembershipId,
    telephone,
  }
}

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
): Promise<
  Map<
    string,
    {
      membershipNumber: number
      fullName: string | null
      mobilePhone: string | null
      email: string | null
      officialMuMembershipId: string | null
      officialMuMembershipStatus: 'activated' | 'pending' | null
    }[]
  >
> {
  const allNumbers = new Set<number>()
  for (const request of requests) {
    for (const number of request.travel_companion_membership_numbers ?? []) {
      allNumbers.add(number)
    }
  }

  const companionByNumber = new Map<
    number,
    {
      fullName: string | null
      mobilePhone: string | null
      email: string | null
      officialMuMembershipId: string | null
      officialMuMembershipStatus: 'activated' | 'pending' | null
    }
  >()
  if (allNumbers.size > 0) {
    const { rows } = await query<{
      membership_number: number
      first_name: string | null
      last_name: string | null
      mobile_phone: string | null
      official_mu_membership_id: string | null
      official_mu_membership_status: string | null
      profile_email: string | null
      auth_email: string | null
    }>(
      `select distinct on (ma.membership_number)
              ma.membership_number, ma.first_name, ma.last_name, ma.mobile_phone,
              ma.official_mu_membership_id, ma.official_mu_membership_status,
              p.email as profile_email, au.email as auth_email
       from public.membership_applications ma
       left join public.profiles p on p.id = ma.user_id
       left join public.auth_users au on au.user_id = ma.user_id
       where ma.membership_number = any($1::int[])
       order by ma.membership_number, case when ma.status = 'active' then 0 else 1 end, ma.submitted_at desc`,
      [[...allNumbers]],
    )
    for (const row of rows) {
      const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null
      const email = (row.profile_email || row.auth_email || '').trim() || null
      const officialStatus =
        row.official_mu_membership_status === 'activated' || row.official_mu_membership_status === 'pending'
          ? row.official_mu_membership_status
          : null
      companionByNumber.set(row.membership_number, {
        fullName,
        mobilePhone: row.mobile_phone?.trim() || null,
        email,
        officialMuMembershipId: row.official_mu_membership_id?.trim() || null,
        officialMuMembershipStatus: officialStatus,
      })
    }
  }

  return new Map(
    requests.map((request) => [
      request.id,
      (request.travel_companion_membership_numbers ?? []).map((membershipNumber) => {
        const details = companionByNumber.get(membershipNumber)
        return {
          membershipNumber,
          fullName: details?.fullName ?? null,
          mobilePhone: details?.mobilePhone ?? null,
          email: details?.email ?? null,
          officialMuMembershipId: details?.officialMuMembershipId ?? null,
          officialMuMembershipStatus: details?.officialMuMembershipStatus ?? null,
        }
      }),
    ]),
  )
}

export const ticketsRouter = Router()

ticketsRouter.post(
  '/travel-companions/lookup',
  requireUser,
  asyncHandler(async (req, res) => {
    const membershipNumbers = parseTravelCompanionMembershipNumbers(
      (req.body as { membershipNumbers?: unknown })?.membershipNumbers,
    )
    const rows = await lookupMembersByMembershipNumbers(membershipNumbers)
    res.json({ rows })
  }),
)

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
    const activeCounts = await countActiveFixtureTicketSlotsByMatchKeys(keys)
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
    const activeRequestCount = (await countActiveFixtureTicketSlotsByMatchKeys([matchKey])).get(matchKey) ?? 0

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
      travel_companion_membership_numbers: number[] | null
      organized_trip_details: OrganizedTripDetails | null
    }>(
      `select distinct on (match_key) match_key, status, deposit_confirmed, user_cancelled_at,
              balance_remaining_amount_eur, balance_payment_notified, balance_payment_deadline,
              ticket_confirmed, travel_companion_membership_numbers, organized_trip_details
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
        ticketSlotCount: ticketSlotCountFromCompanionNumbers(r.travel_companion_membership_numbers),
        travelCompanionCount: r.travel_companion_membership_numbers?.length ?? 0,
        depositAmountEur: ticketDepositAmountEurFromCompanionNumbers(r.travel_companion_membership_numbers),
        isOrganizedClubTrip: Boolean(r.organized_trip_details),
        organizedTripDetails: r.organized_trip_details ?? null,
      })),
    })
  }),
)

ticketsRouter.post(
  '/requests/my/:matchKey',
  requireUser,
  asyncHandler(async (req, res) => {
    const matchKey = req.params.matchKey
    const body = (req.body ?? {}) as {
      travelCompanionMembershipNumbers?: unknown
      organizedTripDetails?: unknown
    }
    if (body.organizedTripDetails != null) {
      throw badRequest(
        'Club trip registration requires Stripe deposit payment first. Use Pay with Stripe on the travel form.',
      )
    }

    const travelCompanionMembershipNumbers = parseTravelCompanionMembershipNumbers(
      body.travelCompanionMembershipNumbers,
    )

    const { rows: requesterRows } = await query<{
      membership_number: number | null
      official_mu_membership_status: string | null
    }>(
      `select membership_number, official_mu_membership_status
       from public.membership_applications
       where user_id = $1
         and status = 'active'
         and sponsor_application_id is null
       order by submitted_at desc
       limit 1`,
      [req.user!.id],
    )
    const requester = requesterRows[0]
    if (!requester) {
      throw badRequest('You must have an active Cyprus membership to request tickets.')
    }
    if (requester.official_mu_membership_status !== 'activated') {
      throw badRequest('You must have active official Manchester United membership to request tickets.')
    }

    const requesterMembershipNumber = requester.membership_number ?? null
    const filteredTravelCompanions = travelCompanionMembershipNumbers.filter(
      (n) => requesterMembershipNumber == null || n !== requesterMembershipNumber,
    )

    await validateTravelCompanionMembershipNumbers(filteredTravelCompanions)

    const requestedSlotCount = ticketSlotCountFromCompanionNumbers(filteredTravelCompanions)

    const { rows } = await query<{ id: string }>(
      `select id from public.fixture_ticket_requests where match_key = $1 and user_id = $2 order by requested_at desc limit 1`,
      [matchKey, req.user!.id],
    )
    await assertFixtureTicketCapacityAvailable(matchKey, {
      existingRequestId: rows[0]?.id ?? null,
      requestedSlotCount,
    })
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
             organized_trip_details = null,
             requested_at = now(),
             updated_at = now()
         where id = $1`,
        [rows[0].id, filteredTravelCompanions],
      )
    } else {
      await query(
        `insert into public.fixture_ticket_requests
           (match_key, user_id, status, travel_companion_membership_numbers, organized_trip_details)
         values ($1, $2, 'pending', $3, null)`,
        [matchKey, req.user!.id, filteredTravelCompanions],
      )
    }
    await closeFixtureTicketWindowIfAtCapacity(matchKey)
    res.json({
      ok: true,
      ticketSlotCount: requestedSlotCount,
      depositAmountEur: ticketDepositAmountEurFromCompanionNumbers(filteredTravelCompanions),
      isOrganizedClubTrip: false,
    })
  }),
)

ticketsRouter.post(
  '/requests/my/club-trip/complete',
  requireUser,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as {
      sessionId?: unknown
      matchKey?: unknown
      organizedTripDetails?: unknown
      travelCompanionMembershipNumbers?: unknown
    }
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const matchKey = typeof body.matchKey === 'string' ? body.matchKey.trim() : ''
    const organizedTripDetails = parseOrganizedTripDetails(body.organizedTripDetails)
    const travelCompanionMembershipNumbers = parseTravelCompanionMembershipNumbers(
      body.travelCompanionMembershipNumbers,
    )

    if (!sessionId) throw badRequest('Stripe session ID is required.')
    if (!matchKey) throw badRequest('Match key is required.')
    if (!organizedTripDetails) throw badRequest('Trip registration details are incomplete.')
    if (!isHullCityMatchKey(matchKey)) {
      throw badRequest('Organized club trip registration is only available for the Hull City home match.')
    }

    const { rows: requesterRows } = await query<{
      membership_number: number | null
      official_mu_membership_status: string | null
    }>(
      `select membership_number, official_mu_membership_status
       from public.membership_applications
       where user_id = $1
         and status = 'active'
         and sponsor_application_id is null
       order by submitted_at desc
       limit 1`,
      [req.user!.id],
    )
    const requester = requesterRows[0]
    if (!requester) {
      throw badRequest('You must have an active Cyprus membership to register for the club trip.')
    }
    if (requester.official_mu_membership_status !== 'activated') {
      throw badRequest('You must have active official Manchester United membership to register for the club trip.')
    }
    const requesterMembershipNumber = requester.membership_number ?? null

    const filteredTravelCompanions = travelCompanionMembershipNumbers.filter(
      (n) => requesterMembershipNumber == null || n !== requesterMembershipNumber,
    )
    await validateTravelCompanionMembershipNumbers(filteredTravelCompanions)
    const requestedSlotCount = ticketSlotCountFromCompanionNumbers(filteredTravelCompanions)
    const expectedDepositEur = CLUB_TRIP_DEPOSIT_EUR * requestedSlotCount

    const stripe = getStripeClient()
    if (!stripe) throw badRequest('Stripe is not configured on this server.')

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') {
      throw badRequest('Stripe payment is not completed yet.')
    }
    if (session.metadata?.paymentKind !== 'club_trip') {
      throw badRequest('This Stripe payment is not a club trip deposit.')
    }
    if (session.metadata?.userId !== req.user!.id) {
      throw badRequest('This Stripe payment does not belong to the signed-in user.')
    }
    if ((session.metadata?.referenceId ?? '') !== matchKey) {
      throw badRequest('This Stripe payment does not match the selected fixture.')
    }
    if (session.metadata?.baseAmountEur !== String(expectedDepositEur)) {
      throw badRequest('This Stripe payment amount does not match the trip deposit for the selected travelers.')
    }

    const { rows } = await query<{ id: string }>(
      `select id from public.fixture_ticket_requests where match_key = $1 and user_id = $2 order by requested_at desc limit 1`,
      [matchKey, req.user!.id],
    )
    await assertFixtureTicketCapacityAvailable(matchKey, {
      existingRequestId: rows[0]?.id ?? null,
      requestedSlotCount,
    })

    const detailsJson = JSON.stringify(organizedTripDetails)
    if (rows[0]?.id) {
      await query(
        `update public.fixture_ticket_requests
         set status = 'pending',
             user_cancelled_at = null,
             deposit_confirmed = true,
             deposit_confirmed_at = now(),
             balance_remaining_amount_eur = null,
             balance_payment_notified = false,
             balance_payment_notified_at = null,
             balance_payment_deadline = null,
             ticket_confirmed = false,
             ticket_confirmed_at = null,
             travel_companion_membership_numbers = $2,
             organized_trip_details = $3::jsonb,
             requested_at = now(),
             updated_at = now()
         where id = $1`,
        [rows[0].id, filteredTravelCompanions, detailsJson],
      )
    } else {
      await query(
        `insert into public.fixture_ticket_requests
           (match_key, user_id, status, travel_companion_membership_numbers, organized_trip_details,
            deposit_confirmed, deposit_confirmed_at)
         values ($1, $2, 'pending', $3, $4::jsonb, true, now())`,
        [matchKey, req.user!.id, filteredTravelCompanions, detailsJson],
      )
    }
    await closeFixtureTicketWindowIfAtCapacity(matchKey)

    const { rows: emailRows } = await query<{
      profile_email: string | null
      auth_email: string | null
    }>(
      `select p.email as profile_email, au.email as auth_email
       from (select $1::uuid as user_id) u
       left join public.profiles p on p.id = u.user_id
       left join public.auth_users au on au.user_id = u.user_id
       limit 1`,
      [req.user!.id],
    )
    const to = (emailRows[0]?.profile_email || emailRows[0]?.auth_email || '').trim()
    if (to) {
      await sendClubTripConfirmedEmail({ to })
    }

    res.json({
      ok: true,
      isOrganizedClubTrip: true,
      depositAmountEur: expectedDepositEur,
      ticketSlotCount: requestedSlotCount,
      depositConfirmed: true,
      confirmationEmailSent: Boolean(to),
    })
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
      profile_email: string | null
      auth_email: string | null
      mobile_phone: string | null
      membership_number: number | null
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
      organized_trip_details: OrganizedTripDetails | null
    }>(
      `select ftr.id, ftr.match_key, ftr.user_id, ftr.status, ftr.requested_at,
              ftr.deposit_confirmed, ftr.deposit_confirmed_at, ftr.user_cancelled_at,
              ftr.balance_remaining_amount_eur, ftr.balance_payment_notified,
              ftr.balance_payment_notified_at, ftr.balance_payment_deadline,
              ftr.ticket_confirmed, ftr.ticket_confirmed_at, ftr.travel_companion_membership_numbers,
              ftr.organized_trip_details,
              m.first_name, m.last_name, p.full_name as profile_full_name,
              p.email as profile_email, au.email as auth_email,
              m.mobile_phone, m.membership_number,
              m.official_mu_membership_id, m.official_mu_membership_status, m.application_id
       from public.fixture_ticket_requests ftr
       left join public.profiles p on p.id = ftr.user_id
       left join public.auth_users au on au.user_id = ftr.user_id
       left join lateral (
         select ma.first_name, ma.last_name, ma.mobile_phone, ma.membership_number,
                ma.official_mu_membership_id, ma.official_mu_membership_status, ma.application_id
         from public.membership_applications ma
         where ma.user_id = ftr.user_id
         order by
           case when ma.sponsor_application_id is null then 0 else 1 end,
           case when ma.status = 'active' then 0 else 1 end,
           ma.submitted_at desc
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
          isOrganizedClubTrip: Boolean(r.organized_trip_details),
          organizedTripDetails: r.organized_trip_details ?? null,
          user: {
            fullName,
            membershipNumber: r.membership_number,
            mobilePhone: r.mobile_phone,
            email: (r.profile_email || r.auth_email || '').trim() || null,
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
    const requestId = String(req.params.id ?? '').trim()
    const { status } = req.body as { status: 'approved' | 'completed' | 'cancelled' }
    if (!requestId) throw badRequest('Request ID is required')
    if (status !== 'approved' && status !== 'completed' && status !== 'cancelled') {
      throw badRequest('Invalid ticket request status')
    }

    const { rows: existingRows } = await query<{
      status: string
      profile_email: string | null
      auth_email: string | null
    }>(
      `select ftr.status, p.email as profile_email, au.email as auth_email
       from public.fixture_ticket_requests ftr
       left join public.profiles p on p.id = ftr.user_id
       left join public.auth_users au on au.user_id = ftr.user_id
       where ftr.id = $1
       limit 1`,
      [requestId],
    )
    const existing = existingRows[0]
    if (!existing) throw notFound('Ticket request not found')

    if (status === 'completed' && existing.status !== 'completed') {
      const to = (existing.profile_email || existing.auth_email || '').trim()
      if (!to) {
        throw badRequest('No email address on file for this member.')
      }
      await sendTicketCompletedEmail({ to })
    }

    await query(`update public.fixture_ticket_requests set status = $1, updated_at = now() where id = $2`, [
      status,
      requestId,
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
      travel_companion_membership_numbers: number[] | null
    }>(
      `select ftr.deposit_confirmed, ftr.match_key, ftr.travel_companion_membership_numbers,
              p.email as profile_email, au.email as auth_email
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
      const ticketSlotCount = ticketSlotCountFromCompanionNumbers(existing.travel_companion_membership_numbers)
      const depositAmountEur = ticketDepositAmountEurFromCompanionNumbers(existing.travel_companion_membership_numbers)
      await sendTicketDepositConfirmedEmail({
        to,
        matchKey: existing.match_key,
        depositAmountEur,
        ticketSlotCount,
      })
    }

    const row = rows[0]
    res.json({
      ok: true,
      depositConfirmed: row.deposit_confirmed,
      depositConfirmedAt: row.deposit_confirmed_at,
    })
  }),
)

ticketsRouter.post(
  '/requests/:id/deposit-payment-reminder',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const requestId = String(req.params.id ?? '').trim()
    if (!requestId) throw badRequest('Request ID is required')

    const { rows } = await query<{
      deposit_confirmed: boolean
      user_cancelled_at: string | null
      travel_companion_membership_numbers: number[] | null
      profile_email: string | null
      auth_email: string | null
    }>(
      `select ftr.deposit_confirmed, ftr.user_cancelled_at, ftr.travel_companion_membership_numbers,
              p.email as profile_email, au.email as auth_email
       from public.fixture_ticket_requests ftr
       left join public.profiles p on p.id = ftr.user_id
       left join public.auth_users au on au.user_id = ftr.user_id
       where ftr.id = $1
       limit 1`,
      [requestId],
    )
    const request = rows[0]
    if (!request) throw notFound('Ticket request not found')
    if (request.deposit_confirmed) {
      throw badRequest('Deposit is already confirmed for this ticket request.')
    }
    if (request.user_cancelled_at) {
      throw badRequest('Cannot send a deposit reminder for a cancelled ticket request.')
    }

    const to = (request.profile_email || request.auth_email || '').trim()
    if (!to) throw badRequest('No email address on file for this member.')

    const ticketSlotCount = ticketSlotCountFromCompanionNumbers(request.travel_companion_membership_numbers)
    const depositAmountEur = ticketDepositAmountEurFromCompanionNumbers(
      request.travel_companion_membership_numbers,
    )
    await sendTicketDepositPaymentReminderEmail({
      to,
      depositAmountEur,
      ticketSlotCount,
    })

    res.json({ ok: true })
  }),
)

ticketsRouter.post(
  '/requests/:id/balance-payment-reminder',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const requestId = String(req.params.id ?? '').trim()
    if (!requestId) throw badRequest('Request ID is required')

    const { rows } = await query<{
      deposit_confirmed: boolean
      user_cancelled_at: string | null
      ticket_confirmed: boolean
      balance_payment_notified: boolean
      balance_remaining_amount_eur: string | number | null
      balance_payment_deadline: string | null
      profile_email: string | null
      auth_email: string | null
    }>(
      `select ftr.deposit_confirmed, ftr.user_cancelled_at, ftr.ticket_confirmed,
              ftr.balance_payment_notified, ftr.balance_remaining_amount_eur, ftr.balance_payment_deadline,
              p.email as profile_email, au.email as auth_email
       from public.fixture_ticket_requests ftr
       left join public.profiles p on p.id = ftr.user_id
       left join public.auth_users au on au.user_id = ftr.user_id
       where ftr.id = $1
       limit 1`,
      [requestId],
    )
    const request = rows[0]
    if (!request) throw notFound('Ticket request not found')
    if (request.user_cancelled_at) {
      throw badRequest('Cannot send a remaining amount reminder for a cancelled ticket request.')
    }
    if (!request.deposit_confirmed) {
      throw badRequest('Deposit must be confirmed before sending a remaining amount reminder.')
    }
    if (request.ticket_confirmed) {
      throw badRequest('Ticket is already confirmed for this request.')
    }
    if (!request.balance_payment_notified) {
      throw badRequest('Send the remaining amount email first before sending a reminder.')
    }
    const balanceRemainingAmountEur =
      request.balance_remaining_amount_eur == null ? null : Number(request.balance_remaining_amount_eur)
    if (balanceRemainingAmountEur == null || !Number.isFinite(balanceRemainingAmountEur) || balanceRemainingAmountEur <= 0) {
      throw badRequest('No remaining balance amount is set for this ticket request.')
    }

    const to = (request.profile_email || request.auth_email || '').trim()
    if (!to) throw badRequest('No email address on file for this member.')

    await sendTicketBalancePaymentReminderEmail({
      to,
      balanceRemainingAmountEur,
      paymentDeadline: request.balance_payment_deadline,
    })

    res.json({ ok: true })
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
      travel_companion_membership_numbers: number[] | null
    }>(
      `select ftr.balance_payment_notified, ftr.match_key, p.email as profile_email, au.email as auth_email,
              ftr.balance_remaining_amount_eur, ftr.balance_payment_deadline,
              ftr.travel_companion_membership_numbers
       from public.fixture_ticket_requests ftr
       left join public.profiles p on p.id = ftr.user_id
       left join public.auth_users au on au.user_id = ftr.user_id
       where ftr.id = $1
       limit 1`,
      [requestId],
    )
    const existing = existingRows[0]
    if (!existing) throw notFound('Ticket request not found')

    const ticketSlotCount = ticketSlotCountFromCompanionNumbers(existing.travel_companion_membership_numbers)
    const perTicketAmountEur = balanceRemainingAmountEur
    const totalBalanceRemainingAmountEur =
      perTicketAmountEur == null
        ? null
        : Math.round(perTicketAmountEur * ticketSlotCount * 100) / 100

    const resolvedAmount =
      totalBalanceRemainingAmountEur ??
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
      [totalBalanceRemainingAmountEur, balancePaymentNotified, balancePaymentDeadlineIso, requestId],
    )
    if (rows.length === 0) throw notFound('Ticket request not found')

    if (balancePaymentNotified && !existing.balance_payment_notified) {
      const to = (existing.profile_email || existing.auth_email || '').trim()
      if (!to) {
        throw badRequest('No email address on file for this member.')
      }
      const amountForEmail = resolvedAmount!
      const perTicketForEmail =
        perTicketAmountEur ??
        Math.round((amountForEmail / ticketSlotCount) * 100) / 100
      const rawDeadline = rows[0].balance_payment_deadline ?? resolvedDeadline!
      const deadlineForEmail =
        rawDeadline instanceof Date
          ? `${rawDeadline.getUTCFullYear()}-${String(rawDeadline.getUTCMonth() + 1).padStart(2, '0')}-${String(rawDeadline.getUTCDate()).padStart(2, '0')}`
          : String(rawDeadline).slice(0, 10)
      await sendTicketBalancePaymentEmail({
        to,
        matchKey: existing.match_key,
        balanceRemainingAmountEur: amountForEmail,
        perTicketAmountEur: perTicketForEmail,
        ticketSlotCount,
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
