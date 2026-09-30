import { useEffect, useState } from 'react'
import { DateOfBirthInput } from './DateOfBirthInput.tsx'
import {
  ClubPaymentMethodFields,
  STRIPE_SERVICE_FEE_EUR,
} from './ClubPaymentMethods.tsx'
import {
  CLUB_TRIP_DEPOSIT_EUR,
  CLUB_TRIP_PENDING_STORAGE_KEY,
  clubTripDepositAmountEur,
  type ClubTripPendingPayment,
  type OrganizedTripDetails,
  lookupTravelCompanionMembers,
} from '../lib/fixtureTicketsApi.ts'
import type { UpcomingFixture } from '../lib/fixturesApi.ts'

const FLYER_SRC = '/club-trip-hull-city-2027.jpg'
const MAX_TRAVEL_COMPANIONS = 10

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

function parseTravelCompanionDrafts(rows: string[]): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  for (const row of rows) {
    const trimmed = row.trim()
    if (!trimmed) continue
    const parsed = Number(trimmed)
    if (!Number.isInteger(parsed) || parsed < 1) continue
    if (seen.has(parsed)) continue
    seen.add(parsed)
    out.push(parsed)
  }
  return out
}

type TravelCompanionPreview = {
  loading: boolean
  fullName: string | null
  found: boolean
  eligible: boolean
  ineligibleReason: string | null
  isSelf: boolean
}

