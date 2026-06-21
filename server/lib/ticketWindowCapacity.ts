import { query } from '../db.ts'
import { badRequest } from './errors.ts'
import { ticketSlotCountFromCompanionNumbers } from './ticketTravelCompanions.ts'

const ACTIVE_TICKET_SLOT_SQL = `coalesce(sum(1 + coalesce(cardinality(travel_companion_membership_numbers), 0)), 0)`

export async function countActiveFixtureTicketSlots(matchKey: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `select ${ACTIVE_TICKET_SLOT_SQL}::text as n
     from public.fixture_ticket_requests
     where match_key = $1
       and user_cancelled_at is null
       and status not in ('cancelled', 'rejected')`,
    [matchKey],
  )
  return Number(rows[0]?.n ?? 0)
}

export async function countActiveFixtureTicketSlotsByMatchKeys(
  matchKeys: string[],
): Promise<Map<string, number>> {
  if (matchKeys.length === 0) return new Map()
  const { rows } = await query<{ match_key: string; n: string }>(
    `select match_key, ${ACTIVE_TICKET_SLOT_SQL}::text as n
     from public.fixture_ticket_requests
     where match_key = any($1::text[])
       and user_cancelled_at is null
       and status not in ('cancelled', 'rejected')
     group by match_key`,
    [matchKeys],
  )
  return new Map(rows.map((r) => [r.match_key, Number(r.n)]))
}

export async function closeFixtureTicketWindowIfAtCapacity(matchKey: string): Promise<boolean> {
  const { rows } = await query<{ max_tickets: number | null; request_status: string }>(
    `select max_tickets, request_status
     from public.fixture_ticket_windows
     where match_key = $1
     limit 1`,
    [matchKey],
  )
  const window = rows[0]
  if (!window?.max_tickets || window.request_status !== 'open') return false

  const activeSlotCount = await countActiveFixtureTicketSlots(matchKey)
  if (activeSlotCount < window.max_tickets) return false

  await query(
    `update public.fixture_ticket_windows
     set request_status = 'closed', updated_at = now()
     where match_key = $1 and request_status = 'open'`,
    [matchKey],
  )
  return true
}

export async function assertFixtureTicketCapacityAvailable(
  matchKey: string,
  options?: { existingRequestId?: string | null; requestedSlotCount?: number },
): Promise<void> {
  const { rows } = await query<{ max_tickets: number | null; request_status: string }>(
    `select max_tickets, request_status
     from public.fixture_ticket_windows
     where match_key = $1
     limit 1`,
    [matchKey],
  )
  const window = rows[0]
  if (!window || window.request_status !== 'open') {
    throw badRequest('Ticket requests are not open for this match.')
  }
  if (window.max_tickets == null) return

  const requestedSlotCount = options?.requestedSlotCount ?? 1

  let existingSlotCount = 0
  if (options?.existingRequestId) {
    const { rows: existingRows } = await query<{
      user_cancelled_at: string | null
      status: string
      travel_companion_membership_numbers: number[] | null
    }>(
      `select user_cancelled_at, status, travel_companion_membership_numbers
       from public.fixture_ticket_requests
       where id = $1
       limit 1`,
      [options.existingRequestId],
    )
    const existing = existingRows[0]
    if (existing && !existing.user_cancelled_at && !['cancelled', 'rejected'].includes(existing.status)) {
      existingSlotCount = ticketSlotCountFromCompanionNumbers(existing.travel_companion_membership_numbers)
    }
  }

  const activeSlotCount = await countActiveFixtureTicketSlots(matchKey)
  const slotsNeeded = requestedSlotCount - existingSlotCount
  if (activeSlotCount + slotsNeeded > window.max_tickets) {
    throw badRequest('No ticket slots remaining for this match.')
  }
}
