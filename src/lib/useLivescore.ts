import { useEffect, useState } from 'react'
import { fetchCurrentLivescore, type PublicLivescore } from '../lib/livescoreApi.ts'

export function useLivescore() {
  const [livescore, setLivescore] = useState<PublicLivescore | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function load() {
      const { livescore: next } = await fetchCurrentLivescore()
      if (cancelled) return
      setLivescore(next)
      const delay = next?.isLive ? 20_000 : next?.active ? 60_000 : 120_000
      timer = setTimeout(() => {
        void load()
      }, delay)
    }

    void load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return livescore
}
