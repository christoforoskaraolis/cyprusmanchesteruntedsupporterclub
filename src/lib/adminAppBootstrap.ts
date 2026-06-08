export const ADMIN_APP_STORAGE_KEY = 'cmusc_admin_app'
export const ADMIN_APP_COOKIE = 'cmusc_admin_app'

export function isAdminPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === '/admin'
}

function adminCookieAttributes(): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  return `; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
}

export function markAdminAppIntent(): void {
  try {
    window.localStorage.setItem(ADMIN_APP_STORAGE_KEY, '1')
  } catch {
    /* ignore storage errors */
  }
  try {
    document.cookie = `${ADMIN_APP_COOKIE}=1${adminCookieAttributes()}`
  } catch {
    /* ignore cookie errors */
  }
}

export const ADMIN_PORTAL_URL = 'https://app.manutd-cyprus.com/admin'

export function hasAdminAppIntent(): boolean {
  try {
    return window.localStorage.getItem(ADMIN_APP_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Run before React mounts so admin home-screen shortcuts open /admin. */
export function bootstrapAdminAppRoute(): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (url.searchParams.get('source') === 'admin-app' || path === '/admin') {
    markAdminAppIntent()
  }

  if (path === '/' && hasAdminAppIntent()) {
    window.location.replace('/admin')
    return
  }

  if (path === '/admin') {
    if (url.searchParams.get('source') === 'admin-app') {
      window.location.replace('/admin')
      return
    }
    markAdminAppIntent()
  }
}
