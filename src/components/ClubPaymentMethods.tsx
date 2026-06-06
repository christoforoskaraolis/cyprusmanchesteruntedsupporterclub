import { useEffect, useState } from 'react'
import {
  createStripeCheckoutSession,
  fetchStripeConfig,
  type StripeCheckoutPayload,
  type StripePaymentKind,
} from '../lib/stripeApi.ts'

/** Membership fee and payment details — replace IBAN / Revolut with your club’s real information. */
export const CMUSC_PAYMENT_ACCOUNT_NAME = 'Charalambos Loizou & Demetris Nathanael'
export const CMUSC_PAYMENT_IBAN = 'LT70 3250 0300 6556 3775'
export const CMUSC_PAYMENT_SWIFT = 'REVOLT21'
export const CMUSC_PAYMENT_BANK_NAME = 'Revolut Bank UAB'
export const CMUSC_PAYMENT_BANK_ADDRESS = 'Konstitucijos ave. 21B, 08130, Vilnius, Lithuania'
export const CMUSC_PAYMENT_REVOLUT = 'https://revolut.me/clmanutd'

/** Added only to Stripe card payments (bank transfer and Revolut are not affected). */
export const STRIPE_SERVICE_FEE_EUR = 1

export type StripePaymentOption = {
  amountEur: number
  description: string
  paymentKind: StripePaymentKind
  referenceId?: string
  returnPath?: string
}

function StripePaySection({ stripe }: { stripe: StripePaymentOption }) {
  const stripeTotalEur = stripe.amountEur + STRIPE_SERVICE_FEE_EUR
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchStripeConfig().then(({ enabled, error: configError }) => {
      if (cancelled) return
      if (configError) {
        setStatus('unavailable')
        return
      }
      setStatus(enabled ? 'ready' : 'unavailable')
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handlePay() {
    setBusy(true)
    setError(null)
    const payload: StripeCheckoutPayload = {
      amountEur: stripe.amountEur,
      description: stripe.description,
      paymentKind: stripe.paymentKind,
      referenceId: stripe.referenceId,
      returnPath: stripe.returnPath,
    }
    const { url, error: checkoutError } = await createStripeCheckoutSession(payload)
    setBusy(false)
    if (checkoutError || !url) {
      setError(checkoutError?.message ?? 'Could not start Stripe checkout.')
      return
    }
    window.location.href = url
  }

  return (
    <div className="membership-payment-method membership-payment-method--stripe">
      <span className="membership-payment-method-label">Pay with card (Stripe)</span>
      <p className="membership-payment-intro">
        Pay securely online with card. A <strong>€{STRIPE_SERVICE_FEE_EUR.toFixed(2)} service charge</strong> applies to
        Stripe payments only (€{stripe.amountEur.toFixed(2)} + €{STRIPE_SERVICE_FEE_EUR.toFixed(2)} ={' '}
        <strong>€{stripeTotalEur.toFixed(2)} total</strong>). You will be redirected to Stripe to complete payment.
      </p>
      {status === 'loading' && <p className="membership-payment-intro">Loading card payment option…</p>}
      {status === 'unavailable' && (
        <p className="membership-payment-stripe-unavailable" role="note">
          Card payment is not available on the server yet. Please use bank transfer or Revolut above, or try again
          later after the club enables Stripe.
        </p>
      )}
      {status === 'ready' && (
        <>
          {error && <p className="auth-message is-error">{error}</p>}
          <button
            type="button"
            className="membership-payment-stripe-btn"
            disabled={busy}
            onClick={() => void handlePay()}
          >
            {busy ? 'Redirecting to Stripe…' : `Pay €${stripeTotalEur.toFixed(2)} with Stripe`}
          </button>
        </>
      )}
    </div>
  )
}

export function ClubPaymentMethodFields({ stripe }: { stripe?: StripePaymentOption }) {
  return (
    <>
      <div className="membership-payment-method">
        <span className="membership-payment-method-label">Bank transfer (IBAN)</span>
        <p className="membership-payment-beneficiary">{CMUSC_PAYMENT_ACCOUNT_NAME}</p>
        <code className="membership-payment-iban" tabIndex={0}>
          {CMUSC_PAYMENT_IBAN}
        </code>
        <p className="membership-payment-beneficiary">BIC / SWIFT: {CMUSC_PAYMENT_SWIFT}</p>
        <p className="membership-payment-beneficiary">Bank: {CMUSC_PAYMENT_BANK_NAME}</p>
        <p className="membership-payment-beneficiary">Address: {CMUSC_PAYMENT_BANK_ADDRESS}</p>
      </div>
      <div className="membership-payment-method">
        <span className="membership-payment-method-label">Revolut</span>
        {CMUSC_PAYMENT_REVOLUT.startsWith('http://') || CMUSC_PAYMENT_REVOLUT.startsWith('https://') ? (
          <>
            <a
              className="membership-payment-revolut-link"
              href={CMUSC_PAYMENT_REVOLUT}
              target="_blank"
              rel="noopener noreferrer"
            >
              Pay with Revolut
            </a>
            <p className="membership-payment-revolut-url">{CMUSC_PAYMENT_REVOLUT}</p>
          </>
        ) : (
          <p className="membership-payment-revolut-text">{CMUSC_PAYMENT_REVOLUT}</p>
        )}
      </div>
      {stripe ? <StripePaySection stripe={stripe} /> : null}
    </>
  )
}

export function ClubPaymentMethodsBlock({
  heading,
  headingId,
  stripe,
}: {
  heading?: string
  headingId?: string
  stripe?: StripePaymentOption
}) {
  const id = headingId ?? 'club-payment-methods-heading'
  return (
    <div className="membership-payment-card merch-payment-card" role="region" aria-labelledby={id}>
      <h3 id={id} className="membership-payment-title">
        {heading ?? 'Payment'}
      </h3>
      <ClubPaymentMethodFields stripe={stripe} />
    </div>
  )
}
