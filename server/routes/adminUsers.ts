import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import { requireAdmin } from '../middleware/auth.ts'

export const adminUsersRouter = Router()

adminUsersRouter.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{ email: string; created_at: string }>(
      `select email, created_at from public.admin_user_emails order by email asc`,
    )
    res.json({ rows: rows.map((r) => ({ email: r.email, createdAt: r.created_at })) })
  }),
)

adminUsersRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const emailRaw = String((req.body as { email?: string }).email ?? '')
    const email = emailRaw.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw badRequest('Please enter a valid email address.')
    }
    await query(
      `insert into public.admin_user_emails (email, created_by)
       values ($1, $2)
       on conflict (email) do nothing`,
      [email, req.user!.id],
    )
    res.status(201).json({ ok: true })
  }),
)

adminUsersRouter.delete(
  '/:email',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email).trim().toLowerCase()
    if (!email) throw badRequest('Email is required.')
    await query(`delete from public.admin_user_emails where email = $1`, [email])
    res.json({ ok: true })
  }),
)
