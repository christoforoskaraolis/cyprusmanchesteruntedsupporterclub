export function isEmbeddedDataUrlImage(value: string): boolean {
  return /^data:image\//i.test(value.trim())
}

export function parseImageStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function estimateEmbeddedImageBytes(value: string): number {
  const trimmed = value.trim()
  const match = trimmed.match(/^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i)
  if (!match) return trimmed.length
  const base64 = match[1].replace(/\s/g, '')
  return Math.floor((base64.length * 3) / 4)
}

export function stripEmbeddedImages(urls: string[]): { kept: string[]; removed: number; bytesRemoved: number } {
  let removed = 0
  let bytesRemoved = 0
  const kept: string[] = []
  for (const url of urls) {
    if (isEmbeddedDataUrlImage(url)) {
      removed += 1
      bytesRemoved += estimateEmbeddedImageBytes(url)
      continue
    }
    kept.push(url)
  }
  return { kept, removed, bytesRemoved }
}