type ClubOldTraffordTravelModalProps = {
  open: boolean
  fixture: UpcomingFixture | null
  matchKey: string
  membershipNumber: string
  requesterMembershipNumber: number | null
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
  membershipNumber: _membershipNumber,
  requesterMembershipNumber,
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
  const [validatedCompanions, setValidatedCompanions] = useState<number[]>([])
  const [travelCompanionRows, setTravelCompanionRows] = useState<string[]>([])
  const [companionPreviewByIndex, setCompanionPreviewByIndex] = useState<Record<number, TravelCompanionPreview>>({})

  const travelCompanionNumbers = parseTravelCompanionDrafts(travelCompanionRows)
  const ticketSlotCount = 1 + (step === 'payment' ? validatedCompanions.length : travelCompanionNumbers.length)
  const depositEur = clubTripDepositAmountEur(ticketSlotCount)
  const serviceFeeEur = STRIPE_SERVICE_FEE_EUR * ticketSlotCount
  const stripeTotalEur = depositEur + serviceFeeEur

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
    setValidatedCompanions([])
    setTravelCompanionRows([])
    setCompanionPreviewByIndex({})
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
    if (!open) return

    const numbersByIndex = travelCompanionRows.map((row) => {
      const parsed = Number(row.trim())
      return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
    })
    const validNumbers = [...new Set(numbersByIndex.filter((value): value is number => value != null))]

    if (validNumbers.length === 0) {
      setCompanionPreviewByIndex({})
      return
    }

    setCompanionPreviewByIndex((prev) => {
      const next = { ...prev }
      numbersByIndex.forEach((number, index) => {
        if (number == null) {
          delete next[index]
          return
        }
        next[index] = {
          loading: true,
          fullName: prev[index]?.fullName ?? null,
          found: false,
          eligible: false,
          ineligibleReason: null,
          isSelf: requesterMembershipNumber != null && number === requesterMembershipNumber,
        }
      })
      return next
    })

    const timer = window.setTimeout(() => {
      void (async () => {
        const { rows, error: lookupError } = await lookupTravelCompanionMembers(validNumbers)
        if (lookupError) return

        const byNumber = new Map(rows.map((row) => [row.membershipNumber, row]))
        setCompanionPreviewByIndex(() => {
          const next: Record<number, TravelCompanionPreview> = {}
          numbersByIndex.forEach((number, index) => {
            if (number == null) return
            const isSelf = requesterMembershipNumber != null && number === requesterMembershipNumber
            const hit = byNumber.get(number)
            if (!hit || !hit.found) {
              next[index] = {
                loading: false,
                fullName: null,
                found: false,
                eligible: false,
                ineligibleReason: null,
                isSelf,
              }
              return
            }
            next[index] = {
              loading: false,
              fullName: hit.fullName,
              found: true,
              eligible: hit.eligible,
              ineligibleReason: hit.ineligibleReason,
              isSelf,
            }
          })
          return next
        })
      })()
    }, 400)

    return () => window.clearTimeout(timer)
  }, [open, travelCompanionRows, requesterMembershipNumber])

  useEffect(() => {
    if (!open || step !== 'payment' || !validatedDetails || !matchKey) return
    const pending: ClubTripPendingPayment = {
      matchKey,
      details: validatedDetails,
      travelCompanionMembershipNumbers: validatedCompanions,
    }
    try {
      sessionStorage.setItem(CLUB_TRIP_PENDING_STORAGE_KEY, JSON.stringify(pending))
    } catch {
      // Ignore storage failures; Stripe return completion will show an error if needed.
    }
  }, [open, step, validatedDetails, validatedCompanions, matchKey])

  if (!open || !fixture) return null

  function updateTravelCompanionRow(index: number, value: string) {
    const digitsOnly = value.replace(/\D/g, '')
    setTravelCompanionRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? digitsOnly : row)))
  }

  function addTravelCompanionRow() {
    setTravelCompanionRows((prev) => [...prev, ''])
  }

  function removeTravelCompanionRow(index: number) {
    setTravelCompanionRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
    setCompanionPreviewByIndex((prev) => {
      const next: Record<number, TravelCompanionPreview> = {}
      Object.entries(prev).forEach(([key, value]) => {
        const rowIndex = Number(key)
        if (rowIndex < index) next[rowIndex] = value
        else if (rowIndex > index) next[rowIndex - 1] = value
      })
      return next
    })
  }

  function renderTravelCompanionPreview(index: number) {
    const row = travelCompanionRows[index]?.trim()
    if (!row) return null

    const parsed = Number(row)
    if (!Number.isInteger(parsed) || parsed < 1) {
      return <span className="ticket-request-travel-companion-name is-muted">Enter a valid number</span>
    }

    const preview = companionPreviewByIndex[index]
    if (!preview || preview.loading) {
      return <span className="ticket-request-travel-companion-name is-muted">Looking up…</span>
    }
    if (preview.isSelf) {
      return <span className="ticket-request-travel-companion-name is-error">Your own number</span>
    }
    if (!preview.found) {
      return <span className="ticket-request-travel-companion-name is-error">Member not found</span>
    }
    if (!preview.eligible) {
      const reason = preview.ineligibleReason ?? 'not eligible for the club trip'
      return (
        <span className="ticket-request-travel-companion-name is-error">
          {preview.fullName ?? 'Member'} — {reason}
        </span>
      )
    }
    return <span className="ticket-request-travel-companion-name">{preview.fullName ?? 'Member'}</span>
  }

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

    for (let index = 0; index < travelCompanionRows.length; index += 1) {
      const row = travelCompanionRows[index]?.trim() ?? ''
      if (!row) {
        setFormError('Remove empty travel companion rows, or enter a MY MUCY number.')
        return null
      }
      const parsed = Number(row)
      if (!Number.isInteger(parsed) || parsed < 1) {
        setFormError('Enter a valid MY MUCY number for each travel companion.')
        return null
      }
      const preview = companionPreviewByIndex[index]
      if (!preview || preview.loading) {
        setFormError('Wait for travel companion lookup to finish.')
        return null
      }
      if (preview.isSelf || !preview.found || !preview.eligible) {
        setFormError('Fix invalid travel companions before continuing to payment.')
        return null
      }
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
    setValidatedCompanions(travelCompanionNumbers)
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
            alt="Manchester Group Trip — Manchester United vs Hull City, 10–12 April 2027"
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

            <div className="ticket-request-travel-companions">
              <p className="auth-label">
                Add the Cyprus Man Utd Supporter ID of any member who will travel with you (optional).
              </p>
              <p className="renewal-modal-hint">
                {travelCompanionNumbers.length === 0
                  ? 'By adding a member’s number you are registering an extra traveler on this club trip. No separate request is needed from that member. Stripe deposit is €151 per traveler (€150 + €1).'
                  : `You are registering ${ticketSlotCount} travelers in total. Stripe total is €${(CLUB_TRIP_DEPOSIT_EUR + STRIPE_SERVICE_FEE_EUR).toFixed(2)} × ${ticketSlotCount} = €${stripeTotalEur.toFixed(2)}.`}
              </p>
              {travelCompanionRows.length > 0 && (
                <ul className="ticket-request-travel-companion-list">
                  {travelCompanionRows.map((row, index) => (
                    <li key={`club-trip-companion-${index}`} className="ticket-request-travel-companion-row">
                      <input
                        className="auth-input ticket-request-travel-companion-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="MY MUCY Number"
                        value={row}
                        onChange={(e) => updateTravelCompanionRow(index, e.target.value)}
                        disabled={submitting}
                        aria-label={`Travel companion MY MUCY number ${index + 1}`}
                      />
                      {renderTravelCompanionPreview(index)}
                      <button
                        type="button"
                        className="ticket-request-travel-companion-remove"
                        onClick={() => removeTravelCompanionRow(index)}
                        disabled={submitting}
                        aria-label={`Remove travel companion ${index + 1}`}
                      >
                        −
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="renewal-modal-hint ticket-request-travel-companion-id-note">
                MY MUCY number is the Cyprus Membership ID located at the top right of the page by clicking MY MUCY.
              </p>
              <button
                type="button"
                className="ticket-request-travel-companion-add"
                onClick={addTravelCompanionRow}
                disabled={submitting || travelCompanionRows.length >= MAX_TRAVEL_COMPANIONS}
              >
                + Add travelling member
              </button>
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
                <strong>Deposit:</strong> €{depositEur.toFixed(2)}
                {ticketSlotCount > 1
                  ? ` (€${CLUB_TRIP_DEPOSIT_EUR.toFixed(2)} × ${ticketSlotCount} travelers)`
                  : ''}
              </p>
              <p className="membership-payment-fee">
                <strong>Stripe total:</strong> €{stripeTotalEur.toFixed(2)} (€{depositEur.toFixed(2)} + €
                {serviceFeeEur.toFixed(2)} service charge
                {ticketSlotCount > 1 ? ` = €${STRIPE_SERVICE_FEE_EUR.toFixed(2)} × ${ticketSlotCount}` : ''})
              </p>
              {validatedCompanions.length > 0 && (
                <p className="membership-payment-intro">
                  Traveling members registered on this request: {validatedCompanions.length} companion
                  {validatedCompanions.length === 1 ? '' : 's'} (total {ticketSlotCount} travelers).
                </p>
              )}
              <p className="membership-payment-intro">
                Club trip deposits are paid by <strong>Stripe card only</strong>. Each traveler is €
                {CLUB_TRIP_DEPOSIT_EUR.toFixed(2)} + €{STRIPE_SERVICE_FEE_EUR.toFixed(2)} service charge (€
                {(CLUB_TRIP_DEPOSIT_EUR + STRIPE_SERVICE_FEE_EUR).toFixed(2)}).
              </p>
              <p className="membership-payment-intro">
                You will be charged <strong>€{stripeTotalEur.toFixed(2)}</strong>. After a successful Stripe payment
                your trip request is submitted automatically and you will receive a confirmation email.
              </p>
              <ClubPaymentMethodFields
                stripeOnly
                stripe={{
                  amountEur: depositEur,
                  description:
                    ticketSlotCount > 1
                      ? `Club trip deposit — Old Trafford / Hull City × ${ticketSlotCount} — ${matchKey}`
                      : `Club trip deposit — Old Trafford / Hull City — ${matchKey}`,
                  paymentKind: 'club_trip',
                  referenceId: matchKey,
                  returnPath: '/',
                  travelerCount: ticketSlotCount,
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
