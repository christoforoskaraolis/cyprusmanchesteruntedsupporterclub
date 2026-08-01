import type { UpcomingFixture } from '../lib/fixturesApi.ts'
import { NextMatchCard } from './NextMatchCard.tsx'

type HomeMatchPanelsProps = {
  nextFixture: UpcomingFixture | null
}

export function HomeMatchPanels({ nextFixture }: HomeMatchPanelsProps) {
  return <NextMatchCard fixture={nextFixture} />
}
