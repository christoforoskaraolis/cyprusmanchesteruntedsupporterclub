const ONE_HOUR_MS = 60 * 60 * 1000

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const store = new Map<string, CacheEntry<unknown>>()

export const responseCacheKeys = {
  news: 'GET /api/news',
  fixturesCache: 'GET /api/fixtures/cache',
  merchandiseProducts: 'GET /api/merchandise/products',
  officialMemberships: 'GET /api/official-memberships',
} as const

export const RESPONSE_CACHE_TTL_MS = ONE_HOUR_MS

export function invalidateResponseCache(key: string): void {
  store.delete(key)
}

export async function getCachedResponse<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now()
  const cached = store.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value as T
  }

  const value = await loader()
  store.set(key, { expiresAt: now + ttlMs, value })
  return value
}
