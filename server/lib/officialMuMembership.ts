import { badRequest } from './errors.ts'

export type OfficialMuMembershipStatus = 'activated' | 'pending'

export function parseOfficialMuMembershipFields(
  rawId: string | undefined,
  rawStatus: string | undefined,
): { officialMuId: string; officialMuStatus: OfficialMuMembershipStatus | null } {
  const officialMuId = (rawId ?? '').trim()
  const officialMuStatus =
    rawStatus === 'activated' || rawStatus === 'pending' ? rawStatus : null
  if (officialMuStatus && !officialMuId) {
    throw badRequest('Please enter the official Manchester United membership number.')
  }
  if (!officialMuStatus && officialMuId) {
    throw badRequest(
      'Choose activated or pending for the official membership status, or clear the membership number.',
    )
  }
  return { officialMuId, officialMuStatus }
}
