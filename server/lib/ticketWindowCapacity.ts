import { query } from '../db.ts'
import { badRequest } from './errors.ts'

export async function countActiveFixtureTicketRequests(matchKey: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `select count(*)::text as n
     from public.fixture_ticket_requests
     where match_key = $1
       and user_cancelled_at is null
       and status not in ('cancelled', 'rejected')`,
    [matchKey],
  )
  return Number(rows[0]?.n ?? 0)
}

export async function countActiveFixtureTicketRequestsByMatchKeys(
  matchKeys: string[],
): Promise<Map<string, number>> {
  if (matchKeys.length === 0) return new Map()
  const { rows } = await query<{ match_key: string; n: string }>(
    `select match_key, count(*)::text as n
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

  const activeCount = await countActiveFixtureTicketRequests(matchKey)
  if (activeCount < window.max_tickets) return false

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
  options?: { existingRequestId?: string | null },
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

  let existingOccupiesSlot = false
  if (options?.existingRequestId) {
    const { rows: existingRows } = await query<{
      user_cancelled_at: string | null
      status: string
    }>(
      `select user_cancelled_at, status
       from public.fixture_ticket_requests
       where id = $1
       limit 1`,
      [options.existingRequestId],
    )
    const existing = existingRows[0]
    existingOccupiesSlot = Boolean(
      existing && !existing.user_cancelled_at && !['cancelled', 'rejected'].includes(existing.status),
    )
  }

  const activeCount = await countActiveFixtureTicketRequests(matchKey)
  const slotsNeeded = existingOccupiesSlot ? 0 : 1
  if (activeCount + slotsNeeded > window.max_tickets) {
    throw badRequest('No ticket slots remaining for this match.')
  }
}
