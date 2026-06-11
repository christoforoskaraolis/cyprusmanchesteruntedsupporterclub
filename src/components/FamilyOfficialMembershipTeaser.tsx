import { formatFamilyRelationship } from '../lib/membershipApi.ts'
import type { MemberRegistryEntry } from '../lib/membershipApi.ts'
import type { OfficialMembershipRequest } from '../lib/officialMembershipsApi.ts'
import { shouldShowOfficialMembershipRegistration } from '../lib/officialMembershipHelpers.ts'

type FamilyOfficialMembershipTeaserProps = {
  familyMember: MemberRegistryEntry
  myOfficialRequests: OfficialMembershipRequest[]
  onRegister: () => void
}

export function FamilyOfficialMembershipTeaser({
  familyMember,
  myOfficialRequests,
  onRegister,
}: FamilyOfficialMembershipTeaserProps) {
  if (!shouldShowOfficialMembershipRegistration(familyMember, myOfficialRequests)) {
    return null
  }

  const name = `${familyMember.firstName} ${familyMember.lastName}`.trim()
  const relationship = formatFamilyRelationship(
    familyMember.familyRelationship,
    familyMember.familyRelationshipOther,
  )

  return (
    <div
      className="mycmusc-family-official-teaser"
      aria-label={`Official Manchester United membership for ${name}`}
    >
      <p className="mycmusc-family-official-teaser-eyebrow">Family members only</p>
      <p className="mycmusc-family-official-teaser-lead">
        Register official Manchester United membership for{' '}
        <strong>{name}</strong>
        {relationship ? (
          <>
            {' '}
            (<strong>{relationship}</strong>)
          </>
        ) : null}
        . This option is only for family members on your account — not for your own membership.
      </p>
      <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--primary" onClick={onRegister}>
        Register official MU membership for {familyMember.firstName || 'family member'}
      </button>
    </div>
  )
}
