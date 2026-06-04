import { ClubPaymentMethodFields } from './ClubPaymentMethods.tsx'
import type { OfficialMembershipOffer } from '../lib/officialMembershipsApi.ts'

type OptionalOfficialMembershipPickerProps = {
  offers: OfficialMembershipOffer[]
  loading: boolean
  cyprusFeeEur: number
  selectedOfferId: string | null
  onSelectOfferId: (offerId: string | null) => void
}

/** Optional official MU packages on Cyprus registration (payment total shown after submit). */
export function OptionalOfficialMembershipPicker({
  offers,
  loading,
  cyprusFeeEur,
  selectedOfferId,
  onSelectOfferId,
}: OptionalOfficialMembershipPickerProps) {
  return (
    <section className="membership-optional-official-section" aria-labelledby="membership-optional-official-heading">
      <h3 id="membership-optional-official-heading" className="membership-form-section-title">
        Official Manchester United membership (optional)
      </h3>
      <p className="membership-mu-status-hint">
        Choose one package to add to your Cyprus membership, or skip this step. After you submit your application, the
        payment screen will show the combined total (Cyprus fee plus any package you select here).
      </p>
      {loading ? (
        <p className="membership-mu-status-hint">Loading membership packages…</p>
      ) : offers.length === 0 ? (
        <p className="membership-mu-status-hint">No official membership packages are available at the moment.</p>
      ) : (
        <ul className="membership-package-grid">
          <li>
            <button
              type="button"
              className={`membership-package-card ${selectedOfferId === null ? 'is-selected' : ''}`}
              onClick={() => onSelectOfferId(null)}
            >
              <span className="membership-package-card-title">Cyprus membership only</span>
              <span className="membership-package-card-price">€{cyprusFeeEur.toFixed(2)}</span>
              <span className="membership-package-card-note">No official package</span>
            </button>
          </li>
          {offers.map((offer) => {
            const selected = selectedOfferId === offer.id
            return (
              <li key={offer.id}>
                <button
                  type="button"
                  className={`membership-package-card ${selected ? 'is-selected' : ''}`}
                  onClick={() => onSelectOfferId(offer.id)}
                >
                  <div className="membership-package-card-visual">
                    {offer.imageUrl ? (
                      <img src={offer.imageUrl} alt="" className="membership-package-card-img" />
                    ) : (
                      <div className="membership-package-card-placeholder" aria-hidden>
                        No image
                      </div>
                    )}
                  </div>
                  <span className="membership-package-card-title">{offer.title}</span>
                  <span className="membership-package-card-price">+ €{offer.priceEur.toFixed(2)}</span>
                  <span className="membership-package-card-note">
                    Total after submit €{(cyprusFeeEur + offer.priceEur).toFixed(2)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

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
