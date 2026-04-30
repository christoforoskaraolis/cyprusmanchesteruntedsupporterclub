import type { NextFunction, Request, Response } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../env.ts'
import { query } from '../db.ts'
import { forbidden, unauthorized } from '../lib/errors.ts'

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

let supabaseAdmin: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      '[server] Supabase auth env not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.',
    )
  }
  supabaseAdmin = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return supabaseAdmin
}

async function readSupabaseIsAdmin(token: string, userId: string): Promise<boolean | null> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null
  const scoped = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await scoped.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
  if (error || !data) return null
  return data.is_admin === true
}

function readBearer(req: Request): string | null {
  const raw = req.headers['authorization']
  const header = Array.isArray(raw) ? raw[0] : raw
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}

async function ensureProfileRow(userId: string, email: string | null): Promise<boolean> {
  // Returns is_admin. Auto-creates a profile row on first sight so admin
  // toggling can be done directly in Neon without a separate provisioning step.
  await query(
    `insert into public.profiles (id, email)
     values ($1, $2)
     on conflict (id) do update set email = excluded.email
     where public.profiles.email is distinct from excluded.email`,
    [userId, email],
  )
  const { rows } = await query<{ is_admin: boolean }>(
    `select is_admin from public.profiles where id = $1`,
    [userId],
  )
  return rows[0]?.is_admin === true
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
  const sb = getSupabase()
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data.user) return null
  const user = data.user
  let isAdmin = await ensureProfileRow(user.id, user.email ?? null)
  const supabaseAdminFlag = await readSupabaseIsAdmin(token, user.id)
  if (supabaseAdminFlag !== null && supabaseAdminFlag !== isAdmin) {
    await query(`update public.profiles set is_admin = $2 where id = $1`, [user.id, supabaseAdminFlag])
    isAdmin = supabaseAdminFlag
  }
  const emailAdmin = await isEmailMarkedAdmin(user.email ?? null)
  if (emailAdmin && !isAdmin) {
    await query(`update public.profiles set is_admin = true where id = $1`, [user.id])
    isAdmin = true
  }
  return { id: user.id, email: user.email ?? null, isAdmin }
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
