type CachedAuthUser = {
  id: string
  email: string | null
  isAdmin: boolean
}

const AUTH_USER_CACHE_TTL_MS = 5 * 60 * 1000

type CacheEntry = {
  user: CachedAuthUser
  expiresAt: number
}

const store = new Map<string, CacheEntry>()

export function getCachedAuthUser(userId: string): CachedAuthUser | null {
  const entry = store.get(userId)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    store.delete(userId)
    return null
  }
  return entry.user
}

export function setCachedAuthUser(user: CachedAuthUser): void {
  store.set(user.id, {
    user,
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
  })
}

export function invalidateCachedAuthUser(userId: string): void {
  store.delete(userId)
}
