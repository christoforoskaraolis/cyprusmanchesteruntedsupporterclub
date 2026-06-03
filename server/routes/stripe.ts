import { Router } from 'express'
import Stripe from 'stripe'
import { env } from '../env.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { requireUser } from '../middleware/auth.ts'

export const stripeRouter = Router()

const PAYMENT_KINDS = new Set(['membership', 'renewal', 'ticket', 'merchandise', 'official_membership'])

function appBaseUrl(req: { headers: { origin?: string } }): string {
  if (env.publicAppUrl) return env.publicAppUrl.replace(/\/+$/, '')
  const origin = req.headers.origin
  if (origin) return origin.replace(/\/+$/, '')
  return 'http://localhost:5173'
}

function getStripeClient(): Stripe | null {
  if (!env.stripeSecretKey) return null
  return new Stripe(env.stripeSecretKey)
}

stripeRouter.get(
  '/config',
  requireUser,
  asyncHandler(async (_req, res) => {
    res.json({ enabled: Boolean(env.stripeSecretKey) })
  }),
)

stripeRouter.post(
  '/checkout-session',
  requireUser,
  asyncHandler(async (req, res) => {
    const stripe = getStripeClient()
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured on this server.' })
      return
    }

    const { amountEur, description, paymentKind, referenceId, returnPath } = req.body as {
      amountEur: number
      description: string
      paymentKind: string
      referenceId?: string
      returnPath?: string
    }

    if (!Number.isFinite(amountEur) || amountEur <= 0) {
      res.status(400).json({ error: 'amountEur must be a positive number.' })
      return
    }

    const desc = (description ?? '').trim()
    if (!desc) {
      res.status(400).json({ error: 'description is required.' })
      return
    }

    if (!PAYMENT_KINDS.has(paymentKind)) {
      res.status(400).json({ error: 'Invalid paymentKind.' })
      return
    }

    const base = appBaseUrl(req)
    const path = (returnPath ?? '/mycmusc').startsWith('/') ? (returnPath ?? '/mycmusc') : `/${returnPath ?? 'mycmusc'}`
    const successUrl = `${base}${path}?payment=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${base}${path}?payment=cancelled`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: desc.slice(0, 120) },
            unit_amount: Math.round(amountEur * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentKind,
        referenceId: (referenceId ?? '').slice(0, 200),
        userId: req.user!.id,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    if (!session.url) {
      res.status(500).json({ error: 'Stripe did not return a checkout URL.' })
      return
    }

    res.json({ url: session.url })
  }),
)
