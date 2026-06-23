import { query } from '../db.ts'
import { badRequest } from './errors.ts'

export const TICKET_DEPOSIT_FEE_EUR = 50

function formatMycs(membershipNumber: number): string {
  return String(membershipNumber).padStart(2, '0')
}

export function ticketSlotCountFromCompanionNumbers(
  travelCompanionMembershipNumbers: number[] | null | undefined,
): number {
  return 1 + (travelCompanionMembershipNumbers?.length ?? 0)
}

export function ticketDepositAmountEurFromCompanionNumbers(
  travelCompanionMembershipNumbers: number[] | null | undefined,
): number {
  return TICKET_DEPOSIT_FEE_EUR * ticketSlotCountFromCompanionNumbers(travelCompanionMembershipNumbers)
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

export type TravelCompanionMemberLookup = {
  membershipNumber: number
  fullName: string | null
  found: boolean
  eligible: boolean
  ineligibleReason: string | null
}

function travelCompanionIneligibleReason(
  status: string,
  officialMuMembershipStatus: string | null,
): string | null {
  const reasons: string[] = []
  if (status !== 'active') {
    reasons.push('no active Cyprus membership')
  }
  if (officialMuMembershipStatus !== 'activated') {
    if (officialMuMembershipStatus === 'pending') {
      reasons.push('official MU membership is still pending')
    } else {
      reasons.push('no active official MU membership')
    }
  }
  if (reasons.length === 0) return null
  return reasons.join('; ')
}

export async function lookupMembersByMembershipNumbers(
  membershipNumbers: number[],
): Promise<TravelCompanionMemberLookup[]> {
  if (membershipNumbers.length === 0) return []

  const { rows } = await query<{
    membership_number: number
    first_name: string | null
    last_name: string | null
    profile_full_name: string | null
    status: string
    official_mu_membership_status: string | null
  }>(
    `select distinct on (ma.membership_number)
            ma.membership_number, ma.first_name, ma.last_name,
            p.full_name as profile_full_name, ma.status, ma.official_mu_membership_status
     from public.membership_applications ma
     left join public.profiles p on p.id = ma.user_id
     where ma.membership_number = any($1::int[])
     order by ma.membership_number, case when ma.status = 'active' then 0 else 1 end, ma.submitted_at desc`,
    [membershipNumbers],
  )

  const byNumber = new Map(rows.map((row) => [row.membership_number, row]))

  return membershipNumbers.map((membershipNumber) => {
    const row = byNumber.get(membershipNumber)
    if (!row) {
      return { membershipNumber, fullName: null, found: false, eligible: false, ineligibleReason: null }
    }
    const fullName =
      [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.profile_full_name?.trim() || null
    const ineligibleReason = travelCompanionIneligibleReason(row.status, row.official_mu_membership_status)
    const eligible = ineligibleReason == null
    return { membershipNumber, fullName, found: true, eligible, ineligibleReason }
  })
}
