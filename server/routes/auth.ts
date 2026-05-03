import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { query, withTransaction } from '../db.ts'
import { env } from '../env.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest, unauthorized } from '../lib/errors.ts'
import { requireUser } from '../middleware/auth.ts'
import { sendEmail } from '../lib/email.ts'

export const authRouter = Router()

type AuthUserRow = {
  user_id: string
  email: string
  password_hash: string
  email_verified_at: string | null
}

function signToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, env.authJwtSecret, { expiresIn: '30d' })
}

async function createAndSendPasswordResetEmail(userId: string, email: string, reqOrigin: string | undefined): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  await query(`delete from public.auth_password_resets where user_id = $1 and consumed_at is null`, [userId])
  await query(
    `insert into public.auth_password_resets (user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '1 hour')`,
    [userId, tokenHash],
  )

  const baseUrl = env.publicAppUrl || reqOrigin || 'http://localhost:5173'
  const resetUrl = `${baseUrl.replace(/\/+$/, '')}/?resetPasswordToken=${rawToken}`
  await sendEmail(
    email,
    'Reset your CMUSC password',
    `You asked to reset your password for the Cyprus Manchester United Supporters Club portal.\n\nOpen this link to choose a new password:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
    `<p>You asked to reset your password for the Cyprus Manchester United Supporters Club portal.</p><p><a href="${resetUrl}">Choose a new password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`,
  )
}

async function createAndSendVerificationEmail(userId: string, email: string, reqOrigin: string | undefined): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  await query(`delete from public.auth_email_verifications where user_id = $1 and consumed_at is null`, [userId])
  await query(
    `insert into public.auth_email_verifications (user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '24 hours')`,
    [userId, tokenHash],
  )

  const baseUrl = env.publicAppUrl || reqOrigin || 'http://localhost:5173'
  const verifyUrl = `${baseUrl.replace(/\/+$/, '')}/?verifyEmailToken=${rawToken}`
  await sendEmail(
    email,
    'Verify your CMUSC account',
    `Welcome to Cyprus Manchester United Supporters Club.\n\nPlease verify your email by opening this link:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    `<p>Welcome to Cyprus Manchester United Supporters Club.</p><p>Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
  )
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

    const { rows: existing } = await query<{ user_id: string }>(`select user_id from public.auth_users where email = $1`, [email])
    if (existing.length > 0) throw badRequest('There is already an account with this email')

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
        `insert into public.auth_users (user_id, email, password_hash, email_verified_at)
         values ($1, $2, $3, null)`,
        [id, email, passwordHash],
      )
      return id
    })

    await createAndSendVerificationEmail(userId, email, req.headers.origin)
    res.status(201).json({ requiresEmailVerification: true })
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
      `select user_id, email, password_hash, email_verified_at
       from public.auth_users
       where email = $1
       limit 1`,
      [email],
    )
    const row = rows[0]
    if (!row) throw unauthorized('Invalid email or password')

    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) throw unauthorized('Invalid email or password')
    if (!row.email_verified_at) throw unauthorized('Please verify your email before signing in')

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

authRouter.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token ?? '').trim()
    if (!token) throw badRequest('Verification token is required')

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const { rows } = await query<{ user_id: string }>(
      `select user_id
       from public.auth_email_verifications
       where token_hash = $1
         and consumed_at is null
         and expires_at > now()
       limit 1`,
      [tokenHash],
    )
    const userId = rows[0]?.user_id
    if (!userId) throw badRequest('Verification link is invalid or expired')

    await withTransaction(async (client) => {
      await client.query(
        `update public.auth_email_verifications
         set consumed_at = now()
         where token_hash = $1 and consumed_at is null`,
        [tokenHash],
      )
      await client.query(`update public.auth_users set email_verified_at = now() where user_id = $1`, [userId])
    })

    res.json({ verified: true })
  }),
)

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? '')
      .trim()
      .toLowerCase()
    if (!email) throw badRequest('Email is required')

    const { rows } = await query<{ user_id: string }>(
      `select user_id from public.auth_users where email = $1 limit 1`,
      [email],
    )
    const userId = rows[0]?.user_id
    if (userId) {
      await createAndSendPasswordResetEmail(userId, email, req.headers.origin)
    }

    res.json({ ok: true })
  }),
)

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token ?? '').trim()
    const newPassword = String(req.body?.newPassword ?? '')
    if (!token) throw badRequest('Reset token is required')
    if (!newPassword) throw badRequest('New password is required')
    if (newPassword.length < 8) throw badRequest('Password must be at least 8 characters')

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const { rows } = await query<{ user_id: string }>(
      `select user_id
       from public.auth_password_resets
       where token_hash = $1
         and consumed_at is null
         and expires_at > now()
       limit 1`,
      [tokenHash],
    )
    const userId = rows[0]?.user_id
    if (!userId) throw badRequest('Reset link is invalid or has expired')

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await withTransaction(async (client) => {
      await client.query(
        `update public.auth_password_resets
         set consumed_at = now()
         where token_hash = $1 and consumed_at is null`,
        [tokenHash],
      )
      await client.query(`update public.auth_users set password_hash = $1 where user_id = $2`, [passwordHash, userId])
    })

    res.json({ ok: true })
  }),
)

authRouter.post(
  '/resend-verification',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? '')
      .trim()
      .toLowerCase()
    if (!email) throw badRequest('Email is required')

    const { rows } = await query<{ user_id: string; email_verified_at: string | null }>(
      `select user_id, email_verified_at
       from public.auth_users
       where email = $1
       limit 1`,
      [email],
    )
    const row = rows[0]
    if (row && !row.email_verified_at) {
      await createAndSendVerificationEmail(row.user_id, email, req.headers.origin)
    }

    // Return the same shape regardless of account state to avoid user enumeration.
    res.json({ ok: true })
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
