import type { MemberRegistryEntry } from './membershipApi.ts'
import type { OfficialMembershipRequest } from './officialMembershipsApi.ts'

/** Official MU request created during Cyprus registration (not a separate later request). */
export function hasOfficialRequestFromRegistration(
  applicationId: string,
  myOfficialRequests: OfficialMembershipRequest[],
): boolean {
  return myOfficialRequests.some(
    (r) =>
      r.membershipApplicationId === applicationId &&
      (r.status === 'pending' || r.status === 'completed'),
  )
}

export function shouldShowOfficialMembershipRegistration(
  member: Pick<MemberRegistryEntry, 'applicationId' | 'officialMuMembershipStatus'>,
  myOfficialRequests: OfficialMembershipRequest[],
): boolean {
  if (member.officialMuMembershipStatus === 'activated') return false
  return !hasOfficialRequestFromRegistration(member.applicationId, myOfficialRequests)
}
