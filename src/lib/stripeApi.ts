import { apiGet, apiSend, asError } from './apiClient'

export type StripePaymentKind = 'membership' | 'renewal' | 'ticket' | 'merchandise' | 'official_membership'

export type StripeCheckoutPayload = {
  amountEur: number
  description: string
  paymentKind: StripePaymentKind
  referenceId?: string
  returnPath?: string
}

export async function fetchStripeConfig() {
  try {
    const data = await apiGet<{ enabled: boolean }>('/api/stripe/config')
    return { enabled: data.enabled, error: undefined }
  } catch (error) {
    return { enabled: false, error: asError(error) }
  }
}

export async function createStripeCheckoutSession(payload: StripeCheckoutPayload) {
  try {
    const data = await apiSend<{ url: string }>('/api/stripe/checkout-session', 'POST', payload)
    return { url: data.url, error: undefined }
  } catch (error) {
    return { url: undefined, error: asError(error) }
  }
}
