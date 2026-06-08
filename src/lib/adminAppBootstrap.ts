const ADMIN_APP_STORAGE_KEY = 'cmusc_admin_app'
const ADMIN_APP_QUERY = 'source=admin-app'

export function isAdminPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === '/admin'
}

export function markAdminAppIntent(): void {
  try {
    window.localStorage.setItem(ADMIN_APP_STORAGE_KEY, '1')
  } catch {
    /* ignore storage errors */
  }
}

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
    window.location.replace(`/admin?${ADMIN_APP_QUERY}`)
    return
  }

  if (path === '/admin' && url.searchParams.get('source') === 'admin-app') {
    url.searchParams.delete('source')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next || '/admin')
  }
}
