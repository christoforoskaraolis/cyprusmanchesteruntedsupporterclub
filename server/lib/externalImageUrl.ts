import { badRequest } from './errors.ts'
import { isEmbeddedDataUrlImage } from './embeddedImage.ts'

export function isExternalImageUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || isEmbeddedDataUrlImage(trimmed)) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeExternalImageUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

export function requireExternalImageUrl(value: string | null | undefined, fieldLabel: string): string {
  const normalized = normalizeExternalImageUrl(value)
  if (!normalized) throw badRequest(`${fieldLabel} is required`)
  if (!isExternalImageUrl(normalized)) {
    throw badRequest(`${fieldLabel} must be an http(s) link — upload to Cloudinary (or similar) and paste the URL`)
  }
  return normalized
}

export function parseExternalImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const urls: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = normalizeExternalImageUrl(item)
    if (!normalized) continue
    if (!isExternalImageUrl(normalized)) {
      throw badRequest('Each product photo must be an http(s) link — not an uploaded file')
    }
    urls.push(normalized)
  }
  return urls
}
