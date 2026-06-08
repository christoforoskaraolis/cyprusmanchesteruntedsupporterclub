import { useEffect, useState } from 'react'
import { isAdminPath } from '../lib/adminAppBootstrap.ts'

export function useAdminRoute(): boolean {
  const [isAdminRoute, setIsAdminRoute] = useState(() =>
    typeof window !== 'undefined' ? isAdminPath(window.location.pathname) : false,
  )

  useEffect(() => {
    const sync = () => {
      setIsAdminRoute(isAdminPath(window.location.pathname))
    }

    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return isAdminRoute
}
