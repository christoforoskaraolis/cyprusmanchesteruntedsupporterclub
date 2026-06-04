import { ClubPaymentMethodFields } from './ClubPaymentMethods.tsx'
import type { OfficialMembershipOffer } from '../lib/officialMembershipsApi.ts'

export type MembershipPaymentBreakdown = {
  cyprusFeeEur: number
  officialOffer: OfficialMembershipOffer | null
  officialFeeEur: number
  totalEur: number
}

export function computeMembershipPaymentBreakdown(
  cyprusFeeEur: number,
  officialOfferId: string | null,
  offers: OfficialMembershipOffer[],
): MembershipPaymentBreakdown {
  const officialOffer = officialOfferId ? (offers.find((o) => o.id === officialOfferId) ?? null) : null
  const officialFeeEur = officialOffer?.priceEur ?? 0
  return {
    cyprusFeeEur,
    officialOffer,
    officialFeeEur,
    totalEur: cyprusFeeEur + officialFeeEur,
  }
}

type MembershipRegistrationPaymentCardProps = {
  breakdown: MembershipPaymentBreakdown
  seasonStartLabel: string
  seasonEndLabel: string
  applicationId?: string
  showPaymentMethods?: boolean
  returnPath?: string
  headingId?: string
}

export function MembershipRegistrationPaymentCard({
  breakdown,
  seasonStartLabel,
  seasonEndLabel,
  applicationId,
  showPaymentMethods = false,
  returnPath = '/mycmusc',
  headingId = 'membership-registration-payment-heading',
}: MembershipRegistrationPaymentCardProps) {
  const { cyprusFeeEur, officialOffer, officialFeeEur, totalEur } = breakdown

  return (
    <div className="membership-payment-card" role="region" aria-labelledby={headingId}>
      <h3 id={headingId} className="membership-payment-title">
        Payment
      </h3>
      <ul className="membership-payment-breakdown">
        <li>
          <span>Cyprus MU Supporters Club membership</span>
          <strong>€{cyprusFeeEur.toFixed(2)}</strong>
        </li>
        {officialOffer && (
          <li>
            <span>Official MU membership — {officialOffer.title}</span>
            <strong>€{officialFeeEur.toFixed(2)}</strong>
          </li>
        )}
        <li className="membership-payment-breakdown-total">
          <span>Total due</span>
          <strong>€{totalEur.toFixed(2)}</strong>
        </li>
      </ul>
      <p className="membership-payment-fee">
        <strong>Season:</strong> {seasonStartLabel} – {seasonEndLabel}.
      </p>
      {showPaymentMethods ? (
        <>
          <p className="membership-payment-intro">
            Pay using bank transfer, Revolut, or Stripe below while your application is reviewed.
            {applicationId && (
              <>
                {' '}
                For manual transfers, include your <strong>full name</strong> and application reference{' '}
                <code className="mycmusc-inline-ref">{applicationId}</code>.
              </>
            )}
          </p>
          <ClubPaymentMethodFields
            stripe={{
              amountEur: totalEur,
              description: officialOffer
                ? `Cyprus MU membership + Official MU — ${officialOffer.title}`
                : 'Cyprus MU Supporters Club — membership fee',
              paymentKind: 'membership',
              referenceId: applicationId,
              returnPath,
            }}
          />
        </>
      ) : (
        <p className="membership-payment-intro" role="note">
          After you submit your application, use the payment methods shown on the next screen. The total above is
          what you should pay{officialOffer ? ' for both memberships combined' : ''}.
        </p>
      )}
    </div>
  )
}
