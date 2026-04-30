import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../db.ts'
import { forbidden, unauthorized } from '../lib/errors.ts'
import { env } from '../env.ts'

export type AuthenticatedUser = {
  id: string
  email: string | null
  isAdmin: boolean
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser
  }
}

function readBearer(req: Request): string | null {
  const raw = req.headers['authorization']
  const header = Array.isArray(raw) ? raw[0] : raw
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}

type AuthTokenPayload = {
  sub: string
  email?: string | null
}

function parseToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.authJwtSecret)
    if (!decoded || typeof decoded !== 'object') return null
    const sub = typeof decoded.sub === 'string' ? decoded.sub : ''
    if (!sub) return null
    const email = typeof decoded.email === 'string' ? decoded.email : null
    return { sub, email }
  } catch {
    return null
  }
}

async function ensureProfileRow(userId: string, email: string | null): Promise<void> {
  await query(
    `insert into public.profiles (id, email)
     values ($1, $2)
     on conflict (id) do update set email = excluded.email
     where public.profiles.email is distinct from excluded.email`,
    [userId, email],
  )
}

async function isEmailMarkedAdmin(email: string | null): Promise<boolean> {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const { rows } = await query<{ has_admin: boolean }>(
    `select exists(select 1 from public.admin_user_emails where email = $1) as has_admin`,
    [normalized],
  )
  return rows[0]?.has_admin === true
}

async function authenticate(req: Request): Promise<AuthenticatedUser | null> {
  const token = readBearer(req)
  if (!token) return null
  const payload = parseToken(token)
  if (!payload) return null
  const userId = payload.sub
  const email = payload.email ?? null
  await ensureProfileRow(userId, email)

  const { rows } = await query<{ is_admin: boolean }>(`select is_admin from public.profiles where id = $1`, [userId])
  let isAdmin = rows[0]?.is_admin === true

  const emailAdmin = await isEmailMarkedAdmin(email)
  if (emailAdmin && !isAdmin) {
    await query(`update public.profiles set is_admin = true where id = $1`, [userId])
    isAdmin = true
  }
  return { id: userId, email, isAdmin }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await authenticate(req)
    if (user) req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      const user = await authenticate(req)
      if (!user) return next(unauthorized('Sign in required'))
      req.user = user
    }
    next()
  } catch (err) {
    next(err)
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      const user = await authenticate(req)
      if (!user) return next(unauthorized('Sign in required'))
      req.user = user
    }
    if (!req.user.isAdmin) return next(forbidden('Admin access required'))
    next()
  } catch (err) {
    next(err)
  }
}
