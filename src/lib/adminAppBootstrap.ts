export const ADMIN_PORTAL_URL = 'https://app.manutd-cyprus.com/admin'

export function isAdminPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === '/admin'
}

/** Run before React mounts — only handle explicit admin-app launch URLs. */
export function bootstrapAdminAppRoute(): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/admin' && url.searchParams.get('source') === 'admin-app') {
    window.location.replace('/admin')
    return
  }

  if (path === '/' && url.searchParams.get('source') === 'admin-app') {
    window.location.replace('/admin')
  }
}
