import { defaultMembershipValidUntilIso } from './membershipSeason.ts'
import { apiGet, apiSend, asError } from './apiClient'

/** User-reported status of official Manchester United membership at application time. */
export type OfficialMuMembershipStatus = 'activated' | 'pending'

export const FAMILY_RELATIONSHIP_OPTIONS = [
  { value: 'spouse', label: 'Spouse / Partner' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'other', label: 'Other' },
] as const

export type FamilyRelationshipValue = (typeof FAMILY_RELATIONSHIP_OPTIONS)[number]['value']

export function formatFamilyRelationship(
  relationship: string | null | undefined,
  otherDetail?: string | null,
): string {
  if (!relationship?.trim()) return '—'
  const match = FAMILY_RELATIONSHIP_OPTIONS.find((o) => o.value === relationship)
  if (relationship === 'other') {
    const detail = (otherDetail ?? '').trim()
    return detail ? `Other — ${detail}` : 'Other'
  }
  return match?.label ?? relationship
}

export function formatOfficialMuMembershipStatus(
  status: OfficialMuMembershipStatus | null | undefined,
): string {
  if (status === 'activated') return 'Activated'
  if (status === 'pending') return 'Pending'
  return '—'
}

export type OfficialMuMembershipFormStatus = OfficialMuMembershipStatus | ''

export function parseOfficialMuMembershipFields(
  officialMuMembershipId: string,
  officialMuMembershipStatus: OfficialMuMembershipFormStatus,
):
  | { officialMuMembershipId: string; officialMuMembershipStatus: OfficialMuMembershipStatus | null }
  | { error: string } {
  const muId = officialMuMembershipId.trim()
  const muStatus =
    officialMuMembershipStatus === 'activated' || officialMuMembershipStatus === 'pending'
      ? officialMuMembershipStatus
      : null
  if (muStatus && !muId) {
    return { error: 'Please enter your official Manchester United membership number.' }
  }
  if (!muStatus && muId) {
    return {
      error:
        'Choose Activated or Pending when you enter a membership number, or select Not applicable if you do not have official MU membership yet.',
    }
  }
  return { officialMuMembershipId: muId, officialMuMembershipStatus: muStatus }
}

export type MemberRegistryEntry = {
  applicationId: string
  email: string | null
  status: 'pending' | 'active'
  submittedAt: string
  activatedAt?: string
  /** Last day of current paid season (YYYY-MM-DD); drives renewal notice window. */
  validUntil: string | null
  /** Set when status is active; sequential club member number (display with formatMembershipNumber). */
  membershipNumber: number | null
  firstName: string
  lastName: string
  mobilePhone: string
  dateOfBirth: string
  address: string
  area: string
  postalCode: string
  city: string
  country: string
  officialMuMembershipId: string
  officialMuMembershipStatus: OfficialMuMembershipStatus | null
  /** Set when this application is a family member under the account holder's membership. */
  sponsorApplicationId: string | null
  familyRelationship: string | null
  familyRelationshipOther: string | null
}

export type MemberApplicationPayload = Omit<
  MemberRegistryEntry,
  | 'applicationId'
  | 'email'
  | 'status'
  | 'submittedAt'
  | 'activatedAt'
  | 'validUntil'
  | 'membershipNumber'
  | 'sponsorApplicationId'
>

export type DbMembershipApplication = {
  id: string
  user_id: string
  application_id: string
  status: 'pending' | 'active'
  first_name: string
  last_name: string
  mobile_phone: string
  date_of_birth: string
  address: string
  area: string
  postal_code: string
  city: string
  country: string
  official_mu_membership_id: string | null
  official_mu_membership_status: OfficialMuMembershipStatus | null
  submitted_at: string
  activated_at: string | null
  membership_number?: number | null
  valid_until?: string | null
  profile_email?: string | null
  sponsor_application_id?: string | null
  family_relationship?: string | null
  family_relationship_other?: string | null
}

export type DbRenewalRequest = {
  id: string
  user_id: string
  application_id: string
  status: 'pending' | 'completed' | 'rejected'
  submitted_at: string
  resolved_at: string | null
}

export type PendingRenewalListRow = DbRenewalRequest & {
  membership_applications: {
    first_name: string
    last_name: string
    valid_until: string | null
  } | null
}

export function generateApplicationId(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  try {
    const part = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()
    return `CMUSC-${ymd}-${part}`
  } catch {
    return `CMUSC-${ymd}-${Math.random().toString(36).slice(2, 14).toUpperCase()}`
  }
}

/** Display as 01, 02, … (no leading-zero cap past 99). */
export function formatMembershipNumber(n: number | null | undefined): string {
  if (n == null || n < 1) return '—'
  return n < 100 ? String(n).padStart(2, '0') : String(n)
}

