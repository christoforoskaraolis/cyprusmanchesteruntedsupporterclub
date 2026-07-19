import { useEffect, useState } from 'react'
import { fetchCurrentLivescore, type PublicLivescore } from '../lib/livescoreApi.ts'

function shortName(name: string): string {
  if (/manchester united/i.test(name)) return 'Man Utd'
  if (/manchester city/i.test(name)) return 'Man City'
  if (/tottenham/i.test(name)) return 'Spurs'
  if (/nottingham forest/i.test(name)) return "Nott'm Forest"
  if (/wolverhampton/i.test(name)) return 'Wolves'
  return name
}

export function LiveScoreBar() {
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

  if (!livescore?.active || !livescore.homeTeam || !livescore.awayTeam) return null

  const home = shortName(livescore.homeTeam)
  const away = shortName(livescore.awayTeam)
  const hg = livescore.homeGoals ?? 0
  const ag = livescore.awayGoals ?? 0
  const status = (livescore.statusShort ?? '').toUpperCase()
  let clock = ''
  if (livescore.isLive && status === 'HT') clock = 'HT'
  else if (livescore.isLive && livescore.elapsed != null) clock = `${livescore.elapsed}'`
  else if (status === 'FT' || status === 'AET' || status === 'PEN') clock = 'FT'

  return (
    <div
      className={`live-score-bar ${livescore.isLive ? 'is-live' : 'is-finished'}`}
      role="status"
      aria-live="polite"
    >
      <div className="live-score-bar-inner">
        <span className="live-score-bar-badge">{livescore.isLive ? 'LIVE' : 'FT'}</span>
        <span className="live-score-bar-match">
          <strong>
            {home} {hg}–{ag} {away}
          </strong>
          {clock ? <span className="live-score-bar-clock"> · {clock}</span> : null}
        </span>
        {livescore.competition ? (
          <span className="live-score-bar-comp">{livescore.competition}</span>
        ) : null}
      </div>
    </div>
  )
}
