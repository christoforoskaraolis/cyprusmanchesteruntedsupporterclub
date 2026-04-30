import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.ts'

export const healthRouter = Router()

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    // Railway healthchecks should validate process liveness, not external
    // dependencies, so DB outages don't cause false deploy failures.
    res.json({ ok: true, now: new Date().toISOString() })
  }),
)
