import { apiGet, apiSend, asError } from './apiClient'

export type MemberEmailAudience = 'all' | 'pending' | 'active'

export type MemberEmailRecipient = {
  email: string
  fullName: string | null
  status: string
}

export async function fetchMemberEmailRecipients(audience: MemberEmailAudience) {
  try {
    const data = await apiGet<{
      audience: MemberEmailAudience
      recipientCount: number
      recipients: MemberEmailRecipient[]
    }>(`/api/admin/emails/recipients?audience=${encodeURIComponent(audience)}`)
    return { ...data, error: undefined }
  } catch (error) {
    return {
      audience,
      recipientCount: 0,
      recipients: [] as MemberEmailRecipient[],
      error: asError(error),
    }
  }
}

export async function sendMemberBulkEmail(payload: {
  audience: MemberEmailAudience
  subject: string
  body: string
}) {
  try {
    const data = await apiSend<{
      audience: MemberEmailAudience
      recipientCount: number
      sentCount: number
      failedCount: number
      failedEmails: string[]
      skippedNoEmail?: number
    }>('/api/admin/emails/send', 'POST', payload)
    return { ...data, error: undefined }
  } catch (error) {
    return {
      audience: payload.audience,
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      failedEmails: [] as string[],
      error: asError(error),
    }
  }
}

export async function sendMemberSelectedEmail(payload: {
  applicationIds: string[]
  subject: string
  body: string
}) {
  try {
    const data = await apiSend<{
      applicationIds: string[]
      recipientCount: number
      sentCount: number
      failedCount: number
      failedEmails: string[]
      skippedNoEmail: number
      missingEmailApplicationIds: string[]
    }>('/api/admin/emails/send-selected', 'POST', payload)
    return { ...data, error: undefined }
  } catch (error) {
    return {
      applicationIds: payload.applicationIds,
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      failedEmails: [] as string[],
      skippedNoEmail: 0,
      missingEmailApplicationIds: [] as string[],
      error: asError(error),
    }
  }
}
