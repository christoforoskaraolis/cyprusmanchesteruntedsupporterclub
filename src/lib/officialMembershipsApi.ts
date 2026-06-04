import { apiGet, apiSend, asError } from './apiClient'
import type { OfficialMuMembershipStatus } from './membershipApi.ts'

export type OfficialMembershipOffer = {
  id: string
  title: string
  priceEur: number
  imageUrl: string
  createdAt: string
  updatedAt: string
}

export type OfficialMembershipRequest = {
  id: string
  offerId: string
  status: 'pending' | 'completed' | 'rejected' | 'cancelled'
  requestedAt: string
  membershipApplicationId: string | null
}

export type AdminOfficialMembershipRequest = OfficialMembershipRequest & {
  userId: string
  offerTitle: string
  offerPriceEur: number
  user: {
    fullName: string | null
    email: string | null
    mobilePhone: string | null
    dateOfBirth: string | null
    address: string | null
    area: string | null
    postalCode: string | null
    city: string | null
    country: string | null
    officialMuMembershipId: string | null
    officialMuMembershipStatus: OfficialMuMembershipStatus | null
    applicationId: string | null
  }
}

export async function fetchOfficialMembershipOffers() {
  try {
    const data = await apiGet<{ rows: OfficialMembershipOffer[] }>('/api/official-memberships')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as OfficialMembershipOffer[], error: asError(error) }
  }
}

export async function createOfficialMembershipOffer(payload: { title: string; priceEur: number; imageUrl: string }) {
  try {
    await apiSend('/api/official-memberships', 'POST', payload)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function deleteOfficialMembershipOffer(id: string) {
  try {
    await apiSend(`/api/official-memberships/${id}`, 'DELETE')
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateOfficialMembershipOffer(
  id: string,
  payload: { title: string; priceEur: number; imageUrl?: string },
) {
  try {
    await apiSend(`/api/official-memberships/${id}`, 'PUT', payload)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function reorderOfficialMembershipOffers(ids: string[]) {
  try {
    await apiSend('/api/official-memberships/reorder', 'PUT', { ids })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function fetchMyOfficialMembershipRequests() {
  try {
    const data = await apiGet<{ rows: OfficialMembershipRequest[] }>('/api/official-memberships/requests/my')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as OfficialMembershipRequest[], error: asError(error) }
  }
}

export async function createOfficialMembershipRequest(
  offerId: string,
  membershipApplicationId?: string,
) {
  try {
    await apiSend('/api/official-memberships/requests', 'POST', { offerId, membershipApplicationId })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function fetchAdminOfficialMembershipRequests() {
  try {
    const data = await apiGet<{ rows: AdminOfficialMembershipRequest[] }>('/api/official-memberships/requests')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as AdminOfficialMembershipRequest[], error: asError(error) }
  }
}

export async function setAdminOfficialMembershipRequestStatus(
  requestId: string,
  status: 'pending' | 'completed' | 'rejected' | 'cancelled',
  options?: {
    officialMuMembershipId?: string
    officialMuMembershipStatus?: OfficialMuMembershipStatus
  },
) {
  try {
    await apiSend(`/api/official-memberships/requests/${requestId}/status`, 'PUT', {
      status,
      officialMuMembershipId: options?.officialMuMembershipId,
      officialMuMembershipStatus: options?.officialMuMembershipStatus,
    })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function deleteAdminOfficialMembershipRequest(requestId: string) {
  try {
    await apiSend(`/api/official-memberships/requests/${requestId}`, 'DELETE')
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}
