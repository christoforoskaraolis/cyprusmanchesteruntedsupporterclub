import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { query } from '../db.ts'

export const healthRouter = Router()

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{ now: Date }>(`select now()`)
    res.json({ ok: true, now: rows[0]?.now ?? null })
  }),
)
