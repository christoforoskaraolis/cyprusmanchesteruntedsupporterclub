import { useEffect, useState } from 'react'
import { DateOfBirthInput } from './DateOfBirthInput.tsx'
import {
  ClubPaymentMethodFields,
  STRIPE_SERVICE_FEE_EUR,
} from './ClubPaymentMethods.tsx'
import {
  CLUB_TRIP_DEPOSIT_EUR,
  CLUB_TRIP_PENDING_STORAGE_KEY,
  type ClubTripPendingPayment,
  type OrganizedTripDetails,
} from '../lib/fixtureTicketsApi.ts'
import type { UpcomingFixture } from '../lib/fixturesApi.ts'

const FLYER_SRC = '/club-trip-hull-city-2027.jpg'

function formatFixtureKickoffLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type ClubOldTraffordTravelModalProps = {
  open: boolean
  fixture: UpcomingFixture | null
  matchKey: string
  membershipNumber: string
  submitting: boolean
  error: string | null
  initialFullName: string
  initialDateOfBirth: string
  initialOfficialMuMembershipId: string
  initialTelephone: string
  onClose: () => void
}

export function ClubOldTraffordTravelModal({
  open,
  fixture,
  matchKey,
  membershipNumber,
  submitting,
  error,
  initialFullName,
  initialDateOfBirth,
  initialOfficialMuMembershipId,
  initialTelephone,
  onClose,
}: ClubOldTraffordTravelModalProps) {
  const [fullName, setFullName] = useState('')
  const [officialMuMembershipId, setOfficialMuMembershipId] = useState('')
  const [telephone, setTelephone] = useState('')
  const [passportNumber, setPassportNumber] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [passportIssuedAt, setPassportIssuedAt] = useState('')
  const [passportExpiresAt, setPassportExpiresAt] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'payment'>('form')
  const [validatedDetails, setValidatedDetails] = useState<OrganizedTripDetails | null>(null)

  const stripeTotalEur = CLUB_TRIP_DEPOSIT_EUR + STRIPE_SERVICE_FEE_EUR

  useEffect(() => {
    if (!open) return
    setFullName(initialFullName)
    setOfficialMuMembershipId(initialOfficialMuMembershipId)
    setTelephone(initialTelephone)
    setPassportNumber('')
    setDateOfBirth(initialDateOfBirth)
    setPassportIssuedAt('')
    setPassportExpiresAt('')
    setFormError(null)
    setStep('form')
    setValidatedDetails(null)
  }, [
    open,
    fixture?.kickoffIso,
    fixture?.opponent,
    initialFullName,
    initialDateOfBirth,
    initialOfficialMuMembershipId,
    initialTelephone,
  ])

  useEffect(() => {
    if (!open || step !== 'payment' || !validatedDetails || !matchKey) return
    const pending: ClubTripPendingPayment = { matchKey, details: validatedDetails }
    try {
      sessionStorage.setItem(CLUB_TRIP_PENDING_STORAGE_KEY, JSON.stringify(pending))
    } catch {
      // Ignore storage failures; Stripe return completion will show an error if needed.
    }
  }, [open, step, validatedDetails, matchKey])

  if (!open || !fixture) return null

  function validateForm(): OrganizedTripDetails | null {
    const trimmedName = fullName.trim()
    const trimmedOfficialId = officialMuMembershipId.trim()
    const trimmedTelephone = telephone.trim()
    const trimmedPassport = passportNumber.trim()
    if (!trimmedName) {
      setFormError('Συμπληρώστε το ονοματεπώνυμο.')
      return null
    }
    if (!trimmedOfficialId) {
      setFormError('Συμπληρώστε το Επίσημο Membership ID.')
      return null
    }
    if (!trimmedTelephone) {
      setFormError('Συμπληρώστε το τηλέφωνο.')
      return null
    }
    if (!trimmedPassport) {
      setFormError('Συμπληρώστε τον αριθμό διαβατηρίου.')
      return null
    }
    if (!dateOfBirth) {
      setFormError('Επιλέξτε ημερομηνία γέννησης.')
      return null
    }
    if (!passportIssuedAt) {
      setFormError('Επιλέξτε ημερομηνία έκδοσης διαβατηρίου.')
      return null
    }
    if (!passportExpiresAt) {
      setFormError('Επιλέξτε ημερομηνία λήξης διαβατηρίου.')
      return null
    }
    if (passportExpiresAt < passportIssuedAt) {
      setFormError('Η ημερομηνία λήξης πρέπει να είναι μετά την ημερομηνία έκδοσης.')
      return null
    }
    setFormError(null)
    return {
      fullName: trimmedName,
      officialMuMembershipId: trimmedOfficialId,
      telephone: trimmedTelephone,
      passportNumber: trimmedPassport,
      dateOfBirth,
      passportIssuedAt,
      passportExpiresAt,
    }
  }

  function goToPayment() {
    const details = validateForm()
    if (!details) return
    setValidatedDetails(details)
    setStep('payment')
  }

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog renewal-modal-dialog--wide club-trip-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="club-trip-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="club-trip-modal-title" className="renewal-modal-title">
            Travel with the Club to Old Trafford
          </h2>
          <button
            type="button"
            className="renewal-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="renewal-modal-lead">
          Organized club trip for{' '}
          <strong>
            Manchester United vs {fixture.opponent}
          </strong>{' '}
          ({formatFixtureKickoffLabel(fixture.kickoffIso)}).
        </p>

        <div className="club-trip-flyer-wrap">
          <img
            className="club-trip-flyer"
            src={FLYER_SRC}
            alt="Organized trip to England — Manchester United vs Hull City, 10–12 April 2027"
          />
        </div>

        {step === 'form' ? (
          <>
            <div className="club-trip-form" lang="el">
              <label className="auth-field membership-field">
                <span className="auth-label">Ονοματεπώνυμο</span>
                <input
                  className="auth-input"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="auth-field membership-field">
                <span className="auth-label">Επίσημο Membership ID</span>
                <input
                  className="auth-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={officialMuMembershipId}
                  onChange={(e) => setOfficialMuMembershipId(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="auth-field membership-field">
                <span className="auth-label">Τηλέφωνο</span>
                <input
                  className="auth-input"
                  type="tel"
                  autoComplete="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="auth-field membership-field">
                <span className="auth-label">Αριθμός διαβατηρίου</span>
                <input
                  className="auth-input"
                  type="text"
                  autoComplete="off"
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="auth-field membership-field">
                <span className="auth-label">Ημερομηνία γέννησης</span>
                <DateOfBirthInput value={dateOfBirth} onChange={setDateOfBirth} disabled={submitting} />
              </label>

              <label className="auth-field membership-field">
                <span className="auth-label">Ημερομηνία έκδοσης</span>
                <input
                  className="auth-input"
                  type="date"
                  value={passportIssuedAt}
                  onChange={(e) => setPassportIssuedAt(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="auth-field membership-field">
                <span className="auth-label">Ημερομηνία λήξης</span>
                <input
                  className="auth-input"
                  type="date"
                  value={passportExpiresAt}
                  onChange={(e) => setPassportExpiresAt(e.target.value)}
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="club-trip-notes" lang="el">
              <p>
                Για ανήλικους κάτω των 18 ετών, θα πρέπει να υπάρχει εξουσιοδότηση από τους γονείς ότι επιτρέπεται να
                ταξιδέψουν μόνοι τους.
              </p>
              <p>
                Για παιδιά κάτω των 12 ετών, θα χρειαστεί εξουσιοδότηση από τους γονείς προς τον ενήλικα που θα τα
                συνοδεύει.
              </p>
              <p>Επίσης, όσοι είναι στρατεύσιμοι θα πρέπει να έχουν μαζί τους το απολυτήριο στρατού.</p>
              <p>
                Όσον αφορά την ETA για την Αγγλία, θα σας στείλουμε την εφαρμογή/σύνδεσμο για την αίτηση. Κάθε
                ταξιδιώτης θα πρέπει να κάνει την αίτηση από το δικό του κινητό τηλέφωνο. Εάν κάποιος χρειάζεται
                βοήθεια, μπορεί να περάσει από το γραφείο μας και θα τον βοηθήσουμε να ολοκληρώσει τη διαδικασία.
              </p>
              <p>
                Το κόστος της ETA είναι περίπου <strong>€23</strong> ανά άτομο.
              </p>
            </div>

            {(formError || error) && (
              <p className="auth-message is-error renewal-modal-error">{formError || error}</p>
            )}

            <div className="renewal-modal-actions">
              <button
                type="button"
                className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mycmusc-reg-btn mycmusc-reg-btn--primary"
                onClick={goToPayment}
                disabled={submitting}
              >
                Continue to deposit payment
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="membership-payment-card renewal-modal-payment" role="region" aria-labelledby="club-trip-deposit-heading">
              <h3 id="club-trip-deposit-heading" className="membership-payment-title">
                Προκαταβολή ταξιδιού / Trip deposit
              </h3>
              <p className="membership-payment-fee">
                <strong>Deposit:</strong> €{CLUB_TRIP_DEPOSIT_EUR.toFixed(2)}
              </p>
              <p className="membership-payment-fee">
                <strong>Stripe (card):</strong> €{stripeTotalEur.toFixed(2)} (€{CLUB_TRIP_DEPOSIT_EUR.toFixed(2)} + €
                {STRIPE_SERVICE_FEE_EUR.toFixed(2)} service charge)
              </p>
              <p className="membership-payment-intro">
                Pay the trip deposit before your registration is completed. Use the same club payment methods as
                membership registration. For manual transfers, include your <strong>full name</strong> and{' '}
                <strong>membership number {membershipNumber || '—'}</strong> in the payment reference.
              </p>
              <p className="membership-payment-intro">
                For Stripe card payment, you will be charged <strong>€{stripeTotalEur.toFixed(2)}</strong>. After a
                successful Stripe payment your trip request is submitted automatically.
              </p>
              <ClubPaymentMethodFields
                stripe={{
                  amountEur: CLUB_TRIP_DEPOSIT_EUR,
                  description: `Club trip deposit — Old Trafford / Hull City — ${matchKey}`,
                  paymentKind: 'club_trip',
                  referenceId: matchKey,
                  returnPath: '/',
                }}
              />
            </div>

            {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}

            <div className="renewal-modal-actions">
              <button
                type="button"
                className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                onClick={() => {
                  setStep('form')
                  setFormError(null)
                }}
                disabled={submitting}
              >
                Back to form
              </button>
              <button
                type="button"
                className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
