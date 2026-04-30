import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query, withTransaction } from '../db.ts'
import { env } from '../env.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest, unauthorized } from '../lib/errors.ts'
import { requireUser } from '../middleware/auth.ts'

export const authRouter = Router()

type AuthUserRow = {
  user_id: string
  email: string
  password_hash: string
}

function signToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, env.authJwtSecret, { expiresIn: '30d' })
}

authRouter.post(
  '/sign-up',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? '')
      .trim()
      .toLowerCase()
    const password = String(req.body?.password ?? '')
    const fullName = String(req.body?.fullName ?? '').trim()

    if (!email || !password) throw badRequest('Email and password are required')
    if (password.length < 8) throw badRequest('Password must be at least 8 characters')

    const { rows: existing } = await query<{ user_id: string }>(
      `select user_id from public.auth_users where email = $1`,
      [email],
    )
    if (existing.length > 0) throw badRequest('An account with this email already exists')

    const passwordHash = await bcrypt.hash(password, 12)
    const userId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into public.profiles (id, email, full_name)
         values (gen_random_uuid(), $1, $2)
         returning id`,
        [email, fullName || null],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('Failed to create profile')
      await client.query(
        `insert into public.auth_users (user_id, email, password_hash)
         values ($1, $2, $3)`,
        [id, email, passwordHash],
      )
      return id
    })

    const token = signToken(userId, email)
    res.status(201).json({
      token,
      user: { id: userId, email },
      isAdmin: false,
    })
  }),
)

authRouter.post(
  '/sign-in',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? '')
      .trim()
      .toLowerCase()
    const password = String(req.body?.password ?? '')
    if (!email || !password) throw badRequest('Email and password are required')

    const { rows } = await query<AuthUserRow>(
      `select user_id, email, password_hash
       from public.auth_users
       where email = $1
       limit 1`,
      [email],
    )
    const row = rows[0]
    if (!row) throw unauthorized('Invalid email or password')

    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) throw unauthorized('Invalid email or password')

    const { rows: profileRows } = await query<{ is_admin: boolean }>(
      `select is_admin from public.profiles where id = $1`,
      [row.user_id],
    )
    const isAdmin = profileRows[0]?.is_admin === true
    const token = signToken(row.user_id, row.email)
    res.json({
      token,
      user: { id: row.user_id, email: row.email },
      isAdmin,
    })
  }),
)

authRouter.get(
  '/me',
  requireUser,
  asyncHandler(async (req, res) => {
    res.json({
      user: { id: req.user!.id, email: req.user!.email },
      isAdmin: req.user!.isAdmin,
    })
  }),
)
