export type ParsedFixtureMatchKey = {
  kickoffIso: string
  competition: string
  opponent: string
  home: boolean
  venue: string
}

export function parseFixtureMatchKey(matchKey: string): ParsedFixtureMatchKey | null {
  const parts = matchKey.split('|')
  if (parts.length < 5) return null
  const [kickoffIso, competition, opponent, homeAway, ...venueParts] = parts
  if (!kickoffIso || !competition || !opponent || !homeAway) return null
  return {
    kickoffIso,
    competition,
    opponent,
    home: homeAway === 'H',
    venue: venueParts.join('|'),
  }
}

export function formatFixtureMatchLabel(parsed: ParsedFixtureMatchKey): string {
  if (parsed.home) return `Manchester United vs ${parsed.opponent}`
  return `${parsed.opponent} vs Manchester United`
}

export function formatFixtureMatchDateGreek(kickoffIso: string): string {
  const dt = new Date(kickoffIso)
  if (Number.isNaN(dt.getTime())) return kickoffIso

  const datePart = dt
    .toLocaleDateString('el-GR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/London',
    })
    .replace(/,\s*/g, ' ')

  const timePart = dt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
  })

  return `${datePart} στις ${timePart}`
}

export function formatFixtureMatchKeyForEmail(matchKey: string): { matchName: string; matchDate: string } {
  const parsed = parseFixtureMatchKey(matchKey)
  if (!parsed) {
    return { matchName: matchKey, matchDate: '—' }
  }
  return {
    matchName: formatFixtureMatchLabel(parsed),
    matchDate: formatFixtureMatchDateGreek(parsed.kickoffIso),
  }
}
