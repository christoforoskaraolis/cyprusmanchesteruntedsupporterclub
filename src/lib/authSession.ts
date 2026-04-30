const AUTH_TOKEN_KEY = 'cmusc_auth_token'

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY)
  return token && token.trim() ? token : null
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}