export function dbRowToMemberEntry(row: DbMembershipApplication): MemberRegistryEntry {
  return {
    applicationId: row.application_id,
    email: row.profile_email ?? null,
    status: row.status,
    submittedAt: row.submitted_at,
    activatedAt: row.activated_at ?? undefined,
    validUntil: row.valid_until ?? null,
    membershipNumber: row.membership_number ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    mobilePhone: row.mobile_phone,
    dateOfBirth: row.date_of_birth,
    address: row.address,
    area: row.area,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    officialMuMembershipId: row.official_mu_membership_id ?? '',
    officialMuMembershipStatus:
      row.official_mu_membership_status === 'activated' || row.official_mu_membership_status === 'pending'
        ? row.official_mu_membership_status
        : null,
    sponsorApplicationId: row.sponsor_application_id ?? null,
    familyRelationship: row.family_relationship ?? null,
    familyRelationshipOther: row.family_relationship_other ?? null,
  }
}

export async function fetchMyFamilyMembers(sponsorApplicationId: string) {
  try {
    const data = await apiGet<{ rows: DbMembershipApplication[] }>(
      `/api/membership/family-members?sponsorApplicationId=${encodeURIComponent(sponsorApplicationId)}`,
    )
    return { rows: data.rows.map(dbRowToMemberEntry), error: undefined }
  } catch (error) {
    return { rows: [] as MemberRegistryEntry[], error: asError(error) }
  }
}

export async function fetchMyLatestApplication(userId: string) {
  void userId
  try {
    const data = await apiGet<{ row: DbMembershipApplication | null }>('/api/membership/my-latest')
    return { row: data.row, error: undefined }
  } catch (error) {
    return { row: null, error: asError(error) }
  }
}

export async function insertMembershipApplication(
  userId: string,
  applicationId: string,
  payload: MemberApplicationPayload,
  options?: { sponsorApplicationId?: string | null },
) {
  void userId
  try {
    const data = await apiSend<{ ok: boolean; applicationId: string }>('/api/membership/applications', 'POST', {
      applicationId,
      ...payload,
      sponsorApplicationId: options?.sponsorApplicationId ?? null,
    })
    return { applicationId: data.applicationId, error: undefined }
  } catch (error) {
    return { applicationId: undefined as string | undefined, error: asError(error) }
  }
}

export type MyProfileRow = { email: string | null; fullName: string | null }

export async function fetchMyProfile(userId: string) {
  void userId
  try {
    const data = await apiGet<{ profile: MyProfileRow | null }>('/api/membership/profile')
    return { profile: data.profile, error: undefined }
  } catch (error) {
    return { profile: null as MyProfileRow | null, error: asError(error) }
  }
}

export async function updateMyProfileDetails(payload: {
  fullName: string
  mobilePhone: string
  address: string
  area: string
  postalCode: string
  city: string
  country: string
  officialMuMembershipId: string
  officialMuMembershipStatus: OfficialMuMembershipStatus | null
}) {
  try {
    await apiSend('/api/membership/profile', 'PUT', payload)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function fetchAllMembershipApplications() {
  try {
    const data = await apiGet<{ rows: DbMembershipApplication[] }>('/api/membership/applications')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as DbMembershipApplication[], error: asError(error) }
  }
}

export async function setApplicationStatus(applicationId: string, status: 'pending' | 'active') {
  void defaultMembershipValidUntilIso
  try {
    await apiSend(`/api/membership/applications/${applicationId}/status`, 'PUT', { status })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateApplicationMemberId(
  applicationId: string,
  memberId: string,
  officialMuMembershipStatus: OfficialMuMembershipStatus | null,
) {
  try {
    await apiSend(`/api/membership/applications/${applicationId}/member-id`, 'PUT', {
      memberId,
      officialMuMembershipStatus,
    })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function deleteMembershipApplication(applicationId: string) {
  try {
    await apiSend(`/api/membership/applications/${applicationId}`, 'DELETE')
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateApplicationMembershipNumber(applicationId: string, membershipNumber: number | null) {
  try {
    await apiSend(`/api/membership/applications/${applicationId}/membership-number`, 'PUT', { membershipNumber })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function insertRenewalRequest(userId: string, applicationId: string) {
  void userId
  try {
    await apiSend('/api/membership/renewals', 'POST', { applicationId })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function fetchMyPendingRenewal(applicationId: string) {
  try {
    const data = await apiGet<{ row: DbRenewalRequest | null }>(
      `/api/membership/renewals/my-pending/${applicationId}`,
    )
    return { row: data.row, error: undefined }
  } catch (error) {
    return { row: null as DbRenewalRequest | null, error: asError(error) }
  }
}

export async function fetchPendingRenewalRequests() {
  try {
    const data = await apiGet<{ rows: PendingRenewalListRow[] }>('/api/membership/renewals/pending')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as PendingRenewalListRow[], error: asError(error) }
  }
}

export async function completeRenewalRequest(renewalId: string, applicationId: string, nextValidUntilIso: string) {
  try {
    await apiSend(`/api/membership/renewals/${renewalId}/complete`, 'PUT', { applicationId, nextValidUntilIso })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}
