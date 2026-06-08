import { useEffect, useState } from 'react'
import { hasAdminAppIntent, isAdminPath, markAdminAppIntent } from '../lib/adminAppBootstrap.ts'

export function useAdminRoute(): boolean {
  const [isAdminRoute, setIsAdminRoute] = useState(() =>
    typeof window !== 'undefined' ? isAdminPath(window.location.pathname) : false,
  )

  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/'

    if (path === '/' && hasAdminAppIntent()) {
      window.location.replace('/admin')
      return
    }

    const onAdmin = isAdminPath(window.location.pathname)
    setIsAdminRoute(onAdmin)
    if (onAdmin) {
      markAdminAppIntent()
    }

    const sync = () => {
      setIsAdminRoute(isAdminPath(window.location.pathname))
    }

    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return isAdminRoute
}
