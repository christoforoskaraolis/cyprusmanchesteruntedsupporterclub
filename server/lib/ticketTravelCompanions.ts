import { query } from '../db.ts'
import { badRequest } from './errors.ts'

function formatMycs(membershipNumber: number): string {
  return String(membershipNumber).padStart(2, '0')
}

export function ticketSlotCountFromCompanionNumbers(
  travelCompanionMembershipNumbers: number[] | null | undefined,
): number {
  return 1 + (travelCompanionMembershipNumbers?.length ?? 0)
}

export async function validateTravelCompanionMembershipNumbers(
  membershipNumbers: number[],
): Promise<void> {
  if (membershipNumbers.length === 0) return

  const { rows } = await query<{
    membership_number: number
    status: string
    official_mu_membership_status: string | null
  }>(
    `select distinct on (membership_number) membership_number, status, official_mu_membership_status
     from public.membership_applications
     where membership_number = any($1::int[])
     order by membership_number, case when status = 'active' then 0 else 1 end, submitted_at desc`,
    [membershipNumbers],
  )

  const byNumber = new Map(rows.map((row) => [row.membership_number, row]))

  for (const membershipNumber of membershipNumbers) {
    const label = formatMycs(membershipNumber)
    const member = byNumber.get(membershipNumber)
    if (!member || member.status !== 'active') {
      throw badRequest(`Member MYCS ${label} does not have an active Cyprus membership.`)
    }
    if (member.official_mu_membership_status !== 'activated') {
      throw badRequest(`Member MYCS ${label} does not have active official membership.`)
    }
  }
}
