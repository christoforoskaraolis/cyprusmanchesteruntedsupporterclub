import { useState } from 'react'
import { ClubPaymentMethodsBlock } from './ClubPaymentMethods.tsx'
import {
  createOfficialMembershipRequest,
  type OfficialMembershipOffer,
  type OfficialMembershipRequest,
} from '../lib/officialMembershipsApi.ts'

type OfficialMembershipRequestSectionProps = {
  officialOffers: OfficialMembershipOffer[]
  officialOffersLoading: boolean
  myOfficialRequests: OfficialMembershipRequest[]
  membershipApplicationId: string | null
  onRefreshRequests: () => Promise<void>
}

export function OfficialMembershipRequestSection({
  officialOffers,
  officialOffersLoading,
  myOfficialRequests,
  membershipApplicationId,
  onRefreshRequests,
}: OfficialMembershipRequestSectionProps) {
  const [selectedOfferId, setSelectedOfferId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [paymentOfferId, setPaymentOfferId] = useState<string | null>(null)

  const offerById = new Map(officialOffers.map((o) => [o.id, o]))
  const pendingRequest = myOfficialRequests.find((r) => r.status === 'pending')

  return (
    <section className="mycmusc-profile-card" aria-label="Official Manchester United membership">
      <h2 className="mycmusc-profile-card-title">Official Manchester United membership</h2>
      <p className="section-lead mycmusc-reg-lead">
        Get or renew your official Manchester United membership. Select a package, submit your request, then pay
        using the details below.
      </p>

      {officialOffersLoading ? (
        <p className="section-lead merch-shelf-msg merch-shelf-msg--loading">Loading official memberships…</p>
      ) : officialOffers.length === 0 ? (
        <p className="section-lead merch-shelf-msg merch-shelf-msg--empty">
          No official membership options available yet. Please check again soon.
        </p>
      ) : (
        <>
          <ul className="membership-package-grid">
            {officialOffers.map((offer) => {
              const selected = selectedOfferId === offer.id
              return (
                <li key={offer.id}>
                  <button
                    type="button"
                    className={`membership-package-card ${selected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedOfferId(offer.id)}
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
                    <span className="membership-package-card-price">€{offer.priceEur.toFixed(2)}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          {message && (
            <p
              className={`auth-message ${message.startsWith('Request submitted') ? 'is-success' : 'is-error'}`}
              role="status"
            >
              {message}
            </p>
          )}

          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            disabled={!selectedOfferId || submitting}
            onClick={async () => {
              if (!selectedOfferId) return
              setSubmitting(true)
              setMessage(null)
              const { error } = await createOfficialMembershipRequest(
                selectedOfferId,
                membershipApplicationId ?? undefined,
              )
              setSubmitting(false)
              if (error) {
                setMessage(error.message)
                return
              }
              await onRefreshRequests()
              setMessage('Request submitted successfully. Admin will review it.')
              setPaymentOfferId(selectedOfferId)
            }}
          >
            {submitting ? 'Submitting…' : 'Request selected membership'}
          </button>

          {paymentOfferId && (
            <div className="mycmusc-profile-card" style={{ marginTop: '1rem' }}>
              {(() => {
                const offer = officialOffers.find((o) => o.id === paymentOfferId)
                const price = offer?.priceEur ?? 0
                return (
                  <>
                    <h3 className="mycmusc-profile-card-title">Payment details</h3>
                    <p className="membership-payment-intro">
                      Your request is submitted. Pay <strong>€{price.toFixed(2)}</strong> via bank transfer, Revolut,
                      or Stripe below. For manual transfers, include your full name in the payment reference.
                    </p>
                    <ClubPaymentMethodsBlock
                      heading="Official membership payment methods"
                      headingId="official-membership-payment-heading"
                      stripe={{
                        amountEur: price,
                        description: offer ? `Official MU membership — ${offer.title}` : 'Official MU membership',
                        paymentKind: 'official_membership',
                        referenceId: paymentOfferId,
                        returnPath: '/mycmusc',
                      }}
                    />
                  </>
                )
              })()}
            </div>
          )}
        </>
      )}

      {myOfficialRequests.length > 0 && (
        <section className="merch-orders" aria-labelledby="official-requests-heading" style={{ marginTop: '1rem' }}>
          <h3 id="official-requests-heading" className="merch-orders-title">
            Your official membership requests
          </h3>
          <ul className="merch-orders-list">
            {myOfficialRequests.map((row) => {
              const offer = offerById.get(row.offerId)
              return (
                <li key={row.id} className="merch-order-card">
                  <div className="merch-order-head">
                    <strong>{offer?.title ?? 'Official membership'}</strong>
                    <span className={`fixtures-ticket-pill fixtures-ticket-pill--${row.status}`}>{row.status}</span>
                  </div>
                  <p className="merch-order-meta">
                    Submitted: {new Date(row.requestedAt).toLocaleString('en-GB')}
                    {offer ? ` · €${offer.priceEur.toFixed(2)}` : ''}
                  </p>
                </li>
              )
            })}
          </ul>
          {pendingRequest && !paymentOfferId && (
            <p className="mycmusc-migration-hint" role="note">
              You have a pending request. Use the payment methods above after you submit, or contact the committee if
              you need help.
            </p>
          )}
        </section>
      )}
    </section>
  )
}
