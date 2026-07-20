import type { UpcomingFixture } from '../lib/fixturesApi.ts'

const CYPRUS_TZ = 'Asia/Nicosia'

function formatKickoffCyprus(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toLocaleString('en-GB', {
    timeZone: CYPRUS_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function matchTitle(fixture: UpcomingFixture): string {
  if (fixture.home) return `Manchester United vs ${fixture.opponent}`
  return `${fixture.opponent} vs Manchester United`
}

type NextMatchCardProps = {
  fixture: UpcomingFixture | null
}

export function NextMatchCard({ fixture }: NextMatchCardProps) {
  if (!fixture) return null

  return (
    <section className="next-match-card" aria-label="Next Manchester United match">
      <p className="next-match-card-eyebrow">Next match</p>
      <h2 className="next-match-card-title">{matchTitle(fixture)}</h2>
      <p className="next-match-card-kickoff">
        <strong>{formatKickoffCyprus(fixture.kickoffIso)}</strong>
        <span className="next-match-card-tz"> Cyprus time</span>
      </p>
      <p className="next-match-card-meta">
        {fixture.competition}
        {fixture.venue ? ` · ${fixture.venue}` : ''}
        {fixture.home ? ' · Home' : ' · Away'}
      </p>
    </section>
  )
}
