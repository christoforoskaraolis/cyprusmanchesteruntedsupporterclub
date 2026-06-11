import {
  formatOfficialMuMembershipId,
  formatOfficialMuMembershipStatus,
} from '../lib/membershipApi.ts'
import type { MemberRegistryEntry } from '../lib/membershipApi.ts'
import type { OfficialMembershipRequest } from '../lib/officialMembershipsApi.ts'
import { shouldShowOfficialMembershipRegistration } from '../lib/officialMembershipHelpers.ts'

type OfficialMembershipTeaserProps = {
  membershipRecord: MemberRegistryEntry
  myOfficialRequests: OfficialMembershipRequest[]
  onOpenRequestPage: () => void
}

export function OfficialMembershipTeaser({
  membershipRecord,
  myOfficialRequests,
  onOpenRequestPage,
}: OfficialMembershipTeaserProps) {
  const isActivated = membershipRecord.officialMuMembershipStatus === 'activated'
  const pendingRequest = myOfficialRequests.find(
    (r) => r.status === 'pending' && r.membershipApplicationId === membershipRecord.applicationId,
  )

  if (!shouldShowOfficialMembershipRegistration(membershipRecord, myOfficialRequests)) {
    return null
  }

  return (
    <section className="mycmusc-profile-card official-membership-teaser" aria-label="Official Manchester United membership">
      <h2 className="mycmusc-profile-card-title">Official Manchester United membership</h2>

      {isActivated ? (
        <>
          <p className="official-membership-teaser-lead">
            Your official Manchester United membership is{' '}
            <strong>{formatOfficialMuMembershipStatus(membershipRecord.officialMuMembershipStatus)}</strong>.
          </p>
          {membershipRecord.officialMuMembershipId?.trim() && (
            <p className="official-membership-teaser-meta">
              ID: <strong>{formatOfficialMuMembershipId(membershipRecord.officialMuMembershipId)}</strong>
            </p>
          )}
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={onOpenRequestPage}
          >
            View membership packages
          </button>
        </>
      ) : (
        <>
          <p className="official-membership-teaser-lead">
            If you have still not registered for Official Manchester United Membership, click here to view the available
            packages and submit your request.
          </p>
          {pendingRequest && (
            <p className="official-membership-teaser-pending" role="status">
              You have a pending official membership request.
            </p>
          )}
          <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--primary" onClick={onOpenRequestPage}>
            Register for Official MU Membership
          </button>
        </>
      )}
    </section>
  )
}
