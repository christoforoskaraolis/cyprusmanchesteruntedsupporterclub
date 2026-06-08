import { useEffect, useState } from 'react'
import { isAdminPath, markAdminAppIntent } from '../lib/adminAppBootstrap.ts'

export function useAdminRoute(): boolean {
  const [isAdminRoute, setIsAdminRoute] = useState(() =>
    typeof window !== 'undefined' ? isAdminPath(window.location.pathname) : false,
  )

  useEffect(() => {
    const sync = () => {
      const onAdmin = isAdminPath(window.location.pathname)
      setIsAdminRoute(onAdmin)
      if (onAdmin) {
        markAdminAppIntent()
        const path = window.location.pathname.replace(/\/+$/, '') || '/'
        if (path !== '/admin') {
          window.history.replaceState({}, '', '/admin')
        }
      }
    }

    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return isAdminRoute
}
