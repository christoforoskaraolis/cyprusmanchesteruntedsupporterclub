import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { apiFootballConfigured } from '../lib/apiFootball.ts'
import { getPublicLivescore } from '../lib/livescoreWatcher.ts'

export const livescoreRouter = Router()

livescoreRouter.get(
  '/current',
  asyncHandler(async (_req, res) => {
    const livescore = await getPublicLivescore()
    res.json({
      configured: apiFootballConfigured(),
      ...livescore,
    })
  }),
)
