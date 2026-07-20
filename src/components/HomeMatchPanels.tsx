import type { UpcomingFixture } from '../lib/fixturesApi.ts'
import { useLivescore } from '../lib/useLivescore.ts'
import { LiveScoreBar } from './LiveScoreBar.tsx'
import { NextMatchCard } from './NextMatchCard.tsx'

type HomeMatchPanelsProps = {
  nextFixture: UpcomingFixture | null
}

export function HomeMatchPanels({ nextFixture }: HomeMatchPanelsProps) {
  const livescore = useLivescore()
  const hideNextMatch = livescore?.isLive === true

  return (
    <>
      <LiveScoreBar livescore={livescore} />
      <NextMatchCard fixture={hideNextMatch ? null : nextFixture} />
    </>
  )
}
