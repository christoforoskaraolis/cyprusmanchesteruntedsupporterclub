import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import clubLogo from './assets/MUCSC.jpeg'
import { useAuth } from './context/AuthContext.tsx'
import {
  type DbRenewalRequest,
  type MemberApplicationPayload,
  type MemberRegistryEntry,
  type MyProfileRow,
  type PendingRenewalListRow,
  completeRenewalRequest,
  dbRowToMemberEntry,
  deleteMembershipApplication,
  fetchAllMembershipApplications,
  fetchMyFamilyMembers,
  fetchMyLatestApplication,
  fetchMyPendingRenewal,
  fetchMyProfile,
  fetchPendingRenewalRequests,
  formatActivationEmailStatus,
  formatMembershipNumber,
  formatFamilyRelationship,
  formatOfficialMembershipRequestLabel,
  formatOfficialMuMembershipId,
  formatOfficialMuMembershipStatus,
  FAMILY_RELATIONSHIP_OPTIONS,
  generateApplicationId,
  parseOfficialMuMembershipFields,
  type OfficialMuMembershipFormStatus,
  type OfficialMuMembershipStatus,
  insertMembershipApplication,
  insertRenewalRequest,
  sendPaymentReminderEmail,
  setApplicationStatus,
  updateApplicationMemberId,
  updateApplicationMembershipNumber,
  updateApplicationPresentReceived,
  updateApplicationAdminMemberFlags,
  updateFamilyMemberDetails,
  updateMyProfileDetails,
} from './lib/membershipApi.ts'
import { fetchCachedFixtures, syncFixturesFromManutd, type UpcomingFixture } from './lib/fixturesApi.ts'
import {
  deleteNewsPost,
  fetchAdminNewsPosts,
  fetchNewsPosts,
  insertNewsPost,
  newsDesktopImage,
  type NewsPost,
  type NewsPostPayload,
  updateNewsPost,
} from './lib/newsApi.ts'
import {
  cancelMyFixtureTicketRequest,
  completeMyAcceptedTicketRequest,
  type AdminFixtureTicketRequest,
  type FixtureTicketWindowStatus,
  fetchPendingFixtureTicketRequests,
  fetchFixtureTicketWindows,
  fetchMyFixtureTicketRequests,
  lookupTravelCompanionMembers,
  type MyFixtureTicketRequest,
  fixtureMatchKey,
  formatFixtureMatchKeyLabel,
  parseFixtureMatchKey,
  requestFixtureTicket,
  setFixtureTicketRequestStatus,
  updateFixtureTicketRequestDepositConfirmed,
  updateFixtureTicketRequestBalancePayment,
  updateFixtureTicketRequestTicketConfirmed,
  upsertFixtureTicketWindow,
  updateFixtureTicketWindowMaxTickets,
} from './lib/fixtureTicketsApi.ts'
import {
  deleteMerchandiseProduct,
  fetchAllMerchandiseOrders,
  fetchMerchandiseProducts,
  fetchMyMerchandiseOrders,
  insertMerchandiseOrder,
  insertMerchandiseProduct,
  reorderMerchandiseProducts,
  updateMerchandiseProduct,
  updateMerchandiseOrderStatus,
  type MerchandiseOrderLine,
  type MerchandiseOrderRow,
  type MerchandiseOrderStatus,
  type MerchandiseProduct,
} from './lib/merchandiseApi.ts'
import { resizeImageFileToJpegDataUrl } from './lib/resizeImage.ts'
import { createAdminUser, deleteAdminUser, fetchAdminUsers, type AdminUserRow } from './lib/adminUsersApi.ts'
import {
  fetchMemberEmailRecipients,
  sendMemberBulkEmail,
  sendMemberSelectedEmail,
  type MemberEmailAudience,
} from './lib/adminEmailsApi.ts'
import { useWebAppManifest } from './hooks/useWebAppManifest.ts'
import { useAdminRoute } from './hooks/useAdminRoute.ts'
import { ADMIN_PORTAL_URL } from './lib/adminAppBootstrap.ts'
import {
  createOfficialMembershipRequest,
  createOfficialMembershipOffer,
  deleteAdminOfficialMembershipRequest,
  deleteOfficialMembershipOffer,
  fetchAdminOfficialMembershipRequests,
  fetchOfficialMembershipOffers,
  fetchMyOfficialMembershipRequests,
  reorderOfficialMembershipOffers,
  setAdminOfficialMembershipRequestStatus,
  updateOfficialMembershipOffer,
  type AdminOfficialMembershipRequest,
  type OfficialMembershipOffer,
  type OfficialMembershipRequest,
} from './lib/officialMembershipsApi.ts'
import {
  MEMBERSHIP_DISPLAY_END_YEAR,
  MEMBERSHIP_DISPLAY_START_YEAR,
  defaultMembershipValidUntilIso,
  formatValidUntilLabel,
  isInRenewalNoticeWindow,
  nextSeasonPeriodLabels,
  nextSeasonValidUntilIso,
} from './lib/membershipSeason.ts'
import { ClubPaymentMethodFields, ClubPaymentMethodsBlock, STRIPE_SERVICE_FEE_EUR } from './components/ClubPaymentMethods.tsx'
import {
  MembershipPendingView,
  OptionalOfficialMembershipPicker,
} from './components/MembershipRegistrationPayment.tsx'
import { FamilyOfficialMembershipTeaser } from './components/FamilyOfficialMembershipTeaser.tsx'
import { OfficialMembershipRequestSection } from './components/OfficialMembershipRequestSection.tsx'
import { OfficialMembershipTeaser } from './components/OfficialMembershipTeaser.tsx'
import { NewsPushBell } from './components/NewsPushBell.tsx'
import { AdminNewsPostPreview } from './components/AdminNewsPostPreview.tsx'
import { NewsFeed } from './components/NewsFeed.tsx'

const MEMBERSHIP_FEE_EUR = 15
/** Ticket deposit via Revolut / bank transfer. Stripe adds {@link STRIPE_SERVICE_FEE_EUR}. */
const TICKET_DEPOSIT_FEE_EUR = 50

function ticketDepositAmountEur(ticketSlotCount: number): number {
  return TICKET_DEPOSIT_FEE_EUR * Math.max(1, ticketSlotCount)
}

function formatLongDate(day: number, monthIndex: number, year: number): string {
  return new Date(year, monthIndex, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

type OfficialMuMembershipFieldsProps = {
  membershipId: string
  onMembershipIdChange: (value: string) => void
  status: OfficialMuMembershipFormStatus
  onStatusChange: (value: OfficialMuMembershipFormStatus) => void
  idInputName?: string
  statusHint?: string
  /** When true, status is shown read-only (profile/family edits). Registration stays editable. */
  statusReadOnly?: boolean
}

function OfficialMuMembershipFields({
  membershipId,
  onMembershipIdChange,
  status,
  onStatusChange,
  idInputName = 'official-mu-id',
  statusHint = 'If you have or are waiting for official MU membership, tell us whether it is active or still pending.',
  statusReadOnly = false,
}: OfficialMuMembershipFieldsProps) {
  const hasLockedStatus = status === 'activated' || status === 'pending'

  return (
    <>
      <p className="membership-form-section-title">Official Manchester United membership</p>
      {hasLockedStatus && (
        <label className="auth-field membership-field">
          <span className="auth-label">Membership number</span>
          <input
            className="auth-input"
            type="text"
            name={idInputName}
            autoComplete="off"
            placeholder="Required when status is Activated or Pending"
            value={membershipId}
            onChange={(ev) => onMembershipIdChange(ev.target.value)}
          />
        </label>
      )}
      {statusReadOnly ? (
        <div className="membership-mu-status-readonly">
          <span className="auth-label">Membership status</span>
          <p className="mycmusc-summary-value">
            {hasLockedStatus
              ? formatOfficialMuMembershipStatus(status)
              : 'Not applicable — I do not have official MU membership yet'}
          </p>
          <p className="membership-mu-status-hint">Status can only be changed by the club admin.</p>
          {!hasLockedStatus && (
            <p className="membership-mu-status-hint">
              Contact the club admin if you need to add official Manchester United membership details.
            </p>
          )}
        </div>
      ) : (
        <>
          {!hasLockedStatus && (
            <label className="auth-field membership-field">
              <span className="auth-label">Membership number</span>
              <input
                className="auth-input"
                type="text"
                name={idInputName}
                autoComplete="off"
                placeholder="Required when status is Activated or Pending"
                value={membershipId}
                onChange={(ev) => onMembershipIdChange(ev.target.value)}
              />
            </label>
          )}
          <fieldset className="membership-mu-status-fieldset">
            <legend className="membership-mu-status-legend">Membership status</legend>
            <p className="membership-mu-status-hint">{statusHint}</p>
            <label className="membership-mu-status-option">
              <input
                type="radio"
                name={`${idInputName}-status`}
                value="activated"
                checked={status === 'activated'}
                onChange={() => onStatusChange('activated')}
              />
              <span>Activated — my official membership is active</span>
            </label>
            <label className="membership-mu-status-option">
              <input
                type="radio"
                name={`${idInputName}-status`}
                value="pending"
                checked={status === 'pending'}
                onChange={() => onStatusChange('pending')}
              />
              <span>Pending — not yet active</span>
            </label>
            <label className="membership-mu-status-option">
              <input
                type="radio"
                name={`${idInputName}-status`}
                value=""
                checked={status === ''}
                onChange={() => {
                  onStatusChange('')
                  onMembershipIdChange('')
                }}
              />
              <span>Not applicable — I do not have official MU membership yet</span>
            </label>
          </fieldset>
        </>
      )}
    </>
  )
}

type CyprusMembershipFormProps = {
  variant?: 'registration' | 'family'
  onBack: () => void
  officialOffers: OfficialMembershipOffer[]
  officialOffersLoading: boolean
  onSubmitApplication: (
    payload: MemberApplicationPayload,
    optionalOfficialOfferId: string | null,
  ) => Promise<void>
}

function CyprusMembershipForm({
  variant = 'registration',
  onBack,
  officialOffers,
  officialOffersLoading,
  onSubmitApplication,
}: CyprusMembershipFormProps) {
  const isFamily = variant === 'family'
  const periodStart = formatLongDate(1, 5, MEMBERSHIP_DISPLAY_START_YEAR)
  const periodEnd = formatLongDate(31, 4, MEMBERSHIP_DISPLAY_END_YEAR)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [officialMuMembershipId, setOfficialMuMembershipId] = useState('')
  const [officialMuMembershipStatus, setOfficialMuMembershipStatus] = useState<
    'activated' | 'pending' | ''
  >('')
  const [optionalOfficialOfferId, setOptionalOfficialOfferId] = useState<string | null>(null)
  const [familyRelationship, setFamilyRelationship] = useState('')
  const [familyRelationshipOther, setFamilyRelationshipOther] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleMembershipSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!firstName.trim()) {
      setFormError('Please enter your first name.')
      return
    }
    if (!lastName.trim()) {
      setFormError('Please enter your last name.')
      return
    }
    if (isFamily) {
      if (!familyRelationship) {
        setFormError('Please select your relationship to this family member.')
        return
      }
      if (familyRelationship === 'other' && !familyRelationshipOther.trim()) {
        setFormError('Please describe the family relationship.')
        return
      }
    }
    if (!mobilePhone.trim()) {
      setFormError('Please enter your mobile phone number.')
      return
    }
    const mobileDigits = mobilePhone.replace(/\D/g, '')
    if (mobileDigits.length < 8) {
      setFormError('Please enter a valid mobile phone number.')
      return
    }
    if (!dateOfBirth) {
      setFormError('Please enter your date of birth.')
      return
    }
    const dob = parseDateOfBirthInput(dateOfBirth)
    if (!dob) {
      setFormError('Please enter a valid date of birth.')
      return
    }
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    if (dob > today) {
      setFormError('Date of birth cannot be in the future.')
      return
    }
    const oldest = new Date()
    oldest.setFullYear(oldest.getFullYear() - 120)
    if (dob < oldest) {
      setFormError('Please check your date of birth.')
      return
    }
    if (!address.trim()) {
      setFormError('Please enter your address.')
      return
    }
    if (!area.trim()) {
      setFormError('Please enter your area.')
      return
    }
    if (!postalCode.trim()) {
      setFormError('Please enter your postal code.')
      return
    }
    if (!city.trim()) {
      setFormError('Please enter your city.')
      return
    }
    if (!country.trim()) {
      setFormError('Please enter your country.')
      return
    }
    if (!agreed) {
      setFormError('Please confirm that you understand the membership terms.')
      return
    }

    const parsedMu = parseOfficialMuMembershipFields(officialMuMembershipId, officialMuMembershipStatus)
    if ('error' in parsedMu) {
      setFormError(parsedMu.error)
      return
    }

    const payload: MemberApplicationPayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      mobilePhone: mobilePhone.trim(),
      dateOfBirth,
      address: address.trim(),
      area: area.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
      country: country.trim(),
      officialMuMembershipId: parsedMu.officialMuMembershipId,
      officialMuMembershipStatus: parsedMu.officialMuMembershipStatus,
      familyRelationship: isFamily ? familyRelationship : null,
      familyRelationshipOther:
        isFamily && familyRelationship === 'other' ? familyRelationshipOther.trim() : null,
    }

    setSubmitting(true)
    try {
      await onSubmitApplication(payload, optionalOfficialOfferId)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit application. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="membership-flow">
      <button type="button" className="membership-back" onClick={onBack}>
        ← Back
      </button>

      <h2 className="membership-form-title">
        {isFamily ? 'Family member — Cyprus MU Supporters Club' : 'Cyprus MU Supporters Club — membership'}
      </h2>

      <div className="membership-info-card">
        <p className="membership-info-period">
          <strong>Membership season:</strong> Supporters Club membership starts on{' '}
          <strong>1 June</strong> each year and expires on <strong>31 May</strong> of the following year.
        </p>
        <p className="membership-info-current">
          The current season runs from <strong>{periodStart}</strong> to <strong>{periodEnd}</strong>.
        </p>
        <p className="membership-info-benefits">
          {isFamily
            ? 'Register a family member on your account using the same process as your own membership. Each person receives their own membership number once approved.'
            : 'By becoming a member of Cyprus Manchester United Supporters Club, you are eligible for the members benefits.'}
        </p>
      </div>

      <form className="membership-form" onSubmit={handleMembershipSubmit} noValidate>
        <p className="membership-form-intro">
          {isFamily
            ? 'Enter the family member’s details below. Payment will be shown after you submit.'
            : 'Complete the form below to apply for membership.'}
        </p>

        <label className="auth-field membership-field">
          <span className="auth-label">First name</span>
          <input
            className="auth-input"
            type="text"
            name="membership-given-name"
            autoComplete="given-name"
            value={firstName}
            onChange={(ev) => setFirstName(ev.target.value)}
          />
        </label>
        <label className="auth-field membership-field">
          <span className="auth-label">Last name</span>
          <input
            className="auth-input"
            type="text"
            name="membership-family-name"
            autoComplete="family-name"
            value={lastName}
            onChange={(ev) => setLastName(ev.target.value)}
          />
        </label>

        {isFamily && (
          <>
            <p className="membership-form-section-title">Family relationship</p>
            <label className="auth-field membership-field">
              <span className="auth-label">Relationship to you</span>
              <select
                className="auth-input"
                name="membership-family-relationship"
                value={familyRelationship}
                onChange={(ev) => {
                  setFamilyRelationship(ev.target.value)
                  if (ev.target.value !== 'other') setFamilyRelationshipOther('')
                }}
              >
                <option value="">Select relationship…</option>
                {FAMILY_RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {familyRelationship === 'other' && (
              <label className="auth-field membership-field">
                <span className="auth-label">Please specify</span>
                <input
                  className="auth-input"
                  type="text"
                  name="membership-family-relationship-other"
                  placeholder="e.g. Cousin, in-law"
                  value={familyRelationshipOther}
                  onChange={(ev) => setFamilyRelationshipOther(ev.target.value)}
                />
              </label>
            )}
          </>
        )}

        <label className="auth-field membership-field">
          <span className="auth-label">Mobile phone number</span>
          <input
            className="auth-input"
            type="tel"
            name="membership-mobile"
            autoComplete="tel"
            inputMode="tel"
            placeholder="e.g. +357 99 000000"
            value={mobilePhone}
            onChange={(ev) => setMobilePhone(ev.target.value)}
          />
        </label>
        <label className="auth-field membership-field">
          <span className="auth-label">Date of birth</span>
          <input
            className="auth-input membership-input-date"
            type="date"
            name="membership-dob"
            autoComplete="bday"
            max={new Date().toISOString().slice(0, 10)}
            value={dateOfBirth}
            onChange={(ev) => setDateOfBirth(ev.target.value)}
          />
        </label>

        <p className="membership-form-section-title">Address</p>

        <label className="auth-field membership-field">
          <span className="auth-label">Address</span>
          <input
            className="auth-input"
            type="text"
            name="membership-address"
            autoComplete="street-address"
            placeholder="Street, building, flat"
            value={address}
            onChange={(ev) => setAddress(ev.target.value)}
          />
        </label>
        <label className="auth-field membership-field">
          <span className="auth-label">Area</span>
          <input
            className="auth-input"
            type="text"
            name="membership-area"
            autoComplete="address-level3"
            placeholder="e.g. Strovolos"
            value={area}
            onChange={(ev) => setArea(ev.target.value)}
          />
        </label>
        <label className="auth-field membership-field">
          <span className="auth-label">Postal code</span>
          <input
            className="auth-input"
            type="text"
            name="membership-postal-code"
            autoComplete="postal-code"
            inputMode="numeric"
            value={postalCode}
            onChange={(ev) => setPostalCode(ev.target.value)}
          />
        </label>
        <label className="auth-field membership-field">
          <span className="auth-label">City</span>
          <input
            className="auth-input"
            type="text"
            name="membership-city"
            autoComplete="address-level2"
            placeholder="e.g. Nicosia"
            value={city}
            onChange={(ev) => setCity(ev.target.value)}
          />
        </label>
        <label className="auth-field membership-field">
          <span className="auth-label">Country</span>
          <input
            className="auth-input"
            type="text"
            name="membership-country"
            autoComplete="country-name"
            placeholder="e.g. Cyprus"
            value={country}
            onChange={(ev) => setCountry(ev.target.value)}
          />
        </label>

        <OfficialMuMembershipFields
          membershipId={officialMuMembershipId}
          onMembershipIdChange={setOfficialMuMembershipId}
          status={officialMuMembershipStatus}
          onStatusChange={setOfficialMuMembershipStatus}
          idInputName="membership-official-mu-id"
        />

        <OptionalOfficialMembershipPicker
          offers={officialOffers}
          loading={officialOffersLoading}
          cyprusFeeEur={MEMBERSHIP_FEE_EUR}
          selectedOfferId={optionalOfficialOfferId}
          onSelectOfferId={setOptionalOfficialOfferId}
        />

        <label className="membership-checkbox-row">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(ev) => setAgreed(ev.target.checked)}
          />
          <span>
            {isFamily
              ? 'I confirm this application is for a family member on my account and that the details provided are correct.'
              : 'I understand that membership runs from 1 June to 31 May and I wish to apply for Cyprus Manchester United Supporters Club membership.'}
          </span>
        </label>

        {formError && <p className="auth-message is-error">{formError}</p>}

        <button type="submit" className="auth-submit membership-submit" disabled={submitting}>
          {submitting
            ? 'Submitting…'
            : isFamily
              ? 'Submit family member application'
              : 'Submit membership application'}
        </button>
      </form>
    </div>
  )
}

type RenewMembershipModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: () => Promise<void>
  submitting: boolean
  error: string | null
  currentSeasonEndLabel: string
  nextSeasonStartLabel: string
  nextSeasonEndLabel: string
  applicationId: string
}

function RenewMembershipModal({
  open,
  onClose,
  onSubmit,
  submitting,
  error,
  currentSeasonEndLabel,
  nextSeasonStartLabel,
  nextSeasonEndLabel,
  applicationId,
}: RenewMembershipModalProps) {
  const [confirmedPayment, setConfirmedPayment] = useState(false)

  useEffect(() => {
    if (open) setConfirmedPayment(false)
  }, [open])

  if (!open) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="renewal-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="renewal-modal-title" className="renewal-modal-title">
            Renew membership
          </h2>
          <button type="button" className="renewal-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="renewal-modal-lead">
          Your current season ends on <strong>{currentSeasonEndLabel}</strong>. Pay for the next season (
          <strong>
            {nextSeasonStartLabel} – {nextSeasonEndLabel}
          </strong>
          ) using one of the methods below. The committee will extend your membership after they confirm payment.
        </p>

        <div className="membership-payment-card renewal-modal-payment" role="region" aria-labelledby="renewal-payment-heading">
          <h3 id="renewal-payment-heading" className="membership-payment-title">
            Payment
          </h3>
          <p className="membership-payment-fee">
            <strong>Renewal fee:</strong> €{MEMBERSHIP_FEE_EUR} for the next membership season (
            {nextSeasonStartLabel} – {nextSeasonEndLabel}).
          </p>
          <p className="membership-payment-intro">
            Use bank transfer, Revolut, or Stripe below. For manual transfers, include your <strong>full name</strong> and{' '}
            <strong>membership number</strong> in the payment reference.
          </p>
          <ClubPaymentMethodFields
            stripe={{
              amountEur: MEMBERSHIP_FEE_EUR,
              description: 'Cyprus MU Supporters Club — membership renewal',
              paymentKind: 'renewal',
              referenceId: applicationId,
              returnPath: '/mycmusc',
            }}
          />
        </div>

        <label className="membership-checkbox-row renewal-modal-checkbox">
          <input
            type="checkbox"
            checked={confirmedPayment}
            onChange={(ev) => setConfirmedPayment(ev.target.checked)}
          />
          <span>
            I have paid or will pay the renewal fee (bank, Revolut, or Stripe) and understand my renewal stays{' '}
            <strong>pending</strong> until the committee confirms payment.
          </span>
        </label>

        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}

        <div className="renewal-modal-actions">
          <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            disabled={!confirmedPayment || submitting}
            onClick={() => void onSubmit()}
          >
            {submitting ? 'Submitting…' : 'Submit renewal request'}
          </button>
        </div>
      </div>
    </div>
  )
}

type NewsDetailModalProps = {
  post: NewsPost | null
  open: boolean
  onClose: () => void
}

function NewsDetailModal({ post, open, onClose }: NewsDetailModalProps) {
  if (!open || !post) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog news-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-detail-title"
      >
        <div className="renewal-modal-head">
          <h2 id="news-detail-title" className="renewal-modal-title news-detail-modal-title">
            {post.title}
          </h2>
          <button type="button" className="renewal-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="news-detail-modal-date">
          Published: {new Date(post.publishedAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}
        </p>
        <div className="news-detail-modal-scroll">
          <div className="news-detail-modal-body">{post.body}</div>
          {post.bodyPhotos.length > 0 ? (
            <ul className="news-detail-modal-gallery" aria-label="Article photos">
              {post.bodyPhotos.map((src, index) => (
                <li key={`${index}-${src.slice(0, 24)}`}>
                  <img src={src} alt="" className="news-detail-modal-gallery-img" />
                </li>
              ))}
            </ul>
          ) : newsDesktopImage(post) ? (
            <div className="news-detail-modal-visual">
              <img
                src={newsDesktopImage(post)!}
                alt=""
                className="news-detail-modal-img news-detail-modal-img--desktop"
              />
            </div>
          ) : null}
        </div>
        <div className="renewal-modal-actions">
          <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

type AdminFilter = 'all' | 'pending' | 'active'
type AdminTab = 'members' | 'tickets' | 'ticketRequests' | 'news' | 'merch' | 'official' | 'email'
type AdminTicketFilter = 'pending' | 'approved' | 'completed' | 'cancelled'

function isTicketRequestCancelled(request: {
  status: string
  userCancelledAt: string | null
}): boolean {
  return Boolean(request.userCancelledAt) || request.status === 'cancelled'
}

function formatTicketMatchTabLabel(matchKey: string): string {
  const parsed = parseFixtureMatchKey(matchKey)
  if (!parsed) return formatFixtureMatchKeyLabel(matchKey)
  return `${parsed.opponent} · ${formatFixtureKickoff(parsed.kickoffIso)}`
}

function parseMaxTicketsDraft(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function fixtureWindowStatusLabel(status: FixtureTicketWindowStatus): string {
  if (status === 'open') return 'Open'
  if (status === 'closed') return 'Closed'
  return 'Disabled'
}

function fixtureTicketsRemaining(maxTickets: number | null, activeRequestCount: number): number | null {
  if (maxTickets == null) return null
  return Math.max(0, maxTickets - activeRequestCount)
}

function parseTicketBalanceAmountDraft(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100) / 100
}

function parseTicketPaymentDeadlineDraft(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dt = new Date(`${trimmed}T12:00:00`)
    if (Number.isNaN(dt.getTime())) return null
    return trimmed
  }

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const dt = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return null
  if (dt.getFullYear() !== year || dt.getMonth() + 1 !== month || dt.getDate() !== day) return null
  return iso
}

function formatTicketBalancePaymentDeadlineForInput(deadlineIso: string | null | undefined): string {
  if (!deadlineIso) return ''
  const iso = String(deadlineIso).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function isNewsImageSource(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^data:image\//i.test(trimmed)) return true
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

type TicketDepositPaymentCardProps = {
  fixture: UpcomingFixture | null
  membershipNumber: string
  ticketReference: string
  ticketSlotCount?: number
  returnPath?: string
  headingId?: string
  showFixtureSummary?: boolean
}

function TicketDepositPaymentCard({
  fixture,
  membershipNumber,
  ticketReference,
  ticketSlotCount = 1,
  returnPath = '/tickets',
  headingId = 'ticket-deposit-payment-heading',
  showFixtureSummary = true,
}: TicketDepositPaymentCardProps) {
  const depositEur = ticketDepositAmountEur(ticketSlotCount)
  const stripeTotalEur = depositEur + STRIPE_SERVICE_FEE_EUR

  return (
    <div className="membership-payment-card renewal-modal-payment" role="region" aria-labelledby={headingId}>
      <h3 id={headingId} className="membership-payment-title">
        Προκαταβολή για την αγωρά εισητηρίου / Ticket deposit payment
      </h3>
      {showFixtureSummary && fixture && (
        <p className="membership-payment-intro">
          <strong>Match:</strong>{' '}
          {fixture.home ? 'Manchester United vs ' : ''}
          {!fixture.home ? `${fixture.opponent} vs Manchester United` : fixture.opponent} ·{' '}
          {formatFixtureKickoff(fixture.kickoffIso)} · {fixture.venue}
        </p>
      )}
      <p className="membership-payment-fee">
        <strong>Revolut / Bank transfer:</strong> €{depositEur.toFixed(2)}
        {ticketSlotCount > 1 && (
          <>
            {' '}
            (€{TICKET_DEPOSIT_FEE_EUR.toFixed(2)} × {ticketSlotCount} tickets)
          </>
        )}
      </p>
      <p className="membership-payment-fee">
        <strong>Stripe (card):</strong> €{stripeTotalEur.toFixed(2)} (€{depositEur.toFixed(2)} + €
        {STRIPE_SERVICE_FEE_EUR.toFixed(2)} service charge)
      </p>
      <p className="membership-payment-intro">
        Use bank transfer, Revolut, or Stripe below. For manual transfers, include your <strong>full name</strong> and{' '}
        <strong>membership number {membershipNumber}</strong> in the payment reference.
      </p>
      <ClubPaymentMethodFields
        stripe={{
          amountEur: depositEur,
          description: `Ticket deposit — ${ticketReference}`,
          paymentKind: 'ticket',
          referenceId: ticketReference,
          returnPath,
        }}
      />
      <div className="ticket-deposit-notes">
        <p className="ticket-deposit-notes-lead">Παρακαλούμε σημειώστε τα ακόλουθα:</p>
        <ul className="ticket-deposit-notes-list">
          <li>
            Η υποβολή αιτήματος και η καταβολή προκαταβολής δεν εγγυώνται την εξασφάλιση εισιτηρίου.
          </li>
          <li>
            Σε περίπτωση που ο Σύνδεσμος δεν λάβει επαρκή αριθμό εισιτηρίων για να καλύψει όλα τα αιτήματα, θα
            σας επιστραφεί ολόκληρο το ποσό της προκαταβολής σας.
          </li>
          <li>
            Σε περίπτωση που επιθυμείτε να ακυρώσετε το αίτημά σας, η προκαταβολή σας θα επιστραφεί μόνο εφόσον το
            συγκεκριμένο εισιτήριο διατεθεί σε άλλο μέλος. Σε αυτή την περίπτωση θα παρακρατείται ποσό €10 ως
            διοικητικό κόστος ακύρωσης.
          </li>
          <li>
            Κατά τη διαδικασία κατανομής εισιτηρίων, προτεραιότητα δίνεται πάντοτε στα μέλη που δεν έχουν
            προηγουμένως παρακολουθήσει αγώνα της Manchester United στο Old Trafford μέσω του Συνδέσμου μας.
          </li>
        </ul>
      </div>
    </div>
  )
}

type TicketBalancePaymentCardProps = {
  fixture: UpcomingFixture | null
  membershipNumber: string
  ticketReference: string
  balanceRemainingAmountEur: number
  balancePaymentDeadline: string | null
  returnPath?: string
  headingId?: string
  showFixtureSummary?: boolean
}

function formatTicketPaymentDeadlineLabel(deadlineIso: string | null | undefined): string {
  if (!deadlineIso) return '—'
  const dt = new Date(`${deadlineIso}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return deadlineIso
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function TicketBalancePaymentCard({
  fixture,
  membershipNumber,
  ticketReference,
  balanceRemainingAmountEur,
  balancePaymentDeadline,
  returnPath = '/tickets',
  headingId = 'ticket-balance-payment-heading',
  showFixtureSummary = true,
}: TicketBalancePaymentCardProps) {
  const stripeTotalEur = balanceRemainingAmountEur + STRIPE_SERVICE_FEE_EUR

  return (
    <div className="membership-payment-card renewal-modal-payment" role="region" aria-labelledby={headingId}>
      <h3 id={headingId} className="membership-payment-title">
        Υπόλοιπο πληρωμής εισιτηρίου / Ticket balance payment
      </h3>
      {showFixtureSummary && fixture && (
        <p className="membership-payment-intro">
          <strong>Match:</strong>{' '}
          {fixture.home ? 'Manchester United vs ' : ''}
          {!fixture.home ? `${fixture.opponent} vs Manchester United` : fixture.opponent} ·{' '}
          {formatFixtureKickoff(fixture.kickoffIso)} · {fixture.venue}
        </p>
      )}
      <p className="membership-payment-fee">
        <strong>Remaining amount:</strong> €{balanceRemainingAmountEur.toFixed(2)}
      </p>
      <p className="membership-payment-fee">
        <strong>Payment deadline:</strong> {formatTicketPaymentDeadlineLabel(balancePaymentDeadline)}
      </p>
      <p className="membership-payment-fee">
        <strong>Revolut / Bank transfer:</strong> €{balanceRemainingAmountEur.toFixed(2)}
      </p>
      <p className="membership-payment-fee">
        <strong>Stripe (card):</strong> €{stripeTotalEur.toFixed(2)} (€{balanceRemainingAmountEur.toFixed(2)} + €
        {STRIPE_SERVICE_FEE_EUR.toFixed(2)} service charge)
      </p>
      <p className="membership-payment-intro">
        Use bank transfer, Revolut, or Stripe below. For manual transfers, include your <strong>full name</strong> and{' '}
        <strong>membership number {membershipNumber}</strong> in the payment reference.
      </p>
      <ClubPaymentMethodFields
        stripe={{
          amountEur: balanceRemainingAmountEur,
          description: `Ticket balance — ${ticketReference}`,
          paymentKind: 'ticket',
          referenceId: `${ticketReference}|balance`,
          returnPath,
        }}
      />
    </div>
  )
}

type TicketRequestConfirmModalProps = {
  open: boolean
  fixture: UpcomingFixture | null
  submitting: boolean
  error: string | null
  requesterMembershipNumber: number | null
  onClose: () => void
  onConfirm: (travelCompanionMembershipNumbers: number[]) => void
}

type TravelCompanionPreview = {
  loading: boolean
  fullName: string | null
  found: boolean
  eligible: boolean
  ineligibleReason: string | null
  isSelf: boolean
}

function parseTicketTravelCompanionDrafts(rows: string[]): number[] {
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

function TicketRequestConfirmModal({
  open,
  fixture,
  submitting,
  error,
  requesterMembershipNumber,
  onClose,
  onConfirm,
}: TicketRequestConfirmModalProps) {
  const [travelCompanionRows, setTravelCompanionRows] = useState<string[]>([])
  const [companionPreviewByIndex, setCompanionPreviewByIndex] = useState<Record<number, TravelCompanionPreview>>({})

  useEffect(() => {
    if (open) {
      setTravelCompanionRows([])
      setCompanionPreviewByIndex({})
    }
  }, [open, fixture?.kickoffIso, fixture?.opponent])

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

  if (!open || !fixture) return null

  const travelCompanionNumbers = parseTicketTravelCompanionDrafts(travelCompanionRows)
  const ticketSlotCount = 1 + travelCompanionNumbers.length
  const depositEur = ticketDepositAmountEur(ticketSlotCount)
  const stripeDepositEur = depositEur + STRIPE_SERVICE_FEE_EUR

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
      const reason = preview.ineligibleReason ?? 'not eligible for match tickets'
      return (
        <span className="ticket-request-travel-companion-name is-error">
          {preview.fullName ?? 'Member'} — {reason}
        </span>
      )
    }
    return <span className="ticket-request-travel-companion-name">{preview.fullName ?? 'Member'}</span>
  }

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="renewal-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-request-modal-title">
        <div className="renewal-modal-head">
          <h2 id="ticket-request-modal-title" className="renewal-modal-title">
            Match ticket request
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
          Are you sure you want to submit a match ticket request for{' '}
          <strong>
            {fixture.home ? 'Manchester United vs ' : ''}
            {!fixture.home ? `${fixture.opponent} vs Manchester United` : fixture.opponent}
          </strong>{' '}
          ({formatFixtureKickoff(fixture.kickoffIso)})?
        </p>
        <p className="renewal-modal-lead">
          After you confirm, you will proceed to pay the ticket deposit (€{depositEur.toFixed(2)} via Revolut/bank, €
          {stripeDepositEur.toFixed(2)} via Stripe
          {ticketSlotCount > 1
            ? ` — €${TICKET_DEPOSIT_FEE_EUR.toFixed(2)} per ticket × ${ticketSlotCount} tickets`
            : ''}
          ).
        </p>
        <div className="ticket-request-travel-companions">
          <p className="auth-label">
            Add the Cyprus Man Utd Supporter ID of any member who will travel with you (optional).
          </p>
          <p className="renewal-modal-hint">
            {travelCompanionNumbers.length === 0
              ? "By adding a member's number you are asking for a total of 2 tickets and no other request is needed from the travel-with member. You can add as many travel companions as you need."
              : `By adding a member's number you are asking for a total of ${ticketSlotCount} tickets and no other request is needed from the travel-with member. You can add as many travel companions as you need.`}
          </p>
          {travelCompanionRows.length > 0 && (
            <ul className="ticket-request-travel-companion-list">
              {travelCompanionRows.map((row, index) => (
                <li key={`travel-companion-${index}`} className="ticket-request-travel-companion-row">
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
            disabled={submitting || travelCompanionRows.length >= 10}
          >
            + Add travelling member
          </button>
        </div>
        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}
        <div className="renewal-modal-actions">
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            No
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            onClick={() => onConfirm(travelCompanionNumbers)}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  )
}

type TicketDepositPaymentModalProps = {
  open: boolean
  onClose: () => void
  fixture: UpcomingFixture | null
  membershipNumber: string
  ticketReference: string
  ticketSlotCount?: number
}

function TicketDepositPaymentModal({
  open,
  onClose,
  fixture,
  membershipNumber,
  ticketReference,
  ticketSlotCount = 1,
}: TicketDepositPaymentModalProps) {
  if (!open || !fixture) return null

  const depositEur = ticketDepositAmountEur(ticketSlotCount)
  const stripeDepositEur = depositEur + STRIPE_SERVICE_FEE_EUR

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog renewal-modal-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-deposit-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="ticket-deposit-modal-title" className="renewal-modal-title">
            Προκαταβολή για την αγωρά εισητηρίου / Ticket deposit payment
          </h2>
          <button type="button" className="renewal-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="renewal-modal-lead">
          Your ticket request has been submitted and is <strong>pending</strong> committee review. Please pay the
          deposit of <strong>€{depositEur.toFixed(2)}</strong> below to complete your application
          {ticketSlotCount > 1
            ? ` (€${TICKET_DEPOSIT_FEE_EUR.toFixed(2)} per ticket × ${ticketSlotCount} tickets — €${depositEur.toFixed(2)} via Revolut/bank, €${stripeDepositEur.toFixed(2)} via Stripe)`
            : ` (€${depositEur.toFixed(2)} via Revolut/bank, €${stripeDepositEur.toFixed(2)} via Stripe)`}
          .
        </p>
        <TicketDepositPaymentCard
          key={`${ticketReference}-${ticketSlotCount}`}
          fixture={fixture}
          membershipNumber={membershipNumber}
          ticketReference={ticketReference}
          ticketSlotCount={ticketSlotCount}
          returnPath="/tickets"
          headingId="ticket-deposit-modal-payment-heading"
        />
        <div className="renewal-modal-actions">
          <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

type TicketBalancePaymentModalProps = {
  open: boolean
  onClose: () => void
  fixture: UpcomingFixture | null
  membershipNumber: string
  ticketReference: string
  balanceRemainingAmountEur: number | null
  balancePaymentDeadline: string | null
}

function TicketBalancePaymentModal({
  open,
  onClose,
  fixture,
  membershipNumber,
  ticketReference,
  balanceRemainingAmountEur,
  balancePaymentDeadline,
}: TicketBalancePaymentModalProps) {
  if (!open || !fixture || balanceRemainingAmountEur == null || balanceRemainingAmountEur <= 0) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog renewal-modal-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-balance-payment-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="ticket-balance-payment-modal-title" className="renewal-modal-title">
            Υπόλοιπο πληρωμής εισιτηρίου / Ticket balance payment
          </h2>
          <button type="button" className="renewal-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="renewal-modal-lead">
          Your ticket has been secured. Please pay the remaining balance below by the stated deadline.
        </p>
        <TicketBalancePaymentCard
          fixture={fixture}
          membershipNumber={membershipNumber}
          ticketReference={ticketReference}
          balanceRemainingAmountEur={balanceRemainingAmountEur}
          balancePaymentDeadline={balancePaymentDeadline}
          returnPath="/tickets"
          headingId="ticket-balance-payment-modal-card-heading"
        />
        <div className="renewal-modal-actions">
          <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

type TicketCancelConfirmModalProps = {
  open: boolean
  fixture: UpcomingFixture | null
  submitting: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

function TicketCancelConfirmModal({
  open,
  fixture,
  submitting,
  error,
  onClose,
  onConfirm,
}: TicketCancelConfirmModalProps) {
  if (!open || !fixture) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="renewal-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-cancel-modal-title">
        <div className="renewal-modal-head">
          <h2 id="ticket-cancel-modal-title" className="renewal-modal-title">
            Cancel ticket request
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
          Are you sure you want to cancel your ticket request for{' '}
          <strong>
            {fixture.home ? 'Manchester United vs ' : ''}
            {!fixture.home ? `${fixture.opponent} vs Manchester United` : fixture.opponent}
          </strong>{' '}
          ({formatFixtureKickoff(fixture.kickoffIso)})?
        </p>
        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}
        <div className="renewal-modal-actions">
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            No
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            onClick={() => void onConfirm()}
            disabled={submitting}
          >
            {submitting ? 'Cancelling…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  )
}

type TicketBalancePaymentConfirmModalProps = {
  open: boolean
  memberLabel: string | null
  matchLabel: string | null
  amountEur: number | null
  paymentDeadline: string | null
  submitting: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

function TicketBalancePaymentConfirmModal({
  open,
  memberLabel,
  matchLabel,
  amountEur,
  paymentDeadline,
  submitting,
  error,
  onClose,
  onConfirm,
}: TicketBalancePaymentConfirmModalProps) {
  if (!open) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-balance-payment-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="ticket-balance-payment-modal-title" className="renewal-modal-title">
            Ticket payment
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
          Are you sure you want to send ticket payment email to the user
          {memberLabel ? (
            <>
              {' '}
              (<strong>{memberLabel}</strong>)
            </>
          ) : null}
          {matchLabel ? (
            <>
              {' '}
              for <strong>{matchLabel}</strong>
            </>
          ) : null}
          {amountEur != null ? (
            <>
              {' '}
              with remaining amount <strong>€{amountEur.toFixed(2)}</strong>
            </>
          ) : null}
          {paymentDeadline ? (
            <>
              {' '}
              and payment deadline <strong>{formatTicketPaymentDeadlineLabel(paymentDeadline)}</strong>
            </>
          ) : null}
          ?
        </p>
        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}
        <div className="renewal-modal-actions">
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            No
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            onClick={() => void onConfirm()}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  )
}

type TicketConfirmModalProps = {
  open: boolean
  requestLabel: string | null
  submitting: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

function TicketConfirmModal({
  open,
  requestLabel,
  submitting,
  error,
  onClose,
  onConfirm,
}: TicketConfirmModalProps) {
  if (!open) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-confirm-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="ticket-confirm-modal-title" className="renewal-modal-title">
            Confirm tickets
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
          Are you sure you want to confirm this ticket
          {requestLabel ? (
            <>
              {' '}
              for <strong>{requestLabel}</strong>
            </>
          ) : null}
          ?
        </p>
        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}
        <div className="renewal-modal-actions">
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            No
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            onClick={() => void onConfirm()}
            disabled={submitting}
          >
            {submitting ? 'Confirming…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  )
}

type TicketCompletionModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: () => void
  submitting: boolean
  fixture: UpcomingFixture | null
  firstName: string
  lastName: string
  email: string
  membershipNumber: string
  officialMuMembershipId: string
  ticketReference: string
  ticketSlotCount?: number
}

function TicketCompletionModal({
  open,
  onClose,
  onSubmit,
  submitting,
  fixture,
  firstName,
  lastName,
  email,
  membershipNumber,
  officialMuMembershipId,
  ticketReference,
  ticketSlotCount = 1,
}: TicketCompletionModalProps) {
  const [confirmedPayment, setConfirmedPayment] = useState(false)
  const depositEur = ticketDepositAmountEur(ticketSlotCount)
  const stripeDepositEur = depositEur + STRIPE_SERVICE_FEE_EUR

  useEffect(() => {
    if (open) setConfirmedPayment(false)
  }, [open])

  if (!open || !fixture) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="renewal-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-completion-title">
        <div className="renewal-modal-head">
          <h2 id="ticket-completion-title" className="renewal-modal-title">
            Complete ticket form
          </h2>
          <button type="button" className="renewal-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="renewal-modal-lead">
          Your ticket request is now <strong>Accepted</strong>. Please review the details and confirm payment to reserve
          your seat.
        </p>

        <dl className="ticket-form-dl">
          <div>
            <dt>Name</dt>
            <dd>{firstName}</dd>
          </div>
          <div>
            <dt>Surname</dt>
            <dd>{lastName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{email}</dd>
          </div>
          <div>
            <dt>Member ID</dt>
            <dd>{membershipNumber}</dd>
          </div>
          <div>
            <dt>Official MU membership ID</dt>
            <dd>{officialMuMembershipId || 'Not set on your profile'}</dd>
          </div>
          <div>
            <dt>Game</dt>
            <dd>
              {fixture.home ? 'Manchester United vs ' : ''}
              {!fixture.home ? `${fixture.opponent} vs Manchester United` : fixture.opponent} ·{' '}
              {formatFixtureKickoff(fixture.kickoffIso)} · {fixture.venue}
            </dd>
          </div>
        </dl>

        <TicketDepositPaymentCard
          key={`${ticketReference}-${ticketSlotCount}`}
          fixture={fixture}
          membershipNumber={membershipNumber}
          ticketReference={ticketReference}
          ticketSlotCount={ticketSlotCount}
          returnPath="/"
          headingId="ticket-payment-heading"
          showFixtureSummary={false}
        />

        <label className="membership-checkbox-row renewal-modal-checkbox">
          <input
            type="checkbox"
            checked={confirmedPayment}
            onChange={(ev) => setConfirmedPayment(ev.target.checked)}
          />
          <span>
            I confirm I will pay the ticket deposit (€{depositEur.toFixed(2)} via Revolut/bank, €
            {stripeDepositEur.toFixed(2)} via Stripe).
          </span>
        </label>

        <div className="renewal-modal-actions">
          <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            disabled={!confirmedPayment || submitting}
            onClick={onSubmit}
          >
            {submitting ? 'Submitting…' : 'Submit form'}
          </button>
        </div>
      </div>
    </div>
  )
}

type PaymentReminderConfirmModalProps = {
  open: boolean
  memberLabel: string | null
  submitting: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

function PaymentReminderConfirmModal({
  open,
  memberLabel,
  submitting,
  error,
  onClose,
  onConfirm,
}: PaymentReminderConfirmModalProps) {
  if (!open) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-reminder-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="payment-reminder-modal-title" className="renewal-modal-title">
            Payment Reminder
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
          Are you sure you want to send reminder payment email to the member
          {memberLabel ? (
            <>
              {' '}
              <strong>{memberLabel}</strong>
            </>
          ) : null}
          ?
        </p>
        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}
        <div className="renewal-modal-actions">
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            No
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            onClick={() => void onConfirm()}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  )
}

type PresentReceivedConfirmModalProps = {
  open: boolean
  memberLabel: string | null
  submitting: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

function PresentReceivedConfirmModal({
  open,
  memberLabel,
  submitting,
  error,
  onClose,
  onConfirm,
}: PresentReceivedConfirmModalProps) {
  if (!open) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="present-received-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="present-received-modal-title" className="renewal-modal-title">
            Present received
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
          Are you sure you want to send email to the user that he received the present
          {memberLabel ? (
            <>
              {' '}
              (<strong>{memberLabel}</strong>)
            </>
          ) : null}
          ?
        </p>
        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}
        <div className="renewal-modal-actions">
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            No
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            onClick={() => void onConfirm()}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  )
}

type PurchasedMembershipConfirmModalProps = {
  open: boolean
  memberLabel: string | null
  submitting: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

function PurchasedMembershipConfirmModal({
  open,
  memberLabel,
  submitting,
  error,
  onClose,
  onConfirm,
}: PurchasedMembershipConfirmModalProps) {
  if (!open) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchased-membership-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="purchased-membership-modal-title" className="renewal-modal-title">
            Purchased Membership
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
          Are you sure you want to send email to the user about their Official Manchester United membership
          {memberLabel ? (
            <>
              {' '}
              (<strong>{memberLabel}</strong>)
            </>
          ) : null}
          ?
        </p>
        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}
        <div className="renewal-modal-actions">
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            No
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            onClick={() => void onConfirm()}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  )
}

type MemberEmailComposeModalProps = {
  open: boolean
  members: MemberRegistryEntry[]
  subject: string
  body: string
  submitting: boolean
  error: string | null
  onSubjectChange: (value: string) => void
  onBodyChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}

function MemberEmailComposeModal({
  open,
  members,
  subject,
  body,
  submitting,
  error,
  onSubjectChange,
  onBodyChange,
  onClose,
  onConfirm,
}: MemberEmailComposeModalProps) {
  if (!open) return null

  const withEmail = members.filter((member) => member.email?.trim())
  const withoutEmail = members.filter((member) => !member.email?.trim())
  const uniqueEmails = [...new Set(withEmail.map((member) => member.email!.trim().toLowerCase()))]

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog renewal-modal-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-email-compose-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="member-email-compose-modal-title" className="renewal-modal-title">
            Email member{members.length === 1 ? '' : 's'}
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
          {uniqueEmails.length} unique email address{uniqueEmails.length === 1 ? '' : 'es'} will receive this message.
          The club signature is added automatically.
        </p>
        <ul className="admin-member-email-target-list">
          {withEmail.map((member) => (
            <li key={member.applicationId}>
              {[member.firstName, member.lastName].filter(Boolean).join(' ').trim() || member.applicationId}
              {' · '}
              {member.email}
            </li>
          ))}
          {withoutEmail.map((member) => (
            <li key={member.applicationId} className="is-muted">
              {[member.firstName, member.lastName].filter(Boolean).join(' ').trim() || member.applicationId}
              {' · '}
              No email on file (skipped)
            </li>
          ))}
        </ul>
        <label className="auth-field membership-field">
          <span className="auth-label">Subject</span>
          <input
            className="auth-input"
            type="text"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="auth-field membership-field">
          <span className="auth-label">Message</span>
          <textarea
            className="auth-input admin-email-body-input"
            rows={10}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            disabled={submitting}
          />
        </label>
        {withoutEmail.length > 0 && uniqueEmails.length === 0 && (
          <p className="auth-message is-error renewal-modal-error">
            None of the selected members have an email address on file.
          </p>
        )}
        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}
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
            onClick={() => void onConfirm()}
            disabled={submitting || uniqueEmails.length === 0}
          >
            {submitting ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </div>
    </div>
  )
}

type TicketDepositConfirmModalProps = {
  open: boolean
  requestLabel: string | null
  submitting: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

function TicketDepositConfirmModal({
  open,
  requestLabel,
  submitting,
  error,
  onClose,
  onConfirm,
}: TicketDepositConfirmModalProps) {
  if (!open) return null

  return (
    <div
      className="renewal-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        className="renewal-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-deposit-confirm-modal-title"
      >
        <div className="renewal-modal-head">
          <h2 id="ticket-deposit-confirm-modal-title" className="renewal-modal-title">
            Deposit confirmation
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
          Are you sure you want to confirm this request
          {requestLabel ? (
            <>
              {' '}
              for <strong>{requestLabel}</strong>
            </>
          ) : null}
          ?
        </p>
        {error && <p className="auth-message is-error renewal-modal-error">{error}</p>}
        <div className="renewal-modal-actions">
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            No
          </button>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary"
            onClick={() => void onConfirm()}
            disabled={submitting}
          >
            {submitting ? 'Confirming…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  )
}

type AdminConsoleProps = {
  memberRegistry: MemberRegistryEntry[]
  loading: boolean
  pendingRenewals: PendingRenewalListRow[]
  pendingTicketRequests: AdminFixtureTicketRequest[]
  onActivate: (applicationId: string) => Promise<string | null>
  onSendPaymentReminder: (applicationId: string) => Promise<void>
  onSetPending: (applicationId: string) => Promise<void>
  onDeleteMemberRequest: (applicationId: string) => Promise<void>
  onUpdateMemberId: (
    applicationId: string,
    memberId: string,
    officialMuMembershipStatus: OfficialMuMembershipStatus | null,
  ) => Promise<void>
  onUpdateMembershipNumber: (applicationId: string, membershipNumber: number | null) => Promise<void>
  onUpdatePresentReceived: (applicationId: string, presentReceived: boolean) => Promise<void>
  onUpdateAdminMemberFlags: (
    applicationId: string,
    flags: { member?: boolean; sendMicrosite?: boolean },
  ) => Promise<void>
  onCompleteRenewal: (row: PendingRenewalListRow) => Promise<void>
  onApproveTicketRequest: (row: AdminFixtureTicketRequest) => Promise<void>
  onCompleteTicketRequest: (row: AdminFixtureTicketRequest) => Promise<void>
  onCancelTicketRequest: (row: AdminFixtureTicketRequest) => Promise<void>
  onUpdateTicketDepositConfirmed: (requestId: string, depositConfirmed: boolean) => Promise<void>
  onUpdateTicketBalancePayment: (
    requestId: string,
    options: {
      balanceRemainingAmountEur: number
      balancePaymentDeadline?: string
      balancePaymentNotified: boolean
    },
  ) => Promise<void>
  onUpdateTicketConfirmed: (requestId: string) => Promise<void>
  onRefreshTicketRequests: () => Promise<void>
  newsPosts: NewsPost[]
  newsLoading: boolean
  onCreateNews: (payload: NewsPostPayload) => Promise<void>
  onUpdateNews: (id: string, payload: NewsPostPayload) => Promise<void>
  onDeleteNews: (id: string) => Promise<void>
  merchandiseOrders: MerchandiseOrderRow[]
  onUpdateMerchandiseOrderStatus: (orderId: string, status: MerchandiseOrderStatus) => Promise<void>
  merchandiseProducts: MerchandiseProduct[]
  onCreateMerchandiseProduct: (payload: { title: string; priceEur: number; photos: string[] }) => Promise<void>
  onUpdateMerchandiseProduct: (id: string, payload: { title: string; priceEur: number; photos?: string[] }) => Promise<void>
  onDeleteMerchandiseProduct: (id: string) => Promise<void>
  onReorderMerchandiseProducts: (ids: string[]) => Promise<void>
  ticketFixtures: UpcomingFixture[]
  ticketWindowByKey: Record<string, FixtureTicketWindowStatus>
  ticketWindowDetailsByKey: Record<string, { maxTickets: number | null; activeRequestCount: number }>
  onSetFixtureTicketStatus: (fixture: UpcomingFixture, status: FixtureTicketWindowStatus) => Promise<void>
  onUpdateFixtureTicketMaxTickets: (fixture: UpcomingFixture, maxTickets: number | null) => Promise<void>
  onSyncFixtures: () => Promise<void>
  fixturesSyncing: boolean
  adminUsers: AdminUserRow[]
  adminUsersLoading: boolean
  onCreateAdminUser: (email: string) => Promise<void>
  onDeleteAdminUser: (email: string) => Promise<void>
  officialOffers: OfficialMembershipOffer[]
  officialOffersLoading: boolean
  officialRequests: AdminOfficialMembershipRequest[]
  officialRequestsLoading: boolean
  onCreateOfficialOffer: (payload: { title: string; priceEur: number; imageUrl: string }) => Promise<void>
  onUpdateOfficialOffer: (id: string, payload: { title: string; priceEur: number; imageUrl?: string }) => Promise<void>
  onDeleteOfficialOffer: (id: string) => Promise<void>
  onReorderOfficialOffers: (ids: string[]) => Promise<void>
  onSetOfficialRequestStatus: (
    requestId: string,
    status: 'pending' | 'completed' | 'rejected' | 'cancelled',
    options?: {
      officialMuMembershipId?: string
      officialMuMembershipStatus?: OfficialMuMembershipStatus
    },
  ) => Promise<void>
  onDeleteOfficialRequest: (requestId: string) => Promise<void>
}

function AdminConsole({
  memberRegistry,
  loading,
  pendingRenewals,
  pendingTicketRequests,
  onActivate,
  onSendPaymentReminder,
  onSetPending,
  onDeleteMemberRequest,
  onUpdateMemberId,
  onUpdateMembershipNumber,
  onUpdatePresentReceived,
  onUpdateAdminMemberFlags,
  onCompleteRenewal,
  onApproveTicketRequest,
  onCompleteTicketRequest,
  onCancelTicketRequest,
  onUpdateTicketDepositConfirmed,
  onUpdateTicketBalancePayment,
  onUpdateTicketConfirmed,
  onRefreshTicketRequests,
  newsPosts,
  newsLoading,
  onCreateNews,
  onUpdateNews,
  onDeleteNews,
  merchandiseOrders,
  onUpdateMerchandiseOrderStatus,
  merchandiseProducts,
  onCreateMerchandiseProduct,
  onUpdateMerchandiseProduct,
  onDeleteMerchandiseProduct,
  onReorderMerchandiseProducts,
  ticketFixtures,
  ticketWindowByKey,
  ticketWindowDetailsByKey,
  onSetFixtureTicketStatus,
  onUpdateFixtureTicketMaxTickets,
  onSyncFixtures,
  fixturesSyncing,
  adminUsers,
  adminUsersLoading,
  onCreateAdminUser,
  onDeleteAdminUser,
  officialOffers,
  officialOffersLoading,
  officialRequests,
  officialRequestsLoading,
  onCreateOfficialOffer,
  onUpdateOfficialOffer,
  onDeleteOfficialOffer,
  onReorderOfficialOffers,
  onSetOfficialRequestStatus,
  onDeleteOfficialRequest,
}: AdminConsoleProps) {
  const [adminTab, setAdminTab] = useState<AdminTab>('members')
  const [ticketRequestsRefreshing, setTicketRequestsRefreshing] = useState(false)
  const [filter, setFilter] = useState<AdminFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyRenewalId, setBusyRenewalId] = useState<string | null>(null)
  const [busyTicketRequestId, setBusyTicketRequestId] = useState<string | null>(null)
  const [ticketFilter, setTicketFilter] = useState<AdminTicketFilter>('pending')
  const [ticketMatchFilter, setTicketMatchFilter] = useState<string>('all')
  const [newsTitle, setNewsTitle] = useState('')
  const [newsBody, setNewsBody] = useState('')
  const [newsImageUrl, setNewsImageUrl] = useState('')
  const [newsImageUrlMobile, setNewsImageUrlMobile] = useState('')
  const [newsBodyPhotos, setNewsBodyPhotos] = useState<string[]>([])
  const [newsBodyPhotoUrlDraft, setNewsBodyPhotoUrlDraft] = useState('')
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null)
  const [busyNewsId, setBusyNewsId] = useState<string | null>(null)
  const [newsError, setNewsError] = useState<string | null>(null)
  const newsFormRef = useRef<HTMLFormElement>(null)
  const [busyMerchOrderId, setBusyMerchOrderId] = useState<string | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [officialRequestFilter, setOfficialRequestFilter] = useState<'pending' | 'completed' | 'rejected'>('pending')
  const [officialRequestSearch, setOfficialRequestSearch] = useState('')
  const [merchSearch, setMerchSearch] = useState('')
  const [busyTicketWindowKey, setBusyTicketWindowKey] = useState<string | null>(null)
  const [maxTicketsDraftByMatchKey, setMaxTicketsDraftByMatchKey] = useState<Record<string, string>>({})
  const [ticketMaxTicketsError, setTicketMaxTicketsError] = useState<string | null>(null)
  const [adminMerchTitle, setAdminMerchTitle] = useState('')
  const [adminMerchPrice, setAdminMerchPrice] = useState('')
  const [adminMerchPhotos, setAdminMerchPhotos] = useState<string[]>([])
  const [adminMerchBusy, setAdminMerchBusy] = useState(false)
  const [adminMerchError, setAdminMerchError] = useState<string | null>(null)
  const [editingMerchById, setEditingMerchById] = useState<Record<string, { title: string; price: string }>>({})
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [adminUsersBusy, setAdminUsersBusy] = useState(false)
  const [officialTitle, setOfficialTitle] = useState('')
  const [officialPrice, setOfficialPrice] = useState('')
  const [officialImageUrl, setOfficialImageUrl] = useState('')
  const [officialBusy, setOfficialBusy] = useState(false)
  const [officialError, setOfficialError] = useState<string | null>(null)
  const [editingOfficialById, setEditingOfficialById] = useState<Record<string, { title: string; price: string }>>({})
  const [officialRequestBusyId, setOfficialRequestBusyId] = useState<string | null>(null)
  const [expandedOfficialRequestId, setExpandedOfficialRequestId] = useState<string | null>(null)
  const [officialMuIdDraftByRequestId, setOfficialMuIdDraftByRequestId] = useState<Record<string, string>>({})
  const [officialMuStatusDraftByRequestId, setOfficialMuStatusDraftByRequestId] = useState<
    Record<string, OfficialMuMembershipStatus>
  >({})
  const [memberIdDraftByApplicationId, setMemberIdDraftByApplicationId] = useState<Record<string, string>>({})
  const [memberMuStatusDraftByApplicationId, setMemberMuStatusDraftByApplicationId] = useState<
    Record<string, OfficialMuMembershipFormStatus>
  >({})
  const [membershipNumberDraftByApplicationId, setMembershipNumberDraftByApplicationId] = useState<Record<string, string>>({})
  const [memberActionError, setMemberActionError] = useState<string | null>(null)
  const [memberActionNotice, setMemberActionNotice] = useState<string | null>(null)
  const [paymentReminderTarget, setPaymentReminderTarget] = useState<MemberRegistryEntry | null>(null)
  const [paymentReminderSubmitting, setPaymentReminderSubmitting] = useState(false)
  const [paymentReminderError, setPaymentReminderError] = useState<string | null>(null)
  const [presentReceivedTarget, setPresentReceivedTarget] = useState<MemberRegistryEntry | null>(null)
  const [presentReceivedSubmitting, setPresentReceivedSubmitting] = useState(false)
  const [presentReceivedError, setPresentReceivedError] = useState<string | null>(null)
  const [purchasedMembershipTarget, setPurchasedMembershipTarget] = useState<MemberRegistryEntry | null>(null)
  const [purchasedMembershipSubmitting, setPurchasedMembershipSubmitting] = useState(false)
  const [purchasedMembershipError, setPurchasedMembershipError] = useState<string | null>(null)
  const [ticketDepositConfirmTarget, setTicketDepositConfirmTarget] = useState<AdminFixtureTicketRequest | null>(null)
  const [ticketDepositConfirmSubmitting, setTicketDepositConfirmSubmitting] = useState(false)
  const [ticketDepositConfirmError, setTicketDepositConfirmError] = useState<string | null>(null)
  const [ticketBalancePaymentTarget, setTicketBalancePaymentTarget] = useState<{
    request: AdminFixtureTicketRequest
    amountEur: number
    paymentDeadline: string
  } | null>(null)
  const [ticketBalancePaymentSubmitting, setTicketBalancePaymentSubmitting] = useState(false)
  const [ticketBalancePaymentError, setTicketBalancePaymentError] = useState<string | null>(null)
  const [ticketConfirmTarget, setTicketConfirmTarget] = useState<AdminFixtureTicketRequest | null>(null)
  const [ticketConfirmSubmitting, setTicketConfirmSubmitting] = useState(false)
  const [ticketConfirmError, setTicketConfirmError] = useState<string | null>(null)
  const [balanceAmountDraftByRequestId, setBalanceAmountDraftByRequestId] = useState<Record<string, string>>({})
  const [balanceDeadlineDraftByRequestId, setBalanceDeadlineDraftByRequestId] = useState<Record<string, string>>({})
  const [ticketActionNotice, setTicketActionNotice] = useState<string | null>(null)
  const [ticketActionError, setTicketActionError] = useState<string | null>(null)
  const [emailAudience, setEmailAudience] = useState<MemberEmailAudience>('all')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailNotice, setEmailNotice] = useState<string | null>(null)
  const [emailRecipientCount, setEmailRecipientCount] = useState<number | null>(null)
  const [emailRecipientsLoading, setEmailRecipientsLoading] = useState(false)
  const [selectedMemberApplicationIds, setSelectedMemberApplicationIds] = useState<Record<string, boolean>>({})
  const [memberEmailTargets, setMemberEmailTargets] = useState<MemberRegistryEntry[] | null>(null)
  const [memberEmailSubject, setMemberEmailSubject] = useState('')
  const [memberEmailBody, setMemberEmailBody] = useState('')
  const [memberEmailSubmitting, setMemberEmailSubmitting] = useState(false)
  const [memberEmailError, setMemberEmailError] = useState<string | null>(null)
  const pendingMembersCount = memberRegistry.filter((member) => member.status === 'pending').length
  const activeMembersCount = memberRegistry.filter((member) => member.status === 'active').length
  const pendingOrdersCount = merchandiseOrders.filter((order) => order.status === 'pending').length

  useEffect(() => {
    if (adminTab !== 'email') return
    let cancelled = false
    setEmailRecipientsLoading(true)
    void (async () => {
      const { recipientCount, error } = await fetchMemberEmailRecipients(emailAudience)
      if (cancelled) return
      if (error) {
        setEmailError(error.message)
        setEmailRecipientCount(null)
      } else {
        setEmailError(null)
        setEmailRecipientCount(recipientCount)
      }
      setEmailRecipientsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [adminTab, emailAudience])

  const selectedMemberCount = Object.values(selectedMemberApplicationIds).filter(Boolean).length

  function openMemberEmailCompose(members: MemberRegistryEntry[]) {
    if (members.length === 0) return
    setMemberEmailError(null)
    setMemberEmailSubject('')
    setMemberEmailBody('')
    setMemberEmailTargets(members)
  }

  const filtered = [...memberRegistry]
    .filter((m) => filter === 'all' || m.status === filter)
    .filter((m) => {
      const q = memberSearch.trim().toLowerCase()
      if (!q) return true
      return (
        m.applicationId.toLowerCase().includes(q) ||
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
        m.mobilePhone.toLowerCase().includes(q) ||
        m.officialMuMembershipId.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    })

  const ticketMatchTabKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const fixture of ticketFixtures) keys.add(fixtureMatchKey(fixture))
    for (const request of pendingTicketRequests) keys.add(request.matchKey)
    return [...keys].sort((a, b) => {
      const parsedA = parseFixtureMatchKey(a)
      const parsedB = parseFixtureMatchKey(b)
      if (!parsedA || !parsedB) return a.localeCompare(b)
      return new Date(parsedA.kickoffIso).getTime() - new Date(parsedB.kickoffIso).getTime()
    })
  }, [ticketFixtures, pendingTicketRequests])

  const filteredTicketRequests = pendingTicketRequests
    .filter((r) => ticketMatchFilter === 'all' || r.matchKey === ticketMatchFilter)
    .filter((r) => {
      if (ticketFilter === 'cancelled') return isTicketRequestCancelled(r)
      if (isTicketRequestCancelled(r)) return false
      return r.status === ticketFilter
    })

  const filteredMerchOrders = merchandiseOrders.filter((o) => {
    const q = merchSearch.trim().toLowerCase()
    if (!q) return true
    return (
      o.userId.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.deliveryBranch.toLowerCase().includes(q) ||
      o.lines.some((line) => line.title.toLowerCase().includes(q))
    )
  })

  const filteredOfficialRequests = officialRequests
    .filter((r) => r.status === officialRequestFilter)
    .filter((r) => {
      const q = officialRequestSearch.trim().toLowerCase()
      if (!q) return true
      return (
        r.offerTitle.toLowerCase().includes(q) ||
        r.userId.toLowerCase().includes(q) ||
        (r.user.fullName ?? '').toLowerCase().includes(q) ||
        (r.user.email ?? '').toLowerCase().includes(q) ||
        (r.user.applicationId ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())

  function reportStamp(): string {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  }

  function exportMembersReport() {
    const headers = [
      'Application ID',
      'Email',
      'Status',
      'Membership Number',
      'Official MU ID',
      'Official MU status',
      'Official MU package request',
      'First Name',
      'Last Name',
      'Mobile',
      'Date of Birth',
      'Address',
      'Area',
      'Postal Code',
      'City',
      'Country',
      'Submitted At',
      'Activated At',
      'Valid Until',
      'Present Received',
      'Present Received At',
      'Purchased Membership',
      'Purchased Membership At',
      'Registered to Microsite',
      'Registered to Microsite At',
    ]
    const rows = memberRegistry.map((m) => [
      m.applicationId,
      m.email ?? '',
      m.status,
      m.membershipNumber ?? '',
      m.officialMuMembershipId,
      formatOfficialMuMembershipStatus(m.officialMuMembershipStatus),
      formatOfficialMembershipRequestLabel(m.officialMembershipOfferTitle),
      m.firstName,
      m.lastName,
      m.mobilePhone,
      formatDateOfBirthDisplay(m.dateOfBirth),
      m.address,
      m.area,
      m.postalCode,
      m.city,
      m.country,
      m.submittedAt,
      m.activatedAt ?? '',
      m.validUntil ?? '',
      m.presentReceived ? 'yes' : 'no',
      m.presentReceivedAt ?? '',
      m.adminMember ? 'yes' : 'no',
      m.adminMemberAt ?? '',
      m.adminSendMicrosite ? 'yes' : 'no',
      m.adminSendMicrositeAt ?? '',
    ])
    downloadCsv(`members-report-${reportStamp()}.csv`, headers, rows)
  }

  function exportTicketsReport() {
    const headers = [
      'Request ID',
      'Match Key',
      'Full Name',
      'Mobile Phone',
      'Official MU ID',
      'Official MU Status',
      'Application ID',
      'User ID',
      'Status',
      'Requested At',
      'Deposit Confirmed',
      'Deposit Confirmed At',
      'User Cancelled',
      'User Cancelled At',
      'Balance Remaining EUR',
      'Balance Payment Notified',
      'Balance Payment Notified At',
      'Balance Payment Deadline',
      'Ticket Slots',
      'Travel Companions',
    ]
    const rows = pendingTicketRequests.map((r) => [
      r.id,
      r.matchKey,
      r.user.fullName ?? '',
      r.user.mobilePhone ?? '',
      r.user.officialMuMembershipId ?? '',
      formatOfficialMuMembershipStatus(r.user.officialMuMembershipStatus),
      r.user.applicationId ?? '',
      r.userId,
      r.status,
      r.requestedAt,
      r.depositConfirmed ? 'yes' : 'no',
      r.depositConfirmedAt ?? '',
      r.userCancelledAt ? 'yes' : 'no',
      r.userCancelledAt ?? '',
      r.balanceRemainingAmountEur != null ? r.balanceRemainingAmountEur.toFixed(2) : '',
      r.balancePaymentNotified ? 'yes' : 'no',
      r.balancePaymentNotifiedAt ?? '',
      r.balancePaymentDeadline ?? '',
      String(1 + r.travelCompanions.length),
      r.travelCompanions
        .map((c) => {
          const officialMu = `${formatOfficialMuMembershipId(c.officialMuMembershipId)}${
            c.officialMuMembershipStatus
              ? ` (${formatOfficialMuMembershipStatus(c.officialMuMembershipStatus)})`
              : ''
          }`
          return [
            formatMembershipNumber(c.membershipNumber),
            c.fullName ?? '',
            c.mobilePhone ?? '',
            c.email ?? '',
            officialMu,
          ].join(' / ')
        })
        .join(' | '),
    ])
    downloadCsv(`tickets-report-${reportStamp()}.csv`, headers, rows)
  }

  function exportMerchandiseReport() {
    const headers = ['Order ID', 'User ID', 'Status', 'Total EUR', 'Delivery Branch', 'Created At', 'Lines']
    const rows = merchandiseOrders.map((o) => [
      o.id,
      o.userId,
      o.status,
      o.totalEur.toFixed(2),
      o.deliveryBranch,
      o.createdAt,
      o.lines.map((line) => `${line.title} x${line.quantity} (€${line.unitPriceEur.toFixed(2)})`).join(' | '),
    ])
    downloadCsv(`merchandise-report-${reportStamp()}.csv`, headers, rows)
  }

  function exportOfficialMembershipsReport() {
    const headers = [
      'Request ID',
      'Status',
      'Requested At',
      'Offer',
      'Offer Price EUR',
      'User ID',
      'Name',
      'Email',
      'Mobile',
      'Date of Birth',
      'Address',
      'Area',
      'Postal Code',
      'City',
      'Country',
      'Official MU ID',
      'Official MU status',
      'Application Reference',
    ]
    const rows = officialRequests.map((r) => [
      r.id,
      r.status,
      r.requestedAt,
      r.offerTitle,
      r.offerPriceEur.toFixed(2),
      r.userId,
      r.user.fullName ?? '',
      r.user.email ?? '',
      r.user.mobilePhone ?? '',
      formatDateOfBirthDisplay(r.user.dateOfBirth ?? ''),
      r.user.address ?? '',
      r.user.area ?? '',
      r.user.postalCode ?? '',
      r.user.city ?? '',
      r.user.country ?? '',
      r.user.officialMuMembershipId ?? '',
      formatOfficialMuMembershipStatus(r.user.officialMuMembershipStatus),
      r.user.applicationId ?? '',
    ])
    downloadCsv(`official-memberships-report-${reportStamp()}.csv`, headers, rows)
  }

  function moveItem(ids: string[], from: number, to: number) {
    const next = [...ids]
    const [picked] = next.splice(from, 1)
    next.splice(to, 0, picked)
    return next
  }

  async function onPickAdminMerchPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    const next: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setAdminMerchError('Please choose image files only.')
        return
      }
      try {
        const dataUrl = await resizeImageFileToJpegDataUrl(file, { maxEdge: 1200, quality: 0.88 })
        next.push(dataUrl)
      } catch (e) {
        setAdminMerchError(e instanceof Error ? e.message : 'Could not process image.')
        return
      }
    }
    setAdminMerchPhotos((prev) => [...prev, ...next])
    setAdminMerchError(null)
  }

  async function onPickNewsImage(target: 'desktop' | 'mobile', file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNewsError('Please choose an image file.')
      return
    }
    try {
      const maxEdge = target === 'desktop' ? 1600 : 1350
      const dataUrl = await resizeImageFileToJpegDataUrl(file, { maxEdge, quality: 0.88 })
      if (target === 'desktop') setNewsImageUrl(dataUrl)
      else setNewsImageUrlMobile(dataUrl)
      setNewsError(null)
    } catch (e) {
      setNewsError(e instanceof Error ? e.message : 'Could not process image.')
    }
  }

  async function onPickNewsBodyPhotos(files: FileList | null) {
    if (!files?.length) return
    const next: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setNewsError('Please choose image files only.')
        return
      }
      try {
        next.push(await resizeImageFileToJpegDataUrl(file, { maxEdge: 1600, quality: 0.88 }))
      } catch (e) {
        setNewsError(e instanceof Error ? e.message : 'Could not process image.')
        return
      }
    }
    setNewsBodyPhotos((prev) => [...prev, ...next])
    setNewsError(null)
  }

  function addNewsBodyPhotoUrl() {
    const url = newsBodyPhotoUrlDraft.trim()
    if (!url) {
      setNewsError('Enter an image URL to add.')
      return
    }
    if (!isNewsImageSource(url)) {
      setNewsError('Enter a valid http(s) image URL.')
      return
    }
    if (newsBodyPhotos.includes(url)) {
      setNewsError('This image is already in the article photos list.')
      return
    }
    setNewsBodyPhotos((prev) => [...prev, url])
    setNewsBodyPhotoUrlDraft('')
    setNewsError(null)
  }

  function beginEditNews(post: NewsPost) {
    setEditingNewsId(post.id)
    setNewsTitle(post.title)
    setNewsBody(post.body)
    setNewsImageUrl(post.imageUrl ?? '')
    setNewsImageUrlMobile(post.imageUrlMobile ?? '')
    setNewsBodyPhotos(post.bodyPhotos ?? [])
    setNewsBodyPhotoUrlDraft('')
    setNewsError(null)
    requestAnimationFrame(() => {
      newsFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="section-page admin-page admin-layout">
      <header className="admin-hero">
        <p className="admin-hero-eyebrow">Control center</p>
        <h1 className="section-title admin-hero-title">Admin dashboard</h1>
        <p className="section-lead admin-page-lead">
          Manage members, tickets, news, and merchandise orders from one place.
        </p>
        <div className="admin-kpi-grid" role="list" aria-label="Admin summary">
          <div className="admin-kpi-card" role="listitem">
            <span className="admin-kpi-label">Pending members</span>
            <strong className="admin-kpi-value">{pendingMembersCount}</strong>
          </div>
          <div className="admin-kpi-card" role="listitem">
            <span className="admin-kpi-label">Active members</span>
            <strong className="admin-kpi-value">{activeMembersCount}</strong>
          </div>
          <div className="admin-kpi-card" role="listitem">
            <span className="admin-kpi-label">Pending ticket requests</span>
            <strong className="admin-kpi-value">
              {pendingTicketRequests.filter((request) => request.status === 'pending').length}
            </strong>
          </div>
          <div className="admin-kpi-card" role="listitem">
            <span className="admin-kpi-label">Pending merch orders</span>
            <strong className="admin-kpi-value">{pendingOrdersCount}</strong>
          </div>
        </div>
        <p className="admin-page-hint">
          Admin access is granted via <strong>Admin users</strong> above, or by setting{' '}
          <code className="admin-inline-code">profiles.is_admin</code> in the Neon database.
        </p>
      </header>

      <div className="admin-workspace">
        <aside className="admin-sidebar" aria-label="Admin sections">
          <div className="admin-main-tabs" role="tablist" aria-label="Admin sections">
            <button
              type="button"
              role="tab"
              aria-selected={adminTab === 'members'}
              className={`admin-main-tab ${adminTab === 'members' ? 'is-active' : ''}`}
              onClick={() => setAdminTab('members')}
            >
              Members
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={adminTab === 'tickets'}
              className={`admin-main-tab ${adminTab === 'tickets' ? 'is-active' : ''}`}
              onClick={() => setAdminTab('tickets')}
            >
              Tickets
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={adminTab === 'ticketRequests'}
              className={`admin-main-tab ${adminTab === 'ticketRequests' ? 'is-active' : ''}`}
              onClick={() => {
                setAdminTab('ticketRequests')
                setTicketRequestsRefreshing(true)
                void onRefreshTicketRequests().finally(() => setTicketRequestsRefreshing(false))
              }}
            >
              Ticket requests
              {pendingTicketRequests.filter((r) => r.status === 'pending').length > 0 && (
                <span className="admin-tab-badge">
                  {pendingTicketRequests.filter((r) => r.status === 'pending').length}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={adminTab === 'news'}
              className={`admin-main-tab ${adminTab === 'news' ? 'is-active' : ''}`}
              onClick={() => setAdminTab('news')}
            >
              News
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={adminTab === 'merch'}
              className={`admin-main-tab ${adminTab === 'merch' ? 'is-active' : ''}`}
              onClick={() => setAdminTab('merch')}
            >
              Merchandise orders
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={adminTab === 'official'}
              className={`admin-main-tab ${adminTab === 'official' ? 'is-active' : ''}`}
              onClick={() => setAdminTab('official')}
            >
              Official memberships
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={adminTab === 'email'}
              className={`admin-main-tab ${adminTab === 'email' ? 'is-active' : ''}`}
              onClick={() => setAdminTab('email')}
            >
              Email
            </button>
          </div>
        </aside>

        <div className="admin-content">
      {adminTab === 'members' && (
        <>
      <section className="admin-panel-block" aria-label="Admin users">
        <div className="admin-block-head">
          <h2 className="admin-block-title">Admin users</h2>
          <p className="admin-block-lead">Add admin accounts by email. User must sign in at least once first.</p>
        </div>
        <div className="admin-merch-create-row">
          <input
            className="admin-merch-create-input"
            type="email"
            placeholder="admin@example.com"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            disabled={adminUsersBusy}
          />
          <button
            type="button"
            className="admin-merch-create-btn"
            disabled={adminUsersBusy}
            onClick={async () => {
              const email = newAdminEmail.trim()
              if (!email) return
              setAdminUsersBusy(true)
              try {
                await onCreateAdminUser(email)
                setNewAdminEmail('')
              } finally {
                setAdminUsersBusy(false)
              }
            }}
          >
            {adminUsersBusy ? 'Saving…' : 'Add admin'}
          </button>
        </div>
        {adminUsersLoading ? (
          <p className="admin-empty">Loading admin users…</p>
        ) : adminUsers.length === 0 ? (
          <p className="admin-empty">No admin users configured yet.</p>
        ) : (
          <ul className="admin-ticket-request-list">
            {adminUsers.map((row) => (
              <li key={row.email} className="admin-ticket-request-card">
                <div className="admin-ticket-request-main">
                  <strong>{row.email}</strong>
                  <small>Added: {new Date(row.createdAt).toLocaleString('en-GB')}</small>
                </div>
                <div className="admin-ticket-request-actions">
                  <button
                    type="button"
                    className="admin-news-delete-btn"
                    disabled={adminUsersBusy}
                    onClick={async () => {
                      setAdminUsersBusy(true)
                      try {
                        await onDeleteAdminUser(row.email)
                      } finally {
                        setAdminUsersBusy(false)
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {pendingRenewals.length > 0 && (
        <section className="admin-renewals-block admin-panel-block" aria-label="Pending membership renewals">
          <h2 className="admin-renewals-heading">Pending membership renewals</h2>
          <p className="admin-renewals-lead">
            These members submitted a renewal for the next season. After you confirm their payment, use{' '}
            <strong>Confirm renewal</strong> to extend their &quot;Activated until&quot; date by one club year.
          </p>
          <ul className="admin-renewal-list">
            {pendingRenewals.map((r) => (
              <li key={r.id} className="admin-renewal-card">
                <div className="admin-renewal-card-main">
                  <code className="admin-member-ref">{r.application_id}</code>
                  <p className="admin-renewal-name">
                    {r.membership_applications?.first_name ?? '—'} {r.membership_applications?.last_name ?? ''}
                  </p>
                  <p className="admin-renewal-meta">
                    Submitted: {new Date(r.submitted_at).toLocaleString('en-GB')}
                  </p>
                </div>
                <button
                  type="button"
                  className="board-admin-activate"
                  disabled={busyRenewalId !== null}
                  onClick={async () => {
                    setBusyRenewalId(r.id)
                    try {
                      await onCompleteRenewal(r)
                    } finally {
                      setBusyRenewalId(null)
                    }
                  }}
                >
                  {busyRenewalId === r.id ? 'Updating…' : 'Confirm renewal'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="admin-filter-row" role="tablist" aria-label="Filter by status">
        {(['all', 'pending', 'active'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={`admin-filter-btn ${filter === f ? 'is-active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Active'}
          </button>
        ))}
      </div>
      <div className="admin-search-row">
        <input
          className="auth-input admin-search-input"
          type="search"
          placeholder="Search members by name, application ID, phone, or MU ID"
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
        />
        <button type="button" className="admin-merch-create-btn" onClick={exportMembersReport}>
          Export Excel
        </button>
        <button
          type="button"
          className="admin-merch-create-btn"
          disabled={filtered.length === 0}
          onClick={() => {
            const next: Record<string, boolean> = {}
            for (const member of filtered) next[member.applicationId] = true
            setSelectedMemberApplicationIds(next)
          }}
        >
          Select all in view
        </button>
        <button
          type="button"
          className="admin-merch-create-btn"
          disabled={selectedMemberCount === 0}
          onClick={() => setSelectedMemberApplicationIds({})}
        >
          Clear selection
        </button>
        <button
          type="button"
          className="admin-merch-create-btn"
          disabled={selectedMemberCount === 0}
          onClick={() => {
            const members = memberRegistry.filter((member) => selectedMemberApplicationIds[member.applicationId])
            openMemberEmailCompose(members)
          }}
        >
          Email selected ({selectedMemberCount})
        </button>
      </div>
      {memberActionNotice && <p className="admin-member-action-notice">{memberActionNotice}</p>}
      {memberActionError && <p className="admin-empty" style={{ color: '#b91c1c' }}>{memberActionError}</p>}

      {loading ? (
        <p className="admin-empty">Loading members…</p>
      ) : filtered.length === 0 ? (
        <p className="admin-empty">No applications in this view.</p>
      ) : (
        <ul className="admin-member-list">
          {filtered.map((m) => (
            <li key={m.applicationId} className="admin-member-card">
              <div className="admin-member-card-top">
                <label className="admin-member-select">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedMemberApplicationIds[m.applicationId])}
                    aria-label={`Select ${m.firstName} ${m.lastName}`}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setSelectedMemberApplicationIds((prev) => ({
                        ...prev,
                        [m.applicationId]: checked,
                      }))
                    }}
                  />
                </label>
                <div>
                  <code className="admin-member-ref">{m.applicationId}</code>
                  <p className="admin-member-name">
                    {m.firstName} {m.lastName}
                    {m.sponsorApplicationId && (
                      <span className="admin-member-family-badge"> · Family member</span>
                    )}
                  </p>
                  {m.sponsorApplicationId && (
                    <p className="admin-member-meta">
                      {formatFamilyRelationship(m.familyRelationship, m.familyRelationshipOther)}
                      {' · '}
                      Sponsor ref: <code className="admin-inline-code">{m.sponsorApplicationId}</code>
                    </p>
                  )}
                  <p className="admin-member-meta">
                    {m.city}, {m.country} · {m.mobilePhone}
                    {m.email ? ` · ${m.email}` : ' · No email on file'}
                    {m.status === 'active' && m.membershipNumber != null && (
                      <> · Member #{formatMembershipNumber(m.membershipNumber)}</>
                    )}
                  </p>
                  <p className="admin-member-meta admin-member-official-request">
                    {formatOfficialMembershipRequestLabel(m.officialMembershipOfferTitle)}
                  </p>
                  {m.status === 'active' && m.activationEmailStatus && (
                    <p
                      className={`admin-member-meta admin-member-email-status admin-member-email-status--${m.activationEmailStatus}`}
                    >
                      {formatActivationEmailStatus(m)}
                    </p>
                  )}
                </div>
                <span
                  className={`board-admin-status board-admin-status--${m.status === 'pending' ? 'pending' : 'active'}`}
                >
                  {m.status === 'pending' ? 'Pending' : 'Activated'}
                </span>
              </div>
              <p className="admin-member-submitted">
                Submitted: {new Date(m.submittedAt).toLocaleString('en-GB')}
                {m.activatedAt && (
                  <> · Activated: {new Date(m.activatedAt).toLocaleString('en-GB')}</>
                )}
              </p>
              {m.status === 'active' && (
                <div className="admin-member-flag-row">
                  <label className="admin-present-received">
                    <input
                      type="checkbox"
                      checked={m.presentReceived}
                      disabled={busyId !== null || presentReceivedSubmitting}
                      onChange={async (e) => {
                        setMemberActionError(null)
                        const checked = e.target.checked
                        if (checked) {
                          setPresentReceivedError(null)
                          setPresentReceivedTarget(m)
                          return
                        }
                        setBusyId(m.applicationId)
                        try {
                          await onUpdatePresentReceived(m.applicationId, false)
                        } catch (error) {
                          setMemberActionError(
                            error instanceof Error ? error.message : 'Could not update present status.',
                          )
                        } finally {
                          setBusyId(null)
                        }
                      }}
                    />
                    Present received
                    {m.presentReceivedAt && (
                      <span className="admin-present-received-at">
                        · {new Date(m.presentReceivedAt).toLocaleString('en-GB')}
                      </span>
                    )}
                  </label>
                  <label className="admin-present-received">
                    <input
                      type="checkbox"
                      checked={m.adminMember}
                      disabled={busyId !== null || purchasedMembershipSubmitting}
                      onChange={async (e) => {
                        setMemberActionError(null)
                        const checked = e.target.checked
                        if (checked) {
                          setPurchasedMembershipError(null)
                          setPurchasedMembershipTarget(m)
                          return
                        }
                        setBusyId(m.applicationId)
                        try {
                          await onUpdateAdminMemberFlags(m.applicationId, { member: false })
                        } catch (error) {
                          setMemberActionError(
                            error instanceof Error ? error.message : 'Could not update purchased membership.',
                          )
                        } finally {
                          setBusyId(null)
                        }
                      }}
                    />
                    Purchased Membership
                    {m.adminMemberAt && (
                      <span className="admin-present-received-at">
                        · {new Date(m.adminMemberAt).toLocaleString('en-GB')}
                      </span>
                    )}
                  </label>
                  <label className="admin-present-received">
                    <input
                      type="checkbox"
                      checked={m.adminSendMicrosite}
                      disabled={busyId !== null}
                      onChange={async (e) => {
                        setMemberActionError(null)
                        setBusyId(m.applicationId)
                        try {
                          await onUpdateAdminMemberFlags(m.applicationId, { sendMicrosite: e.target.checked })
                        } catch (error) {
                          setMemberActionError(
                            error instanceof Error ? error.message : 'Could not update microsite registration.',
                          )
                        } finally {
                          setBusyId(null)
                        }
                      }}
                    />
                    Registered to Microsite
                    {m.adminSendMicrositeAt && (
                      <span className="admin-present-received-at">
                        · {new Date(m.adminSendMicrositeAt).toLocaleString('en-GB')}
                      </span>
                    )}
                  </label>
                </div>
              )}
              <div className="admin-member-actions">
                {m.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      className="board-admin-activate"
                      disabled={busyId !== null}
                      onClick={async () => {
                        setMemberActionError(null)
                        setMemberActionNotice(null)
                        setBusyId(m.applicationId)
                        try {
                          const notice = await onActivate(m.applicationId)
                          if (notice) setMemberActionNotice(notice)
                        } catch (error) {
                          setMemberActionError(
                            error instanceof Error ? error.message : 'Could not activate membership.',
                          )
                        } finally {
                          setBusyId(null)
                        }
                      }}
                    >
                      {busyId === m.applicationId ? 'Updating…' : 'Activate membership'}
                    </button>
                    <button
                      type="button"
                      className="admin-payment-reminder-btn"
                      disabled={busyId !== null || paymentReminderSubmitting}
                      onClick={() => {
                        setPaymentReminderError(null)
                        setPaymentReminderTarget(m)
                      }}
                    >
                      Payment Reminder
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="admin-revoke-btn"
                    disabled={busyId !== null}
                    onClick={async () => {
                      setBusyId(m.applicationId)
                      try {
                        await onSetPending(m.applicationId)
                      } finally {
                        setBusyId(null)
                      }
                    }}
                  >
                    {busyId === m.applicationId ? 'Updating…' : 'Set back to pending'}
                  </button>
                )}
                <button
                  type="button"
                  className="admin-details-btn"
                  onClick={() => setExpandedId((id) => (id === m.applicationId ? null : m.applicationId))}
                >
                  {expandedId === m.applicationId ? 'Hide details' : 'Full details'}
                </button>
                <button
                  type="button"
                  className="admin-payment-reminder-btn"
                  disabled={busyId !== null || memberEmailSubmitting}
                  onClick={() => openMemberEmailCompose([m])}
                >
                  Email
                </button>
                <button
                  type="button"
                  className="admin-news-delete-btn"
                  disabled={busyId !== null}
                  onClick={async () => {
                    const yes = window.confirm(
                      `Delete membership request ${m.applicationId}? This cannot be undone.`,
                    )
                    if (!yes) return
                    setMemberActionError(null)
                    setBusyId(m.applicationId)
                    try {
                      await onDeleteMemberRequest(m.applicationId)
                    } catch (error) {
                      setMemberActionError(error instanceof Error ? error.message : 'Could not delete request.')
                    } finally {
                      setBusyId(null)
                    }
                  }}
                >
                  {busyId === m.applicationId ? 'Deleting…' : 'Delete request'}
                </button>
              </div>
              {expandedId === m.applicationId && (
                <dl className="admin-member-dl">
                  {m.status === 'active' && (
                    <>
                      <div>
                        <dt>Membership number</dt>
                        <dd>
                          <div className="admin-merch-create-row">
                            <input
                              className="admin-merch-create-input"
                              type="number"
                              min={1}
                              step={1}
                              placeholder="Membership number"
                              value={
                                membershipNumberDraftByApplicationId[m.applicationId] ??
                                (m.membershipNumber != null ? String(m.membershipNumber) : '')
                              }
                              onChange={(e) =>
                                setMembershipNumberDraftByApplicationId((prev) => ({
                                  ...prev,
                                  [m.applicationId]: e.target.value,
                                }))
                              }
                              disabled={busyId !== null}
                            />
                            <button
                              type="button"
                              className="admin-merch-create-btn"
                              disabled={busyId !== null}
                              onClick={async () => {
                                setMemberActionError(null)
                                setBusyId(m.applicationId)
                                try {
                                  const raw =
                                    membershipNumberDraftByApplicationId[m.applicationId] ??
                                    (m.membershipNumber != null ? String(m.membershipNumber) : '')
                                  const trimmed = raw.trim()
                                  if (!trimmed) {
                                    await onUpdateMembershipNumber(m.applicationId, null)
                                  } else {
                                    const parsed = Number(trimmed)
                                    if (!Number.isInteger(parsed) || parsed < 1) {
                                      throw new Error('Membership number must be a positive integer.')
                                    }
                                    await onUpdateMembershipNumber(m.applicationId, parsed)
                                  }
                                } catch (error) {
                                  setMemberActionError(
                                    error instanceof Error ? error.message : 'Could not update membership number.',
                                  )
                                } finally {
                                  setBusyId(null)
                                }
                              }}
                            >
                              {busyId === m.applicationId ? 'Saving…' : 'Save number'}
                            </button>
                          </div>
                        </dd>
                      </div>
                      <div>
                        <dt>Valid until</dt>
                        <dd>
                          {m.validUntil?.trim()
                            ? formatValidUntilLabel(m.validUntil.trim())
                            : formatValidUntilLabel(defaultMembershipValidUntilIso())}
                        </dd>
                      </div>
                    </>
                  )}
                  {m.sponsorApplicationId && (
                    <div>
                      <dt>Family relationship</dt>
                      <dd>{formatFamilyRelationship(m.familyRelationship, m.familyRelationshipOther)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Date of birth</dt>
                    <dd>{formatDateOfBirthDisplay(m.dateOfBirth) || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{m.email ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{m.address}</dd>
                  </div>
                  <div>
                    <dt>Area</dt>
                    <dd>{m.area}</dd>
                  </div>
                  <div>
                    <dt>Postal code</dt>
                    <dd>{m.postalCode}</dd>
                  </div>
                  <div>
                    <dt>Official MU package request</dt>
                    <dd>{formatOfficialMembershipRequestLabel(m.officialMembershipOfferTitle)}</dd>
                  </div>
                  <div>
                    <dt>Official MU membership</dt>
                    <dd>
                      <div className="admin-official-mu-edit">
                        <label className="auth-field membership-field">
                          <span className="auth-label">Membership number</span>
                          <input
                            className="admin-merch-create-input"
                            type="text"
                            placeholder="Official member ID"
                            value={memberIdDraftByApplicationId[m.applicationId] ?? m.officialMuMembershipId ?? ''}
                            onChange={(e) =>
                              setMemberIdDraftByApplicationId((prev) => ({
                                ...prev,
                                [m.applicationId]: e.target.value,
                              }))
                            }
                            disabled={busyId !== null}
                          />
                        </label>
                        <label className="auth-field membership-field">
                          <span className="auth-label">Status</span>
                          <select
                            className="auth-input"
                            value={
                              memberMuStatusDraftByApplicationId[m.applicationId] ??
                              m.officialMuMembershipStatus ??
                              ''
                            }
                            onChange={(e) =>
                              setMemberMuStatusDraftByApplicationId((prev) => ({
                                ...prev,
                                [m.applicationId]: e.target.value as OfficialMuMembershipFormStatus,
                              }))
                            }
                            disabled={busyId !== null}
                          >
                            <option value="">Not set</option>
                            <option value="pending">Pending</option>
                            <option value="activated">Activated</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="admin-merch-create-btn"
                          disabled={busyId !== null}
                          onClick={async () => {
                            setMemberActionError(null)
                            setBusyId(m.applicationId)
                            try {
                              const memberId = (
                                memberIdDraftByApplicationId[m.applicationId] ?? m.officialMuMembershipId ?? ''
                              ).trim()
                              const statusDraft = memberMuStatusDraftByApplicationId[m.applicationId]
                              const muStatus: OfficialMuMembershipStatus | null =
                                statusDraft === 'activated' || statusDraft === 'pending'
                                  ? statusDraft
                                  : statusDraft === ''
                                    ? null
                                    : m.officialMuMembershipStatus
                              const parsed = parseOfficialMuMembershipFields(memberId, muStatus ?? '')
                              if ('error' in parsed) {
                                setMemberActionError(parsed.error)
                                return
                              }
                              await onUpdateMemberId(
                                m.applicationId,
                                parsed.officialMuMembershipId,
                                parsed.officialMuMembershipStatus,
                              )
                            } catch (error) {
                              setMemberActionError(
                                error instanceof Error ? error.message : 'Could not update official MU membership.',
                              )
                            } finally {
                              setBusyId(null)
                            }
                          }}
                        >
                          {busyId === m.applicationId ? 'Saving…' : 'Save official MU'}
                        </button>
                      </div>
                    </dd>
                  </div>
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
        </>
      )}

      {adminTab === 'tickets' && (
        <section className="admin-panel-block" aria-label="Match ticket availability">
          <div className="admin-block-head">
            <h2 className="admin-block-title">Match ticket availability</h2>
            <p className="admin-block-lead">Open, close, or disable ticket requests for each home fixture.</p>
            <button type="button" className="fixtures-refresh-btn" onClick={() => void onSyncFixtures()} disabled={fixturesSyncing}>
              {fixturesSyncing ? 'Refreshing…' : 'Sync fixtures from manutd.com'}
            </button>
          </div>
          {ticketMaxTicketsError && <p className="admin-empty" style={{ color: '#b91c1c' }}>{ticketMaxTicketsError}</p>}
          {ticketFixtures.length === 0 ? (
            <p className="admin-empty">No upcoming home fixtures right now.</p>
          ) : (
            <ul className="fixtures-list">
              {ticketFixtures.map((fixture) => {
                const key = fixtureMatchKey(fixture)
                const status = ticketWindowByKey[key] ?? 'disabled'
                const windowDetails = ticketWindowDetailsByKey[key]
                const maxTickets = windowDetails?.maxTickets ?? null
                const activeRequestCount = windowDetails?.activeRequestCount ?? 0
                const maxTicketsDraft =
                  maxTicketsDraftByMatchKey[key] ?? (maxTickets != null ? String(maxTickets) : '')
                const parsedMaxTickets = parseMaxTicketsDraft(maxTicketsDraft)
                const maxTicketsDraftInvalid = maxTicketsDraft.trim() !== '' && parsedMaxTickets == null
                const atCapacity = maxTickets != null && activeRequestCount >= maxTickets
                const busy = busyTicketWindowKey === key
                return (
                  <li key={key} className="fixtures-card">
                    <div className="fixtures-card-main">
                      <div className="fixtures-card-left">
                        <p className="fixtures-kickoff">{formatFixtureKickoff(fixture.kickoffIso)}</p>
                        <p className="fixtures-opponent">
                          {fixture.home ? 'Manchester United vs ' : ''}
                          {!fixture.home ? `${fixture.opponent} vs Manchester United` : fixture.opponent}
                        </p>
                        <p className="fixtures-meta">
                          {fixture.competition} · {fixture.venue}
                        </p>
                      </div>
                      <div className="fixtures-card-right">
                        <div className="fixtures-admin-controls">
                          <span className={`fixtures-ticket-pill fixtures-ticket-pill--${status}`}>
                            {status === 'open' ? 'Tickets open' : status === 'closed' ? 'Request closed' : 'Tickets disabled'}
                          </span>
                          {maxTickets != null && (
                            <p className={`admin-ticket-capacity-summary${atCapacity ? ' is-full' : ''}`}>
                              {activeRequestCount} / {maxTickets} tickets
                              {atCapacity ? ' · Full' : ''}
                            </p>
                          )}
                          <label className="admin-ticket-capacity-field">
                            <span className="auth-label">Max tickets</span>
                            <div className="admin-ticket-capacity-input-row">
                              <input
                                className="admin-merch-create-input admin-ticket-capacity-input"
                                type="number"
                                min="1"
                                step="1"
                                placeholder="No limit"
                                value={maxTicketsDraft}
                                onChange={(e) =>
                                  setMaxTicketsDraftByMatchKey((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                disabled={busy}
                              />
                              <button
                                type="button"
                                className="admin-merch-create-btn admin-ticket-capacity-save"
                                disabled={busy || maxTicketsDraftInvalid}
                                onClick={async () => {
                                  setTicketMaxTicketsError(null)
                                  setBusyTicketWindowKey(key)
                                  try {
                                    await onUpdateFixtureTicketMaxTickets(fixture, parsedMaxTickets)
                                    setMaxTicketsDraftByMatchKey((prev) => ({
                                      ...prev,
                                      [key]: parsedMaxTickets != null ? String(parsedMaxTickets) : '',
                                    }))
                                  } catch (error) {
                                    setTicketMaxTicketsError(
                                      error instanceof Error ? error.message : 'Could not save ticket limit.',
                                    )
                                  } finally {
                                    setBusyTicketWindowKey(null)
                                  }
                                }}
                              >
                                {busy ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </label>
                          <div className="fixtures-admin-btn-row">
                            {(['open', 'closed', 'disabled'] as const).map((nextStatus) => (
                              <button
                                key={nextStatus}
                                type="button"
                                className={`fixtures-admin-btn ${status === nextStatus ? 'is-active' : ''}`}
                                disabled={busy}
                                onClick={async () => {
                                  setBusyTicketWindowKey(key)
                                  try {
                                    await onSetFixtureTicketStatus(fixture, nextStatus)
                                  } finally {
                                    setBusyTicketWindowKey(null)
                                  }
                                }}
                              >
                                {nextStatus === 'open' ? 'Open' : nextStatus === 'closed' ? 'Close' : 'Disable'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {adminTab === 'ticketRequests' && (
        <section className="admin-ticket-requests-block admin-panel-block" aria-label="Ticket requests">
          <div className="admin-block-head">
            <h2 className="admin-block-title">Ticket requests</h2>
            <p className="admin-block-lead">
              Member match ticket requests appear here when they click Request on an open fixture.
            </p>
            <button
              type="button"
              className="admin-merch-create-btn"
              onClick={() => {
                setTicketRequestsRefreshing(true)
                void onRefreshTicketRequests().finally(() => setTicketRequestsRefreshing(false))
              }}
              disabled={ticketRequestsRefreshing}
            >
              {ticketRequestsRefreshing ? 'Refreshing…' : 'Refresh list'}
            </button>
            <button type="button" className="admin-merch-create-btn" onClick={exportTicketsReport}>
              Export Excel
            </button>
          </div>
          <div className="admin-ticket-request-filters">
            <div className="admin-ticket-filter-group">
              <span className="admin-ticket-filter-label">Status</span>
              <div className="admin-ticket-status-tabs" role="tablist" aria-label="Filter ticket requests by status">
                {(['pending', 'approved', 'completed', 'cancelled'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={ticketFilter === f}
                    className={`admin-ticket-status-tab ${ticketFilter === f ? 'is-active' : ''}`}
                    onClick={() => setTicketFilter(f)}
                  >
                    {f === 'pending'
                      ? 'Pending'
                      : f === 'approved'
                        ? 'Accepted'
                        : f === 'completed'
                          ? 'Completed'
                          : 'Cancelled'}
                  </button>
                ))}
              </div>
            </div>
            {ticketMatchTabKeys.length > 0 && (
              <div className="admin-ticket-filter-group">
                <span className="admin-ticket-filter-label">Match</span>
                <div className="admin-ticket-match-tabs" role="tablist" aria-label="Filter ticket requests by match">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={ticketMatchFilter === 'all'}
                    className={`admin-ticket-match-tab ${ticketMatchFilter === 'all' ? 'is-active' : ''}`}
                    onClick={() => setTicketMatchFilter('all')}
                  >
                    All matches
                  </button>
                  {ticketMatchTabKeys.map((matchKey) => (
                    <button
                      key={matchKey}
                      type="button"
                      role="tab"
                      aria-selected={ticketMatchFilter === matchKey}
                      className={`admin-ticket-match-tab ${ticketMatchFilter === matchKey ? 'is-active' : ''}`}
                      onClick={() => setTicketMatchFilter(matchKey)}
                    >
                      {formatTicketMatchTabLabel(matchKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {ticketActionNotice && <p className="admin-member-action-notice">{ticketActionNotice}</p>}
          {ticketActionError && <p className="admin-empty" style={{ color: '#b91c1c' }}>{ticketActionError}</p>}
          {filteredTicketRequests.length === 0 ? (
            <p className="admin-empty">
              No{' '}
              {ticketFilter === 'approved'
                ? 'accepted'
                : ticketFilter === 'cancelled'
                  ? 'cancelled'
                  : ticketFilter}{' '}
              ticket requests
              {ticketMatchFilter !== 'all' ? ` for ${formatTicketMatchTabLabel(ticketMatchFilter)}` : ''}.
            </p>
          ) : (
            <ul className="admin-ticket-request-list">
              {filteredTicketRequests.map((r) => {
                const amountDraft =
                  balanceAmountDraftByRequestId[r.id] ??
                  (r.balanceRemainingAmountEur != null ? String(r.balanceRemainingAmountEur) : '')
                const deadlineDraft =
                  balanceDeadlineDraftByRequestId[r.id] ??
                  formatTicketBalancePaymentDeadlineForInput(r.balancePaymentDeadline)
                const amountEur = parseTicketBalanceAmountDraft(amountDraft)
                const paymentDeadline = parseTicketPaymentDeadlineDraft(deadlineDraft)
                const canNotifyBalancePayment = amountEur != null && paymentDeadline != null

                return (
                <li key={r.id} className="admin-ticket-request-card">
                  <div className="admin-ticket-request-main">
                    <p className="admin-renewal-name">{r.user.fullName ?? 'Unknown member'}</p>
                    <p className="admin-member-meta">
                      <strong>{formatFixtureMatchKeyLabel(r.matchKey)}</strong>
                    </p>
                    <code className="admin-member-ref">{r.matchKey}</code>
                    <p className="admin-member-meta">
                      Phone: {r.user.mobilePhone ?? '—'}
                      {' · '}
                      Official MU: {formatOfficialMuMembershipId(r.user.officialMuMembershipId)}
                      {r.user.officialMuMembershipStatus
                        ? ` (${formatOfficialMuMembershipStatus(r.user.officialMuMembershipStatus)})`
                        : ''}
                    </p>
                    {r.user.applicationId && (
                      <p className="admin-member-meta">
                        Ref: <code className="admin-inline-code">{r.user.applicationId}</code>
                      </p>
                    )}
                    <p className="admin-renewal-meta">
                      Requested: {new Date(r.requestedAt).toLocaleString('en-GB')}
                      {' · '}
                      Ticket slots: {1 + r.travelCompanions.length}
                    </p>
                    {r.travelCompanions.length > 0 ? (
                      <div className="admin-ticket-travel-with">
                        <p className="auth-label">Travel with</p>
                        <table className="admin-ticket-travel-with-table">
                          <thead>
                            <tr>
                              <th scope="col">MYCS</th>
                              <th scope="col">Name</th>
                              <th scope="col">Phone</th>
                              <th scope="col">Email</th>
                              <th scope="col">Official MU</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.travelCompanions.map((companion) => (
                              <tr key={`${r.id}-${companion.membershipNumber}`}>
                                <td>{formatMembershipNumber(companion.membershipNumber)}</td>
                                <td>{companion.fullName ?? '—'}</td>
                                <td>{companion.mobilePhone ?? '—'}</td>
                                <td>{companion.email ?? '—'}</td>
                                <td>
                                  {formatOfficialMuMembershipId(companion.officialMuMembershipId)}
                                  {companion.officialMuMembershipStatus
                                    ? ` (${formatOfficialMuMembershipStatus(companion.officialMuMembershipStatus)})`
                                    : ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="admin-ticket-travel-with">
                        <p className="auth-label">Member</p>
                        <table className="admin-ticket-travel-with-table">
                          <thead>
                            <tr>
                              <th scope="col">MYCS</th>
                              <th scope="col">Name</th>
                              <th scope="col">Phone</th>
                              <th scope="col">Email</th>
                              <th scope="col">Official MU</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>
                                {r.user.membershipNumber != null
                                  ? formatMembershipNumber(r.user.membershipNumber)
                                  : '—'}
                              </td>
                              <td>{r.user.fullName ?? '—'}</td>
                              <td>{r.user.mobilePhone ?? '—'}</td>
                              <td>{r.user.email ?? '—'}</td>
                              <td>
                                {formatOfficialMuMembershipId(r.user.officialMuMembershipId)}
                                {r.user.officialMuMembershipStatus
                                  ? ` (${formatOfficialMuMembershipStatus(r.user.officialMuMembershipStatus)})`
                                  : ''}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                    <span className={`fixtures-ticket-pill fixtures-ticket-pill--${r.status}`}>
                      {r.status === 'approved' ? 'Accepted' : r.status[0].toUpperCase() + r.status.slice(1)}
                    </span>
                    {r.userCancelledAt && (
                      <span className="fixtures-ticket-pill fixtures-ticket-pill--user-cancelled">
                        User cancelled request
                        <span className="admin-present-received-at">
                          · {new Date(r.userCancelledAt).toLocaleString('en-GB')}
                        </span>
                      </span>
                    )}
                    <label className="admin-present-received admin-ticket-deposit-confirm">
                      <input
                        type="checkbox"
                        checked={r.depositConfirmed}
                        disabled={busyTicketRequestId !== null || ticketDepositConfirmSubmitting}
                        onChange={async (e) => {
                          setTicketActionError(null)
                          setTicketActionNotice(null)
                          const checked = e.target.checked
                          if (checked) {
                            setTicketDepositConfirmError(null)
                            setTicketDepositConfirmTarget(r)
                            return
                          }
                          setBusyTicketRequestId(r.id)
                          try {
                            await onUpdateTicketDepositConfirmed(r.id, false)
                          } catch (error) {
                            setTicketActionError(
                              error instanceof Error ? error.message : 'Could not update deposit confirmation.',
                            )
                          } finally {
                            setBusyTicketRequestId(null)
                          }
                        }}
                      />
                      Deposit confirmation
                      {r.depositConfirmedAt && (
                        <span className="admin-present-received-at">
                          · {new Date(r.depositConfirmedAt).toLocaleString('en-GB')}
                        </span>
                      )}
                    </label>
                    <div className="admin-ticket-balance-payment">
                      <label className="admin-ticket-balance-payment-field">
                        <span className="auth-label">Ticket payment (remaining €)</span>
                        <div className="admin-ticket-balance-payment-input-wrap">
                          <span className="admin-ticket-balance-payment-currency" aria-hidden="true">
                            €
                          </span>
                          <input
                            className="admin-merch-create-input admin-ticket-balance-payment-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={
                              balanceAmountDraftByRequestId[r.id] ??
                              (r.balanceRemainingAmountEur != null ? String(r.balanceRemainingAmountEur) : '')
                            }
                            onChange={(e) =>
                              setBalanceAmountDraftByRequestId((prev) => ({
                                ...prev,
                                [r.id]: e.target.value,
                              }))
                            }
                            disabled={
                              r.balancePaymentNotified ||
                              busyTicketRequestId !== null ||
                              ticketBalancePaymentSubmitting
                            }
                          />
                        </div>
                      </label>
                      <label className="admin-ticket-balance-payment-field">
                        <span className="auth-label">Payment deadline</span>
                        <input
                          className="admin-merch-create-input admin-ticket-balance-payment-date"
                          type="text"
                          inputMode="numeric"
                          placeholder="dd/mm/yyyy"
                          autoComplete="off"
                          value={deadlineDraft}
                          onChange={(e) =>
                            setBalanceDeadlineDraftByRequestId((prev) => ({
                              ...prev,
                              [r.id]: e.target.value,
                            }))
                          }
                          disabled={
                            r.balancePaymentNotified ||
                            busyTicketRequestId !== null ||
                            ticketBalancePaymentSubmitting
                          }
                        />
                      </label>
                      <label className="admin-present-received admin-ticket-deposit-confirm">
                        <input
                          type="checkbox"
                          checked={r.balancePaymentNotified}
                          disabled={
                            busyTicketRequestId !== null ||
                            ticketBalancePaymentSubmitting ||
                            (!r.balancePaymentNotified && !canNotifyBalancePayment)
                          }
                          onChange={async (e) => {
                            setTicketActionError(null)
                            setTicketActionNotice(null)
                            const checked = e.target.checked
                            if (checked) {
                              if (amountEur == null || paymentDeadline == null) return
                              setTicketBalancePaymentError(null)
                              setTicketBalancePaymentTarget({
                                request: r,
                                amountEur,
                                paymentDeadline,
                              })
                              return
                            }
                            setBusyTicketRequestId(r.id)
                            try {
                              await onUpdateTicketBalancePayment(r.id, {
                                balanceRemainingAmountEur: amountEur ?? r.balanceRemainingAmountEur ?? 0,
                                balancePaymentDeadline:
                                  paymentDeadline ??
                                  formatTicketBalancePaymentDeadlineForInput(r.balancePaymentDeadline),
                                balancePaymentNotified: false,
                              })
                            } catch (error) {
                              setTicketActionError(
                                error instanceof Error ? error.message : 'Could not update ticket payment.',
                              )
                            } finally {
                              setBusyTicketRequestId(null)
                            }
                          }}
                        />
                        Ticket payment
                        {r.balancePaymentNotifiedAt && (
                          <span className="admin-present-received-at">
                            · {new Date(r.balancePaymentNotifiedAt).toLocaleString('en-GB')}
                            {r.balanceRemainingAmountEur != null
                              ? ` · €${r.balanceRemainingAmountEur.toFixed(2)}`
                              : ''}
                            {r.balancePaymentDeadline
                              ? ` · deadline ${new Date(r.balancePaymentDeadline).toLocaleDateString('en-GB')}`
                              : ''}
                          </span>
                        )}
                      </label>
                      {r.balancePaymentNotified && !r.ticketConfirmed && (
                        <button
                          type="button"
                          className="admin-revoke-btn admin-ticket-confirm-btn"
                          disabled={
                            busyTicketRequestId !== null ||
                            ticketBalancePaymentSubmitting ||
                            ticketConfirmSubmitting
                          }
                          onClick={() => {
                            setTicketActionError(null)
                            setTicketActionNotice(null)
                            setTicketConfirmError(null)
                            setTicketConfirmTarget(r)
                          }}
                        >
                          Confirm tickets
                        </button>
                      )}
                      {r.ticketConfirmed && (
                        <p className="admin-ticket-confirmed-note">
                          Ticket confirmed
                          {r.ticketConfirmedAt && (
                            <span className="admin-present-received-at">
                              {' '}
                              · {new Date(r.ticketConfirmedAt).toLocaleString('en-GB')}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="admin-ticket-request-actions">
                    {r.status === 'pending' && (
                      <button
                        type="button"
                        className="board-admin-activate"
                        disabled={busyTicketRequestId !== null}
                        onClick={async () => {
                          setBusyTicketRequestId(r.id)
                          try {
                            await onApproveTicketRequest(r)
                          } finally {
                            setBusyTicketRequestId(null)
                          }
                        }}
                      >
                        {busyTicketRequestId === r.id ? 'Updating…' : 'Accept'}
                      </button>
                    )}
                    {r.status === 'approved' && (
                      <button
                        type="button"
                        className="board-admin-activate"
                        disabled={busyTicketRequestId !== null}
                        onClick={async () => {
                          setBusyTicketRequestId(r.id)
                          try {
                            await onCompleteTicketRequest(r)
                          } finally {
                            setBusyTicketRequestId(null)
                          }
                        }}
                      >
                        {busyTicketRequestId === r.id ? 'Updating…' : 'Mark completed'}
                      </button>
                    )}
                    {r.status !== 'completed' && (
                      <button
                        type="button"
                        className="admin-revoke-btn"
                        disabled={busyTicketRequestId !== null}
                        onClick={async () => {
                          setBusyTicketRequestId(r.id)
                          try {
                            await onCancelTicketRequest(r)
                          } finally {
                            setBusyTicketRequestId(null)
                          }
                        }}
                      >
                        {busyTicketRequestId === r.id ? 'Updating…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
      {adminTab === 'news' && (
        <section className="admin-news-block admin-panel-block" aria-label="Manage news posts">
          <div className="admin-block-head">
            <h2 className="admin-block-title">News posts</h2>
            <p className="admin-block-lead">
              Create or edit posts shown on the public News page. Publishing sends a push notification immediately to
              members who enabled news alerts in MY MUCY.
            </p>
          </div>
          <form
            ref={newsFormRef}
            className="admin-news-form"
            onSubmit={async (e) => {
              e.preventDefault()
              setNewsError(null)
              const title = newsTitle.trim()
              const body = newsBody.trim()
              const imageUrl = newsImageUrl.trim() || null
              const imageUrlMobile = newsImageUrlMobile.trim() || null
              const bodyPhotos = newsBodyPhotos.map((src) => src.trim()).filter(Boolean)
              if (!title || !body) {
                setNewsError('Title and content are required.')
                return
              }
              try {
                const payload = { title, body, imageUrl, imageUrlMobile, bodyPhotos }
                if (editingNewsId) {
                  await onUpdateNews(editingNewsId, payload)
                } else {
                  await onCreateNews(payload)
                }
                setNewsTitle('')
                setNewsBody('')
                setNewsImageUrl('')
                setNewsImageUrlMobile('')
                setNewsBodyPhotos([])
                setNewsBodyPhotoUrlDraft('')
                setEditingNewsId(null)
              } catch (err) {
                setNewsError(err instanceof Error ? err.message : 'Could not save news.')
              }
            }}
          >
            {editingNewsId && (
              <p className="admin-news-editing-banner" role="status">
                Editing post: <strong>{newsTitle || 'Untitled'}</strong>. Update the fields below, then click{' '}
                <strong>Update post</strong>.
              </p>
            )}
            <input
              className="auth-input"
              type="text"
              placeholder="News title"
              value={newsTitle}
              onChange={(e) => setNewsTitle(e.target.value)}
            />
            <textarea
              className="auth-input admin-news-textarea"
              placeholder="Write the news content..."
              value={newsBody}
              onChange={(e) => setNewsBody(e.target.value)}
            />
            <div className="admin-news-photo-block">
              <h4 className="admin-news-photo-block-title">Desktop photo (PC)</h4>
              <p className="admin-news-image-hint">
                Recommended: <strong>1600 × 900 px</strong> (16:9 landscape) for the website grid.
              </p>
              <label className="admin-news-date-row">
                <span>Image URL (optional)</span>
                <input
                  className="auth-input"
                  type="text"
                  inputMode="url"
                  placeholder="https://res.cloudinary.com/.../desktop-photo.jpg"
                  value={newsImageUrl}
                  onChange={(e) => setNewsImageUrl(e.target.value)}
                />
              </label>
              <label className="admin-news-date-row">
                <span>Or upload</span>
                <input
                  className="auth-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => void onPickNewsImage('desktop', e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="admin-news-photo-block">
              <h4 className="admin-news-photo-block-title">Smartphone photo</h4>
              <p className="admin-news-image-hint">
                Recommended: <strong>1080 × 1350 px</strong> (4:5 portrait) for the mobile swipe card. Optional —
                if empty, the desktop photo is used on phones too.
              </p>
              <label className="admin-news-date-row">
                <span>Image URL (optional)</span>
                <input
                  className="auth-input"
                  type="text"
                  inputMode="url"
                  placeholder="https://res.cloudinary.com/.../mobile-photo.jpg"
                  value={newsImageUrlMobile}
                  onChange={(e) => setNewsImageUrlMobile(e.target.value)}
                />
              </label>
              <label className="admin-news-date-row">
                <span>Or upload</span>
                <input
                  className="auth-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => void onPickNewsImage('mobile', e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="admin-news-photo-block">
              <h4 className="admin-news-photo-block-title">Article photos (full post)</h4>
              <p className="admin-news-image-hint">
                These photos appear inside the full article when members open the post — separate from the preview
                images above. You can add multiple photos via URL (e.g. Cloudinary) or upload.
              </p>
              <label className="admin-news-date-row">
                <span>Image URL (optional)</span>
                <div className="admin-news-body-photo-url-row">
                  <input
                    className="auth-input"
                    type="text"
                    inputMode="url"
                    placeholder="https://res.cloudinary.com/.../article-photo.jpg"
                    value={newsBodyPhotoUrlDraft}
                    onChange={(e) => setNewsBodyPhotoUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addNewsBodyPhotoUrl()
                      }
                    }}
                  />
                  <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--secondary" onClick={addNewsBodyPhotoUrl}>
                    Add URL
                  </button>
                </div>
              </label>
              <label className="admin-news-date-row">
                <span>Or upload photos</span>
                <input
                  className="auth-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => void onPickNewsBodyPhotos(e.target.files)}
                />
              </label>
              {newsBodyPhotos.length > 0 && (
                <ul className="merch-admin-photo-strip">
                  {newsBodyPhotos.map((src, i) => (
                    <li key={`${i}-${src.slice(0, 24)}`} className="merch-admin-photo-tile">
                      <img src={src} alt="" className="merch-admin-photo-img" />
                      <button
                        type="button"
                        className="merch-admin-photo-remove"
                        onClick={() => setNewsBodyPhotos((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Remove photo"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <AdminNewsPostPreview
              title={newsTitle}
              body={newsBody}
              imageUrl={newsImageUrl.trim() || null}
              imageUrlMobile={newsImageUrlMobile.trim() || null}
              publishedAt={
                editingNewsId
                  ? (newsPosts.find((post) => post.id === editingNewsId)?.publishedAt ?? new Date().toISOString())
                  : new Date().toISOString()
              }
            />
            {newsError && <p className="auth-message is-error">{newsError}</p>}
            <div className="admin-news-form-actions">
              <button type="submit" className="board-admin-activate">
                {editingNewsId ? 'Update post' : 'Publish post'}
              </button>
              {editingNewsId && (
                <button
                  type="button"
                  className="admin-revoke-btn"
                  onClick={() => {
                    setEditingNewsId(null)
                    setNewsTitle('')
                    setNewsBody('')
                    setNewsImageUrl('')
                    setNewsImageUrlMobile('')
                    setNewsBodyPhotos([])
                    setNewsBodyPhotoUrlDraft('')
                    setNewsError(null)
                  }}
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
          {newsLoading ? (
            <p className="admin-empty">Loading news…</p>
          ) : newsPosts.length === 0 ? (
            <p className="admin-empty">No news posts yet.</p>
          ) : (
            <ul className="admin-news-list">
              {newsPosts.map((n) => (
                <li key={n.id} className={`admin-news-card${editingNewsId === n.id ? ' is-editing' : ''}`}>
                  <p className="admin-news-card-title">{n.title}</p>
                  <p className="admin-news-card-meta">
                    Published: {new Date(n.publishedAt).toLocaleString('en-GB')}
                  </p>
                  {n.imageUrl && <img src={n.imageUrl} alt={n.title} className="news-image" />}
                  <p className="admin-news-card-body">{n.body}</p>
                  <div className="admin-news-card-actions">
                    <button
                      type="button"
                      className="admin-details-btn"
                      onClick={() => beginEditNews(n)}
                    >
                      {editingNewsId === n.id ? 'Editing…' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      className="admin-revoke-btn"
                      disabled={busyNewsId !== null}
                      onClick={async () => {
                        setBusyNewsId(n.id)
                        try {
                          await onDeleteNews(n.id)
                          if (editingNewsId === n.id) {
                            setEditingNewsId(null)
                            setNewsTitle('')
                            setNewsBody('')
                            setNewsImageUrl('')
                            setNewsImageUrlMobile('')
                            setNewsBodyPhotos([])
                            setNewsBodyPhotoUrlDraft('')
                            setNewsError(null)
                          }
                        } finally {
                          setBusyNewsId(null)
                        }
                      }}
                    >
                      {busyNewsId === n.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {adminTab === 'merch' && (
        <section className="admin-merch-orders-block admin-panel-block" aria-label="Merchandise orders">
          <div className="admin-block-head">
            <h2 className="admin-block-title">Merchandise orders</h2>
            <p className="admin-block-lead">
              Orders from the Merchandise shop. Match payments to these rows, then mark as paid before dispatch.
            </p>
            <button type="button" className="admin-merch-create-btn" onClick={exportMerchandiseReport}>
              Export Excel
            </button>
          </div>
          <section className="admin-panel-block" aria-label="Manage merchandise products">
            <div className="admin-block-head">
              <h3 className="admin-block-title">Manage merchandise products</h3>
              <p className="admin-block-lead">Add, edit, delete, and reorder products.</p>
            </div>
            {adminMerchError && <p className="auth-message is-error">{adminMerchError}</p>}
            <div className="merch-admin-grid">
              <label className="auth-field membership-field">
                <span className="auth-label">Title</span>
                <input
                  className="auth-input"
                  type="text"
                  value={adminMerchTitle}
                  onChange={(ev) => setAdminMerchTitle(ev.target.value)}
                  disabled={adminMerchBusy}
                />
              </label>
              <label className="auth-field membership-field">
                <span className="auth-label">Price (€)</span>
                <input
                  className="auth-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 12 or 12.50"
                  value={adminMerchPrice}
                  onChange={(ev) => setAdminMerchPrice(ev.target.value)}
                  disabled={adminMerchBusy}
                />
              </label>
            </div>
            <label className="auth-field membership-field">
              <span className="auth-label">Photos</span>
              <input
                className="auth-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(ev) => void onPickAdminMerchPhotos(ev.target.files)}
                disabled={adminMerchBusy}
              />
            </label>
            {adminMerchPhotos.length > 0 && (
              <ul className="merch-admin-photo-strip">
                {adminMerchPhotos.map((src, i) => (
                  <li key={`${i}-${src.slice(0, 24)}`} className="merch-admin-photo-tile">
                    <img src={src} alt="" className="merch-admin-photo-img" />
                    <button
                      type="button"
                      className="merch-admin-photo-remove"
                      onClick={() => setAdminMerchPhotos((prev) => prev.filter((_, j) => j !== i))}
                      disabled={adminMerchBusy}
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="mycmusc-reg-btn mycmusc-reg-btn--primary merch-admin-submit"
              disabled={adminMerchBusy}
              onClick={async () => {
                setAdminMerchError(null)
                const title = adminMerchTitle.trim()
                const price = Number(adminMerchPrice.replace(',', '.'))
                if (!title) {
                  setAdminMerchError('Title is required.')
                  return
                }
                if (!Number.isFinite(price) || price < 0) {
                  setAdminMerchError('Please enter a valid price.')
                  return
                }
                setAdminMerchBusy(true)
                try {
                  await onCreateMerchandiseProduct({ title, priceEur: price, photos: adminMerchPhotos })
                  setAdminMerchTitle('')
                  setAdminMerchPrice('')
                  setAdminMerchPhotos([])
                } catch (err) {
                  setAdminMerchError(err instanceof Error ? err.message : 'Could not create product.')
                } finally {
                  setAdminMerchBusy(false)
                }
              }}
            >
              {adminMerchBusy ? 'Saving…' : 'Publish product'}
            </button>
            <ul className="merch-grid" style={{ marginTop: '1rem' }}>
              {merchandiseProducts.map((product, index) => {
                const draft = editingMerchById[product.id] ?? {
                  title: product.title,
                  price: product.priceEur.toFixed(2),
                }
                return (
                <li key={product.id} className="merch-card">
                  <div className="merch-card-visual">
                    {product.photos[0] ? (
                      <img src={product.photos[0]} alt="" className="merch-card-img" />
                    ) : (
                      <div className="merch-card-placeholder" aria-hidden>
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="merch-card-body">
                    <h4 className="merch-card-title">{product.title}</h4>
                    <p className="merch-card-price">€{product.priceEur.toFixed(2)}</p>
                    <label className="auth-field membership-field">
                      <span className="auth-label">Edit title</span>
                      <input
                        className="auth-input"
                        type="text"
                        value={draft.title}
                        onChange={(ev) =>
                          setEditingMerchById((prev) => ({
                            ...prev,
                            [product.id]: { ...draft, title: ev.target.value },
                          }))
                        }
                        disabled={adminMerchBusy}
                      />
                    </label>
                    <label className="auth-field membership-field">
                      <span className="auth-label">Edit price (€)</span>
                      <input
                        className="auth-input"
                        type="text"
                        inputMode="decimal"
                        value={draft.price}
                        onChange={(ev) =>
                          setEditingMerchById((prev) => ({
                            ...prev,
                            [product.id]: { ...draft, price: ev.target.value },
                          }))
                        }
                        disabled={adminMerchBusy}
                      />
                    </label>
                    <div className="admin-ticket-request-actions">
                      <button
                        type="button"
                        className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                        disabled={adminMerchBusy || index === 0}
                        onClick={async () => {
                          setAdminMerchBusy(true)
                          try {
                            const ids = moveItem(
                              merchandiseProducts.map((row) => row.id),
                              index,
                              index - 1,
                            )
                            await onReorderMerchandiseProducts(ids)
                          } catch (err) {
                            setAdminMerchError(err instanceof Error ? err.message : 'Could not reorder product.')
                          } finally {
                            setAdminMerchBusy(false)
                          }
                        }}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                        disabled={adminMerchBusy || index === merchandiseProducts.length - 1}
                        onClick={async () => {
                          setAdminMerchBusy(true)
                          try {
                            const ids = moveItem(
                              merchandiseProducts.map((row) => row.id),
                              index,
                              index + 1,
                            )
                            await onReorderMerchandiseProducts(ids)
                          } catch (err) {
                            setAdminMerchError(err instanceof Error ? err.message : 'Could not reorder product.')
                          } finally {
                            setAdminMerchBusy(false)
                          }
                        }}
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        className="mycmusc-reg-btn mycmusc-reg-btn--primary"
                        disabled={adminMerchBusy}
                        onClick={async () => {
                          const title = draft.title.trim()
                          const price = Number(draft.price.replace(',', '.'))
                          if (!title) return setAdminMerchError('Title is required.')
                          if (!Number.isFinite(price) || price < 0) return setAdminMerchError('Please enter a valid price.')
                          setAdminMerchBusy(true)
                          setAdminMerchError(null)
                          try {
                            await onUpdateMerchandiseProduct(product.id, { title, priceEur: price })
                          } catch (err) {
                            setAdminMerchError(err instanceof Error ? err.message : 'Could not update product.')
                          } finally {
                            setAdminMerchBusy(false)
                          }
                        }}
                      >
                        Save
                      </button>
                    </div>
                    <button
                      type="button"
                      className="mycmusc-reg-btn mycmusc-reg-btn--secondary merch-card-delete"
                      disabled={adminMerchBusy}
                      onClick={async () => {
                        const yes = window.confirm('Delete this product?')
                        if (!yes) return
                        setAdminMerchBusy(true)
                        try {
                          await onDeleteMerchandiseProduct(product.id)
                        } catch (err) {
                          setAdminMerchError(err instanceof Error ? err.message : 'Could not delete product.')
                        } finally {
                          setAdminMerchBusy(false)
                        }
                      }}
                    >
                      Delete product
                    </button>
                  </div>
                </li>
              )})}
            </ul>
          </section>
          <div className="admin-search-row">
            <input
              className="auth-input admin-search-input"
              type="search"
              placeholder="Search orders by order ID, user ID, product, or delivery branch"
              value={merchSearch}
              onChange={(e) => setMerchSearch(e.target.value)}
            />
          </div>
          {loading ? (
            <p className="admin-empty">Loading merchandise orders…</p>
          ) : filteredMerchOrders.length === 0 ? (
            <p className="admin-empty">No merchandise orders yet.</p>
          ) : (
            <ul className="admin-merch-orders-list">
              {filteredMerchOrders.map((o) => (
                <li key={o.id} className="admin-merch-order-card">
                  <div className="admin-merch-order-top">
                    <div>
                      <p className="admin-merch-order-meta">
                        <span className="admin-merch-order-date">
                          {new Date(o.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <span className={`admin-merch-order-status admin-merch-order-status--${o.status}`}>
                          {o.status}
                        </span>
                      </p>
                      <p className="admin-merch-order-total">
                        <strong>€{o.totalEur.toFixed(2)}</strong> · User <code className="admin-inline-code">{o.userId}</code>
                      </p>
                    </div>
                    {o.status === 'pending' && (
                      <div className="admin-merch-order-actions">
                        <button
                          type="button"
                          className="board-admin-activate"
                          disabled={busyMerchOrderId !== null}
                          onClick={async () => {
                            setBusyMerchOrderId(o.id)
                            try {
                              await onUpdateMerchandiseOrderStatus(o.id, 'paid')
                            } finally {
                              setBusyMerchOrderId(null)
                            }
                          }}
                        >
                          {busyMerchOrderId === o.id ? 'Updating…' : 'Mark paid'}
                        </button>
                        <button
                          type="button"
                          className="admin-revoke-btn"
                          disabled={busyMerchOrderId !== null}
                          onClick={async () => {
                            setBusyMerchOrderId(o.id)
                            try {
                              await onUpdateMerchandiseOrderStatus(o.id, 'cancelled')
                            } finally {
                              setBusyMerchOrderId(null)
                            }
                          }}
                        >
                          {busyMerchOrderId === o.id ? 'Updating…' : 'Cancel order'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="admin-merch-order-delivery">
                    <span className="admin-merch-order-delivery-label">ACS / Akis Express</span>
                    <p className="admin-merch-order-delivery-text">{o.deliveryBranch}</p>
                  </div>
                  <ul className="admin-merch-order-lines">
                    {o.lines.map((line, idx) => (
                      <li key={`${o.id}-${line.productId}-${idx}`} className="admin-merch-order-line">
                        <span className="admin-merch-order-line-title">{line.title}</span>
                        <span className="admin-merch-order-line-meta">
                          €{line.unitPriceEur.toFixed(2)} × {line.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {adminTab === 'official' && (
        <section className="admin-panel-block" aria-label="Official Manchester United memberships">
          <div className="admin-block-head">
            <h2 className="admin-block-title">Official Manchester United memberships</h2>
            <p className="admin-block-lead">
              Manage official MU package offers and review requests submitted from MY MUCY, registration forms, and
              family member applications.
            </p>
          </div>
          {officialError && <p className="auth-message is-error">{officialError}</p>}
          <div className="merch-admin-grid">
            <label className="auth-field membership-field">
              <span className="auth-label">Title</span>
              <input
                className="auth-input"
                type="text"
                value={officialTitle}
                onChange={(ev) => setOfficialTitle(ev.target.value)}
                disabled={officialBusy}
              />
            </label>
            <label className="auth-field membership-field">
              <span className="auth-label">Price (€)</span>
              <input
                className="auth-input"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 75 or 75.00"
                value={officialPrice}
                onChange={(ev) => setOfficialPrice(ev.target.value)}
                disabled={officialBusy}
              />
            </label>
          </div>
          <label className="auth-field membership-field">
            <span className="auth-label">Picture</span>
            <input
              className="auth-input"
              type="file"
              accept="image/*"
              disabled={officialBusy}
              onChange={async (ev) => {
                const file = ev.target.files?.[0]
                if (!file) return
                if (!file.type.startsWith('image/')) {
                  setOfficialError('Please choose an image file.')
                  return
                }
                try {
                  const dataUrl = await resizeImageFileToJpegDataUrl(file, { maxEdge: 1200, quality: 0.88 })
                  setOfficialImageUrl(dataUrl)
                  setOfficialError(null)
                } catch (e) {
                  setOfficialError(e instanceof Error ? e.message : 'Could not process image.')
                }
              }}
            />
          </label>
          {officialImageUrl && (
            <div className="merch-admin-photo-tile">
              <img src={officialImageUrl} alt="" className="merch-admin-photo-img" />
            </div>
          )}
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary merch-admin-submit"
            disabled={officialBusy}
            onClick={async () => {
              setOfficialError(null)
              const title = officialTitle.trim()
              const price = Number(officialPrice.replace(',', '.'))
              if (!title) return setOfficialError('Title is required.')
              if (!Number.isFinite(price) || price < 0) return setOfficialError('Please enter a valid price.')
              if (!officialImageUrl) return setOfficialError('Picture is required.')
              setOfficialBusy(true)
              try {
                await onCreateOfficialOffer({ title, priceEur: price, imageUrl: officialImageUrl })
                setOfficialTitle('')
                setOfficialPrice('')
                setOfficialImageUrl('')
              } catch (err) {
                setOfficialError(err instanceof Error ? err.message : 'Could not create offer.')
              } finally {
                setOfficialBusy(false)
              }
            }}
          >
            {officialBusy ? 'Saving…' : 'Publish offer'}
          </button>

          {officialOffersLoading ? (
            <p className="admin-empty">Loading offers…</p>
          ) : officialOffers.length === 0 ? (
            <p className="admin-empty">No official membership offers yet.</p>
          ) : (
            <ul className="merch-grid" style={{ marginTop: '1rem' }}>
              {officialOffers.map((offer, index) => {
                const draft = editingOfficialById[offer.id] ?? {
                  title: offer.title,
                  price: offer.priceEur.toFixed(2),
                }
                return (
                <li key={offer.id} className="merch-card">
                  <div className="merch-card-visual">
                    {offer.imageUrl ? (
                      <img src={offer.imageUrl} alt="" className="merch-card-img" />
                    ) : (
                      <div className="merch-card-placeholder" aria-hidden>
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="merch-card-body">
                    <h4 className="merch-card-title">{offer.title}</h4>
                    <p className="merch-card-price">€{offer.priceEur.toFixed(2)}</p>
                    <label className="auth-field membership-field">
                      <span className="auth-label">Edit title</span>
                      <input
                        className="auth-input"
                        type="text"
                        value={draft.title}
                        onChange={(ev) =>
                          setEditingOfficialById((prev) => ({
                            ...prev,
                            [offer.id]: { ...draft, title: ev.target.value },
                          }))
                        }
                        disabled={officialBusy}
                      />
                    </label>
                    <label className="auth-field membership-field">
                      <span className="auth-label">Edit price (€)</span>
                      <input
                        className="auth-input"
                        type="text"
                        inputMode="decimal"
                        value={draft.price}
                        onChange={(ev) =>
                          setEditingOfficialById((prev) => ({
                            ...prev,
                            [offer.id]: { ...draft, price: ev.target.value },
                          }))
                        }
                        disabled={officialBusy}
                      />
                    </label>
                    <div className="admin-ticket-request-actions">
                      <button
                        type="button"
                        className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                        disabled={officialBusy || index === 0}
                        onClick={async () => {
                          setOfficialBusy(true)
                          try {
                            const ids = moveItem(
                              officialOffers.map((row) => row.id),
                              index,
                              index - 1,
                            )
                            await onReorderOfficialOffers(ids)
                          } catch (err) {
                            setOfficialError(err instanceof Error ? err.message : 'Could not reorder offer.')
                          } finally {
                            setOfficialBusy(false)
                          }
                        }}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                        disabled={officialBusy || index === officialOffers.length - 1}
                        onClick={async () => {
                          setOfficialBusy(true)
                          try {
                            const ids = moveItem(
                              officialOffers.map((row) => row.id),
                              index,
                              index + 1,
                            )
                            await onReorderOfficialOffers(ids)
                          } catch (err) {
                            setOfficialError(err instanceof Error ? err.message : 'Could not reorder offer.')
                          } finally {
                            setOfficialBusy(false)
                          }
                        }}
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        className="mycmusc-reg-btn mycmusc-reg-btn--primary"
                        disabled={officialBusy}
                        onClick={async () => {
                          const title = draft.title.trim()
                          const price = Number(draft.price.replace(',', '.'))
                          if (!title) return setOfficialError('Title is required.')
                          if (!Number.isFinite(price) || price < 0) return setOfficialError('Please enter a valid price.')
                          setOfficialBusy(true)
                          setOfficialError(null)
                          try {
                            await onUpdateOfficialOffer(offer.id, { title, priceEur: price })
                          } catch (err) {
                            setOfficialError(err instanceof Error ? err.message : 'Could not update offer.')
                          } finally {
                            setOfficialBusy(false)
                          }
                        }}
                      >
                        Save
                      </button>
                    </div>
                    <button
                      type="button"
                      className="mycmusc-reg-btn mycmusc-reg-btn--secondary merch-card-delete"
                      disabled={officialBusy}
                      onClick={async () => {
                        const yes = window.confirm('Delete this official membership offer?')
                        if (!yes) return
                        setOfficialBusy(true)
                        try {
                          await onDeleteOfficialOffer(offer.id)
                        } finally {
                          setOfficialBusy(false)
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              )})}
            </ul>
          )}

          <section className="admin-panel-block" aria-label="Official membership requests" style={{ marginTop: '2rem' }}>
            <div className="admin-block-head">
              <h3 className="admin-block-title">Official membership requests</h3>
              <p className="admin-block-lead">
                Requests submitted by members appear here. When accepting, enter the official MU ID and status to save on
                the member&apos;s record.
              </p>
              <button type="button" className="admin-merch-create-btn" onClick={exportOfficialMembershipsReport}>
                Export Excel
              </button>
            </div>
            <div className="admin-filter-row" role="tablist" aria-label="Filter official membership requests by status">
              {(['pending', 'completed', 'rejected'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={officialRequestFilter === f}
                  className={`admin-filter-btn ${officialRequestFilter === f ? 'is-active' : ''}`}
                  onClick={() => setOfficialRequestFilter(f)}
                >
                  {f === 'pending' ? 'Pending' : f === 'completed' ? 'Completed' : 'Rejected'}
                </button>
              ))}
            </div>
            <div className="admin-search-row">
              <input
                className="auth-input admin-search-input"
                type="search"
                placeholder="Search by name, email, offer, application ref, or user ID"
                value={officialRequestSearch}
                onChange={(e) => setOfficialRequestSearch(e.target.value)}
              />
            </div>
            {officialRequestsLoading ? (
              <p className="admin-empty">Loading requests…</p>
            ) : filteredOfficialRequests.length === 0 ? (
              <p className="admin-empty">
                No {officialRequestFilter === 'completed' ? 'completed' : officialRequestFilter} official membership
                requests.
              </p>
            ) : (
              <ul className="admin-ticket-request-list">
                {filteredOfficialRequests.map((r) => {
                  const muIdDraft =
                    officialMuIdDraftByRequestId[r.id] ?? r.user.officialMuMembershipId ?? ''
                  const muStatusDraft =
                    officialMuStatusDraftByRequestId[r.id] ??
                    r.user.officialMuMembershipStatus ??
                    'activated'
                  return (
                    <li key={r.id} className="admin-ticket-request-card">
                      <div className="admin-ticket-request-main">
                        <strong>{r.offerTitle}</strong>
                        <p className="admin-member-meta">
                          €{r.offerPriceEur.toFixed(2)} · {r.user.fullName ?? '—'}
                          {r.user.email ? ` · ${r.user.email}` : ''}
                        </p>
                        <p className="admin-renewal-meta">
                          Requested: {new Date(r.requestedAt).toLocaleString('en-GB')}
                          {r.user.applicationId ? (
                            <>
                              {' '}
                              · Ref: <code className="admin-inline-code">{r.user.applicationId}</code>
                            </>
                          ) : null}
                        </p>
                        <span className={`fixtures-ticket-pill fixtures-ticket-pill--${r.status}`}>
                          {r.status[0].toUpperCase() + r.status.slice(1)}
                        </span>
                        {(r.user.officialMuMembershipId || r.user.officialMuMembershipStatus) && (
                          <p className="admin-member-meta">
                            On file: {r.user.officialMuMembershipId || '—'} ·{' '}
                            {formatOfficialMuMembershipStatus(r.user.officialMuMembershipStatus)}
                          </p>
                        )}
                      </div>
                      <div className="admin-ticket-request-actions">
                        {r.status === 'pending' && (
                          <>
                            <label className="auth-field membership-field">
                              <span className="auth-label">Official MU ID</span>
                              <input
                                className="admin-merch-create-input"
                                type="text"
                                placeholder="Required to accept"
                                value={muIdDraft}
                                onChange={(e) =>
                                  setOfficialMuIdDraftByRequestId((prev) => ({
                                    ...prev,
                                    [r.id]: e.target.value,
                                  }))
                                }
                                disabled={officialRequestBusyId !== null}
                              />
                            </label>
                            <label className="auth-field membership-field">
                              <span className="auth-label">Status on accept</span>
                              <select
                                className="auth-input"
                                value={muStatusDraft}
                                onChange={(e) =>
                                  setOfficialMuStatusDraftByRequestId((prev) => ({
                                    ...prev,
                                    [r.id]: e.target.value as OfficialMuMembershipStatus,
                                  }))
                                }
                                disabled={officialRequestBusyId !== null}
                              >
                                <option value="activated">Activated</option>
                                <option value="pending">Pending</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              className="board-admin-activate"
                              disabled={officialRequestBusyId !== null}
                              onClick={async () => {
                                setOfficialError(null)
                                setOfficialRequestBusyId(r.id)
                                try {
                                  const parsed = parseOfficialMuMembershipFields(muIdDraft, muStatusDraft)
                                  if ('error' in parsed) {
                                    setOfficialError(parsed.error)
                                    return
                                  }
                                  await onSetOfficialRequestStatus(r.id, 'completed', {
                                    officialMuMembershipId: parsed.officialMuMembershipId,
                                    officialMuMembershipStatus:
                                      parsed.officialMuMembershipStatus ?? undefined,
                                  })
                                } catch (err) {
                                  setOfficialError(
                                    err instanceof Error ? err.message : 'Could not complete request.',
                                  )
                                } finally {
                                  setOfficialRequestBusyId(null)
                                }
                              }}
                            >
                              {officialRequestBusyId === r.id ? 'Saving…' : 'Accept & save ID'}
                            </button>
                            <button
                              type="button"
                              className="admin-revoke-btn"
                              disabled={officialRequestBusyId !== null}
                              onClick={async () => {
                                setOfficialRequestBusyId(r.id)
                                try {
                                  await onSetOfficialRequestStatus(r.id, 'rejected')
                                } catch (err) {
                                  setOfficialError(
                                    err instanceof Error ? err.message : 'Could not reject request.',
                                  )
                                } finally {
                                  setOfficialRequestBusyId(null)
                                }
                              }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="admin-details-btn"
                          onClick={() =>
                            setExpandedOfficialRequestId((id) => (id === r.id ? null : r.id))
                          }
                        >
                          {expandedOfficialRequestId === r.id ? 'Hide details' : 'More info'}
                        </button>
                        <button
                          type="button"
                          className="admin-news-delete-btn"
                          disabled={officialRequestBusyId !== null}
                          onClick={async () => {
                            const yes = window.confirm('Delete this official membership request?')
                            if (!yes) return
                            setOfficialRequestBusyId(r.id)
                            try {
                              await onDeleteOfficialRequest(r.id)
                            } catch (err) {
                              setOfficialError(
                                err instanceof Error ? err.message : 'Could not delete request.',
                              )
                            } finally {
                              setOfficialRequestBusyId(null)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      {expandedOfficialRequestId === r.id && (
                        <dl className="admin-member-dl">
                          <div>
                            <dt>User ID</dt>
                            <dd>{r.userId}</dd>
                          </div>
                          <div>
                            <dt>Mobile</dt>
                            <dd>{r.user.mobilePhone ?? '—'}</dd>
                          </div>
                          <div>
                            <dt>Date of birth</dt>
                            <dd>{formatDateOfBirthDisplay(r.user.dateOfBirth ?? '') || '—'}</dd>
                          </div>
                          <div>
                            <dt>Address</dt>
                            <dd>
                              {r.user.address ?? '—'}
                              {r.user.area || r.user.postalCode || r.user.city || r.user.country ? (
                                <>
                                  <br />
                                  {[r.user.area, r.user.postalCode].filter(Boolean).join(', ')}
                                  <br />
                                  {[r.user.city, r.user.country].filter(Boolean).join(', ')}
                                </>
                              ) : null}
                            </dd>
                          </div>
                          <div>
                            <dt>Application reference</dt>
                            <dd>{r.user.applicationId ?? '—'}</dd>
                          </div>
                          <div>
                            <dt>Official MU ID on file</dt>
                            <dd>{r.user.officialMuMembershipId ?? '—'}</dd>
                          </div>
                          <div>
                            <dt>Official MU status on file</dt>
                            <dd>{formatOfficialMuMembershipStatus(r.user.officialMuMembershipStatus)}</dd>
                          </div>
                        </dl>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </section>
      )}
      {adminTab === 'email' && (
        <section className="admin-panel-block" aria-label="Member email">
          <div className="admin-block-head">
            <h2 className="admin-block-title">Email members</h2>
            <p className="admin-block-lead">
              Send an email to Cyprus membership applicants and active members. Each unique email address receives one
              message. The club signature is added automatically at the end.
            </p>
          </div>
          {emailError && <p className="auth-message is-error">{emailError}</p>}
          {emailNotice && <p className="admin-member-action-notice">{emailNotice}</p>}
          <fieldset className="membership-mu-status-fieldset admin-email-audience-fieldset">
            <legend className="membership-mu-status-legend">Send to</legend>
            <label className="membership-mu-status-option">
              <input
                type="radio"
                name="admin-email-audience"
                value="all"
                checked={emailAudience === 'all'}
                onChange={() => setEmailAudience('all')}
                disabled={emailBusy}
              />
              <span>All members (pending + active)</span>
            </label>
            <label className="membership-mu-status-option">
              <input
                type="radio"
                name="admin-email-audience"
                value="pending"
                checked={emailAudience === 'pending'}
                onChange={() => setEmailAudience('pending')}
                disabled={emailBusy}
              />
              <span>Pending members only</span>
            </label>
            <label className="membership-mu-status-option">
              <input
                type="radio"
                name="admin-email-audience"
                value="active"
                checked={emailAudience === 'active'}
                onChange={() => setEmailAudience('active')}
                disabled={emailBusy}
              />
              <span>Active members only</span>
            </label>
          </fieldset>
          <p className="admin-block-lead">
            {emailRecipientsLoading
              ? 'Counting recipients…'
              : emailRecipientCount == null
                ? 'Could not load recipient count.'
                : `${emailRecipientCount} unique email address${emailRecipientCount === 1 ? '' : 'es'} will receive this message.`}
          </p>
          <label className="auth-field membership-field">
            <span className="auth-label">Subject</span>
            <input
              className="auth-input"
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              disabled={emailBusy}
              placeholder="Email subject"
            />
          </label>
          <label className="auth-field membership-field">
            <span className="auth-label">Message</span>
            <textarea
              className="auth-input admin-email-body-input"
              rows={12}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              disabled={emailBusy}
              placeholder="Write the main email message here…"
            />
          </label>
          <button
            type="button"
            className="mycmusc-reg-btn mycmusc-reg-btn--primary merch-admin-submit"
            disabled={emailBusy || emailRecipientsLoading || !emailRecipientCount}
            onClick={() => {
              const subject = emailSubject.trim()
              const body = emailBody.trim()
              if (!subject) {
                setEmailError('Subject is required.')
                return
              }
              if (!body) {
                setEmailError('Email message is required.')
                return
              }
              if (!emailRecipientCount) {
                setEmailError('No recipients with an email address match this audience.')
                return
              }
              const audienceLabel =
                emailAudience === 'all'
                  ? 'all pending and active members'
                  : emailAudience === 'pending'
                    ? 'pending members'
                    : 'active members'
              const confirmed = window.confirm(
                `Send this email to ${emailRecipientCount} recipient${emailRecipientCount === 1 ? '' : 's'} (${audienceLabel})?`,
              )
              if (!confirmed) return
              setEmailBusy(true)
              setEmailError(null)
              setEmailNotice(null)
              void (async () => {
                const result = await sendMemberBulkEmail({ audience: emailAudience, subject, body })
                setEmailBusy(false)
                if (result.error) {
                  setEmailError(result.error.message)
                  return
                }
                if (result.failedCount > 0) {
                  setEmailNotice(
                    `Sent ${result.sentCount} of ${result.recipientCount} emails. ${result.failedCount} failed.`,
                  )
                  setEmailError(`Failed addresses: ${result.failedEmails.join(', ')}`)
                  return
                }
                setEmailNotice(`Email sent to ${result.sentCount} recipient${result.sentCount === 1 ? '' : 's'}.`)
                setEmailSubject('')
                setEmailBody('')
              })()
            }}
          >
            {emailBusy ? 'Sending…' : 'Send email'}
          </button>
        </section>
      )}
        </div>
      </div>
      <MemberEmailComposeModal
        open={memberEmailTargets !== null}
        members={memberEmailTargets ?? []}
        subject={memberEmailSubject}
        body={memberEmailBody}
        submitting={memberEmailSubmitting}
        error={memberEmailError}
        onSubjectChange={setMemberEmailSubject}
        onBodyChange={setMemberEmailBody}
        onClose={() => {
          if (memberEmailSubmitting) return
          setMemberEmailTargets(null)
          setMemberEmailError(null)
        }}
        onConfirm={async () => {
          if (!memberEmailTargets || memberEmailTargets.length === 0) return
          const subject = memberEmailSubject.trim()
          const body = memberEmailBody.trim()
          if (!subject) {
            setMemberEmailError('Subject is required.')
            return
          }
          if (!body) {
            setMemberEmailError('Email message is required.')
            return
          }
          setMemberEmailSubmitting(true)
          setMemberEmailError(null)
          setMemberActionError(null)
          setMemberActionNotice(null)
          try {
            const result = await sendMemberSelectedEmail({
              applicationIds: memberEmailTargets.map((member) => member.applicationId),
              subject,
              body,
            })
            if (result.error) {
              setMemberEmailError(result.error.message)
              return
            }
            let notice = `Email sent to ${result.sentCount} recipient${result.sentCount === 1 ? '' : 's'}.`
            if (result.skippedNoEmail > 0) {
              notice += ` ${result.skippedNoEmail} selected member${result.skippedNoEmail === 1 ? '' : 's'} had no email on file.`
            }
            if (result.failedCount > 0) {
              setMemberEmailError(`Failed addresses: ${result.failedEmails.join(', ')}`)
            } else {
              setMemberEmailTargets(null)
              setMemberEmailSubject('')
              setMemberEmailBody('')
              setSelectedMemberApplicationIds({})
            }
            setMemberActionNotice(notice)
          } catch (error) {
            setMemberEmailError(error instanceof Error ? error.message : 'Could not send email.')
          } finally {
            setMemberEmailSubmitting(false)
          }
        }}
      />
      <PaymentReminderConfirmModal
        open={paymentReminderTarget !== null}
        memberLabel={
          paymentReminderTarget
            ? [paymentReminderTarget.firstName, paymentReminderTarget.lastName].filter(Boolean).join(' ') ||
              paymentReminderTarget.email ||
              null
            : null
        }
        submitting={paymentReminderSubmitting}
        error={paymentReminderError}
        onClose={() => {
          if (paymentReminderSubmitting) return
          setPaymentReminderTarget(null)
          setPaymentReminderError(null)
        }}
        onConfirm={async () => {
          if (!paymentReminderTarget) return
          setMemberActionError(null)
          setMemberActionNotice(null)
          setPaymentReminderSubmitting(true)
          setPaymentReminderError(null)
          try {
            await onSendPaymentReminder(paymentReminderTarget.applicationId)
            const recipient = paymentReminderTarget.email || 'the member'
            setMemberActionNotice(`Payment reminder email sent to ${recipient}.`)
            setPaymentReminderTarget(null)
          } catch (error) {
            setPaymentReminderError(
              error instanceof Error ? error.message : 'Could not send payment reminder email.',
            )
          } finally {
            setPaymentReminderSubmitting(false)
          }
        }}
      />
      <PresentReceivedConfirmModal
        open={presentReceivedTarget !== null}
        memberLabel={
          presentReceivedTarget
            ? [presentReceivedTarget.firstName, presentReceivedTarget.lastName].filter(Boolean).join(' ') ||
              presentReceivedTarget.email ||
              null
            : null
        }
        submitting={presentReceivedSubmitting}
        error={presentReceivedError}
        onClose={() => {
          if (presentReceivedSubmitting) return
          setPresentReceivedTarget(null)
          setPresentReceivedError(null)
        }}
        onConfirm={async () => {
          if (!presentReceivedTarget) return
          setMemberActionError(null)
          setMemberActionNotice(null)
          setPresentReceivedSubmitting(true)
          setPresentReceivedError(null)
          try {
            await onUpdatePresentReceived(presentReceivedTarget.applicationId, true)
            const recipient = presentReceivedTarget.email || 'the member'
            setMemberActionNotice(`Present received confirmation email sent to ${recipient}.`)
            setPresentReceivedTarget(null)
          } catch (error) {
            setPresentReceivedError(
              error instanceof Error ? error.message : 'Could not send present received email.',
            )
          } finally {
            setPresentReceivedSubmitting(false)
          }
        }}
      />
      <PurchasedMembershipConfirmModal
        open={purchasedMembershipTarget !== null}
        memberLabel={
          purchasedMembershipTarget
            ? [purchasedMembershipTarget.firstName, purchasedMembershipTarget.lastName].filter(Boolean).join(' ') ||
              purchasedMembershipTarget.email ||
              null
            : null
        }
        submitting={purchasedMembershipSubmitting}
        error={purchasedMembershipError}
        onClose={() => {
          if (purchasedMembershipSubmitting) return
          setPurchasedMembershipTarget(null)
          setPurchasedMembershipError(null)
        }}
        onConfirm={async () => {
          if (!purchasedMembershipTarget) return
          setMemberActionError(null)
          setMemberActionNotice(null)
          setPurchasedMembershipSubmitting(true)
          setPurchasedMembershipError(null)
          try {
            await onUpdateAdminMemberFlags(purchasedMembershipTarget.applicationId, { member: true })
            setMemberMuStatusDraftByApplicationId((prev) => ({
              ...prev,
              [purchasedMembershipTarget.applicationId]: 'activated',
            }))
            const recipient = purchasedMembershipTarget.email || 'the member'
            setMemberActionNotice(`Official membership confirmation email sent to ${recipient}.`)
            setPurchasedMembershipTarget(null)
          } catch (error) {
            setPurchasedMembershipError(
              error instanceof Error ? error.message : 'Could not send purchased membership email.',
            )
          } finally {
            setPurchasedMembershipSubmitting(false)
          }
        }}
      />
      <TicketDepositConfirmModal
        open={ticketDepositConfirmTarget !== null}
        requestLabel={
          ticketDepositConfirmTarget
            ? `${ticketDepositConfirmTarget.user.fullName ?? 'Member'} · ${formatFixtureMatchKeyLabel(ticketDepositConfirmTarget.matchKey)}`
            : null
        }
        submitting={ticketDepositConfirmSubmitting}
        error={ticketDepositConfirmError}
        onClose={() => {
          if (ticketDepositConfirmSubmitting) return
          setTicketDepositConfirmTarget(null)
          setTicketDepositConfirmError(null)
        }}
        onConfirm={async () => {
          if (!ticketDepositConfirmTarget) return
          setTicketActionError(null)
          setTicketActionNotice(null)
          setTicketDepositConfirmSubmitting(true)
          setTicketDepositConfirmError(null)
          try {
            await onUpdateTicketDepositConfirmed(ticketDepositConfirmTarget.id, true)
            const recipient = ticketDepositConfirmTarget.user.fullName || 'the member'
            setTicketActionNotice(`Deposit confirmation email sent to ${recipient}.`)
            setTicketDepositConfirmTarget(null)
          } catch (error) {
            setTicketDepositConfirmError(
              error instanceof Error ? error.message : 'Could not confirm deposit and send email.',
            )
          } finally {
            setTicketDepositConfirmSubmitting(false)
          }
        }}
      />
      <TicketConfirmModal
        open={ticketConfirmTarget !== null}
        requestLabel={
          ticketConfirmTarget
            ? `${ticketConfirmTarget.user.fullName ?? 'Member'} · ${formatFixtureMatchKeyLabel(ticketConfirmTarget.matchKey)}`
            : null
        }
        submitting={ticketConfirmSubmitting}
        error={ticketConfirmError}
        onClose={() => {
          if (ticketConfirmSubmitting) return
          setTicketConfirmTarget(null)
          setTicketConfirmError(null)
        }}
        onConfirm={async () => {
          if (!ticketConfirmTarget) return
          setTicketActionError(null)
          setTicketActionNotice(null)
          setTicketConfirmSubmitting(true)
          setTicketConfirmError(null)
          try {
            await onUpdateTicketConfirmed(ticketConfirmTarget.id)
            const recipient = ticketConfirmTarget.user.fullName || 'the member'
            setTicketActionNotice(`Ticket confirmed for ${recipient}.`)
            setTicketConfirmTarget(null)
          } catch (error) {
            setTicketConfirmError(
              error instanceof Error ? error.message : 'Could not confirm ticket.',
            )
          } finally {
            setTicketConfirmSubmitting(false)
          }
        }}
      />
      <TicketBalancePaymentConfirmModal
        open={ticketBalancePaymentTarget !== null}
        memberLabel={ticketBalancePaymentTarget?.request.user.fullName ?? null}
        matchLabel={
          ticketBalancePaymentTarget ? formatFixtureMatchKeyLabel(ticketBalancePaymentTarget.request.matchKey) : null
        }
        amountEur={ticketBalancePaymentTarget?.amountEur ?? null}
        paymentDeadline={ticketBalancePaymentTarget?.paymentDeadline ?? null}
        submitting={ticketBalancePaymentSubmitting}
        error={ticketBalancePaymentError}
        onClose={() => {
          if (ticketBalancePaymentSubmitting) return
          setTicketBalancePaymentTarget(null)
          setTicketBalancePaymentError(null)
        }}
        onConfirm={async () => {
          if (!ticketBalancePaymentTarget) return
          setTicketActionError(null)
          setTicketActionNotice(null)
          setTicketBalancePaymentSubmitting(true)
          setTicketBalancePaymentError(null)
          try {
            await onUpdateTicketBalancePayment(ticketBalancePaymentTarget.request.id, {
              balanceRemainingAmountEur: ticketBalancePaymentTarget.amountEur,
              balancePaymentDeadline: ticketBalancePaymentTarget.paymentDeadline,
              balancePaymentNotified: true,
            })
            const recipient = ticketBalancePaymentTarget.request.user.fullName || 'the member'
            setTicketActionNotice(`Ticket payment email sent to ${recipient}.`)
            setBalanceAmountDraftByRequestId((prev) => ({
              ...prev,
              [ticketBalancePaymentTarget.request.id]: ticketBalancePaymentTarget.amountEur.toFixed(2),
            }))
            setBalanceDeadlineDraftByRequestId((prev) => ({
              ...prev,
              [ticketBalancePaymentTarget.request.id]: formatTicketBalancePaymentDeadlineForInput(
                ticketBalancePaymentTarget.paymentDeadline,
              ),
            }))
            setTicketBalancePaymentTarget(null)
          } catch (error) {
            setTicketBalancePaymentError(
              error instanceof Error ? error.message : 'Could not send ticket payment email.',
            )
          } finally {
            setTicketBalancePaymentSubmitting(false)
          }
        }}
      />
    </div>
  )
}

type Mode = 'sign-in' | 'create-account' | 'forgot-password'
type ActivePage =
  | 'home'
  | 'board'
  | 'contact'
  | 'news'
  | 'social'
  | 'mycmusc'
  | 'official-membership'
  | 'tickets'
  | 'merchandise'

function pageFromPath(pathname: string): ActivePage {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/board') return 'board'
  if (clean === '/contact') return 'contact'
  if (clean === '/news') return 'news'
  if (clean === '/social') return 'social'
  if (clean === '/mycmusc') return 'mycmusc'
  if (clean === '/official-membership' || clean === '/official-memberships') return 'official-membership'
  if (clean === '/tickets') return 'tickets'
  if (clean === '/merchandise') return 'merchandise'
  return 'home'
}

function pathFromPage(page: ActivePage): string {
  if (page === 'board') return '/board'
  if (page === 'contact') return '/contact'
  if (page === 'news') return '/news'
  if (page === 'social') return '/social'
  if (page === 'mycmusc') return '/mycmusc'
  if (page === 'official-membership') return '/official-membership'
  if (page === 'tickets') return '/tickets'
  if (page === 'merchandise') return '/merchandise'
  return '/'
}

function IconCalendar() {
  return (
    <svg className="top-bar-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg className="top-bar-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M16 16l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function IconSocialGlobe({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M3 12h18M12 3c2.8 3.8 2.8 14.2 0 18M12 3c-2.8 3.8-2.8 14.2 0 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconSocialInstagram({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="3.75" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17.25" cy="6.75" r="1.25" fill="currentColor" />
    </svg>
  )
}

function IconSocialFacebook({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M24 12.073C24 5.446 18.627 0 12 0S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  )
}

function IconSocialTikTok({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.17-3.63-5.71-.02-.5-.01-1.01-.01-1.51V8.9c0-.02 0-.03.01-.05 1.43.02 2.85-.12 4.27-.36 1.52-.28 3.07-.89 4.26-1.92.71-.59 1.25-1.35 1.62-2.18z" />
    </svg>
  )
}

function ClubLogoMark({ className }: { className?: string }) {
  return <img src={clubLogo} className={className} alt="Cyprus Manchester United Supporters Club logo" />
}

function formatFixtureKickoff(iso: string): string {
  const dt = new Date(iso)
  return dt.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDisplayName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
  if (!cleaned) return ''
  return cleaned
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(' ')
}

function parseDateOfBirthInput(input: string): Date | null {
  const raw = input.trim()
  if (!raw) return null

  const isoLike = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (isoLike) {
    const y = Number(isoLike[1])
    const m = Number(isoLike[2])
    const d = Number(isoLike[3])
    const dob = new Date(y, m - 1, d, 12, 0, 0, 0)
    if (dob.getFullYear() === y && dob.getMonth() === m - 1 && dob.getDate() === d) return dob
    return null
  }

  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(raw)
  if (dmy) {
    const d = Number(dmy[1])
    const m = Number(dmy[2])
    const y = Number(dmy[3])
    const dob = new Date(y, m - 1, d, 12, 0, 0, 0)
    if (dob.getFullYear() === y && dob.getMonth() === m - 1 && dob.getDate() === d) return dob
    return null
  }

  return null
}

const DATE_OF_BIRTH_MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** Display and export: DD-Mon-YYYY (e.g. 15-Jan-1990). Returns empty string when unknown/blank. */
function formatDateOfBirthDisplay(raw: string): string {
  const value = raw.trim()
  if (!value) return ''

  const parsedFromInput = parseDateOfBirthInput(value)
  const parsed =
    parsedFromInput ??
    (() => {
      const parsedIso = new Date(value)
      return Number.isNaN(parsedIso.getTime()) ? null : parsedIso
    })()

  if (!parsed) return value

  const dd = String(parsed.getDate()).padStart(2, '0')
  const month = DATE_OF_BIRTH_MONTH_SHORT[parsed.getMonth()]
  const yyyy = String(parsed.getFullYear())
  return `${dd}-${month}-${yyyy}`
}

/** Normalise stored DOB to yyyy-mm-dd for date inputs. */
function dateOfBirthToDateInputValue(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const parsed = parseDateOfBirthInput(trimmed)
  if (parsed) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)
  return iso ? iso[1] : ''
}

function isOldTraffordHomeFixture(f: UpcomingFixture): boolean {
  if (!f.home) return false
  const venue = f.venue.toLowerCase()
  return venue.includes('old trafford') || venue.includes('manchester')
}

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  if (typeof window === 'undefined') return
  const body = rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n')
  const csv = `\uFEFF${headers.join(',')}\n${body}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function App() {
  const isAdminRoute = useAdminRoute()
  useWebAppManifest(isAdminRoute)
  const {
    configured,
    loading: authLoading,
    session,
    user,
    isAdmin,
    refreshAdminStatus,
    signIn,
    signUp,
    verifyEmail,
    resendVerificationEmail,
    resetPasswordForEmail,
    updatePasswordAfterRecovery,
    signOut,
  } = useAuth()
  const [activePage, setActivePage] = useState<ActivePage>(() =>
    typeof window === 'undefined' ? 'home' : pageFromPath(window.location.pathname),
  )
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [fixturesFeed, setFixturesFeed] = useState<UpcomingFixture[]>([])
  const [fixturesLoading, setFixturesLoading] = useState(false)
  const [fixturesError, setFixturesError] = useState<string | null>(null)
  const [fixturesUpdatedAt, setFixturesUpdatedAt] = useState<string | null>(null)
  const [ticketWindowByKey, setTicketWindowByKey] = useState<Record<string, FixtureTicketWindowStatus>>({})
  const [ticketWindowDetailsByKey, setTicketWindowDetailsByKey] = useState<
    Record<string, { maxTickets: number | null; activeRequestCount: number }>
  >({})
  const [myTicketRequestByKey, setMyTicketRequestByKey] = useState<Record<string, MyFixtureTicketRequest>>({})
  const [ticketBusyKey, setTicketBusyKey] = useState<string | null>(null)

  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [membershipRecord, setMembershipRecord] = useState<MemberRegistryEntry | null>(null)
  const [myProfile, setMyProfile] = useState<MyProfileRow | null>(null)
  const [membershipLoading, setMembershipLoading] = useState(false)
  const [memberRegistry, setMemberRegistry] = useState<MemberRegistryEntry[]>([])
  const [adminMerchandiseOrders, setAdminMerchandiseOrders] = useState<MerchandiseOrderRow[]>([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [pendingRenewals, setPendingRenewals] = useState<PendingRenewalListRow[]>([])
  const [pendingTicketRequests, setPendingTicketRequests] = useState<AdminFixtureTicketRequest[]>([])
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([])
  const [adminUsersLoading, setAdminUsersLoading] = useState(false)
  const [officialOffers, setOfficialOffers] = useState<OfficialMembershipOffer[]>([])
  const [officialOffersLoading, setOfficialOffersLoading] = useState(false)
  const [myOfficialRequests, setMyOfficialRequests] = useState<OfficialMembershipRequest[]>([])
  const [adminOfficialRequests, setAdminOfficialRequests] = useState<AdminOfficialMembershipRequest[]>([])
  const [adminOfficialRequestsLoading, setAdminOfficialRequestsLoading] = useState(false)
  const [newsPosts, setNewsPosts] = useState<NewsPost[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsDetailPost, setNewsDetailPost] = useState<NewsPost | null>(null)
  const [showCyprusMembershipForm, setShowCyprusMembershipForm] = useState(false)
  const [showFamilyMemberForm, setShowFamilyMemberForm] = useState(false)
  const [familyMembers, setFamilyMembers] = useState<MemberRegistryEntry[]>([])
  const [officialMembershipApplicationId, setOfficialMembershipApplicationId] = useState<string | null>(null)
  const [familyPendingRecord, setFamilyPendingRecord] = useState<MemberRegistryEntry | null>(null)
  const [familyDetailApplicationId, setFamilyDetailApplicationId] = useState<string | null>(null)
  const [familyEditApplicationId, setFamilyEditApplicationId] = useState<string | null>(null)
  const [familyEditSaving, setFamilyEditSaving] = useState(false)
  const [familyEditError, setFamilyEditError] = useState<string | null>(null)
  const [familyEditFirstName, setFamilyEditFirstName] = useState('')
  const [familyEditLastName, setFamilyEditLastName] = useState('')
  const [familyEditMobilePhone, setFamilyEditMobilePhone] = useState('')
  const [familyEditDateOfBirth, setFamilyEditDateOfBirth] = useState('')
  const [familyEditAddress, setFamilyEditAddress] = useState('')
  const [familyEditArea, setFamilyEditArea] = useState('')
  const [familyEditPostalCode, setFamilyEditPostalCode] = useState('')
  const [familyEditCity, setFamilyEditCity] = useState('')
  const [familyEditCountry, setFamilyEditCountry] = useState('')
  const [familyEditRelationship, setFamilyEditRelationship] = useState('')
  const [familyEditRelationshipOther, setFamilyEditRelationshipOther] = useState('')
  const [familyEditOfficialMuId, setFamilyEditOfficialMuId] = useState('')
  const [familyEditOfficialMuStatus, setFamilyEditOfficialMuStatus] = useState<OfficialMuMembershipFormStatus>('')
  const [ticketFormOpen, setTicketFormOpen] = useState(false)
  const [ticketFormFixture, setTicketFormFixture] = useState<UpcomingFixture | null>(null)
  const [ticketFormSubmitting, setTicketFormSubmitting] = useState(false)
  const [ticketFormSubmittedByKey, setTicketFormSubmittedByKey] = useState<Record<string, boolean>>({})
  const [ticketRequestConfirmFixture, setTicketRequestConfirmFixture] = useState<UpcomingFixture | null>(null)
  const [ticketRequestConfirmSubmitting, setTicketRequestConfirmSubmitting] = useState(false)
  const [ticketRequestConfirmError, setTicketRequestConfirmError] = useState<string | null>(null)
  const [ticketDepositPaymentFixture, setTicketDepositPaymentFixture] = useState<UpcomingFixture | null>(null)
  const [pendingTicketDepositSlotCount, setPendingTicketDepositSlotCount] = useState<number | null>(null)
  const [ticketBalancePaymentFixture, setTicketBalancePaymentFixture] = useState<UpcomingFixture | null>(null)
  const [ticketCancelConfirmFixture, setTicketCancelConfirmFixture] = useState<UpcomingFixture | null>(null)
  const [ticketCancelConfirmSubmitting, setTicketCancelConfirmSubmitting] = useState(false)
  const [ticketCancelConfirmError, setTicketCancelConfirmError] = useState<string | null>(null)
  const [myPendingRenewal, setMyPendingRenewal] = useState<DbRenewalRequest | null>(null)
  const [renewalModalOpen, setRenewalModalOpen] = useState(false)
  const [renewalSubmitting, setRenewalSubmitting] = useState(false)
  const [renewalSubmitError, setRenewalSubmitError] = useState<string | null>(null)
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('')
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [recoverySubmitting, setRecoverySubmitting] = useState(false)
  const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [resendVerificationSubmitting, setResendVerificationSubmitting] = useState(false)
  const adminStatusCheckedRef = useRef(false)
  const [merchProducts, setMerchProducts] = useState<MerchandiseProduct[]>([])
  const [merchLoading, setMerchLoading] = useState(false)
  const [merchView, setMerchView] = useState<'shop' | 'checkout'>('shop')
  const [merchCart, setMerchCart] = useState<Record<string, number>>({})
  const [merchDeliveryBranch, setMerchDeliveryBranch] = useState('')
  const [merchOrderSubmitting, setMerchOrderSubmitting] = useState(false)
  const [merchOrderMessage, setMerchOrderMessage] = useState<string | null>(null)
  const [merchMyOrders, setMerchMyOrders] = useState<MerchandiseOrderRow[]>([])
  const [merchOrdersLoading, setMerchOrdersLoading] = useState(false)
  const [detailsEditOpen, setDetailsEditOpen] = useState(false)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsFullName, setDetailsFullName] = useState('')
  const [detailsMobilePhone, setDetailsMobilePhone] = useState('')
  const [detailsAddress, setDetailsAddress] = useState('')
  const [detailsArea, setDetailsArea] = useState('')
  const [detailsPostalCode, setDetailsPostalCode] = useState('')
  const [detailsCity, setDetailsCity] = useState('')
  const [detailsCountry, setDetailsCountry] = useState('')
  const [detailsOfficialMuId, setDetailsOfficialMuId] = useState('')
  const [detailsOfficialMuStatus, setDetailsOfficialMuStatus] = useState<OfficialMuMembershipFormStatus>('')

  const openPage = useCallback(
    (page: ActivePage, opts?: { resetSearch?: boolean; resetFixtures?: boolean }) => {
      if (opts?.resetSearch ?? true) setSearchOpen(false)
      setMobileMoreOpen(false)
      setActivePage(page)
      if (!isAdminRoute && typeof window !== 'undefined') {
        const path = pathFromPage(page)
        if (window.location.pathname !== path) {
          window.history.pushState({}, '', path)
        }
      }
    },
    [isAdminRoute],
  )

  const isMembershipActive = membershipRecord?.status === 'active'
  const isMembershipPending = membershipRecord?.status === 'pending'
  const officialMembershipFamilyMember = useMemo(() => {
    if (!officialMembershipApplicationId || !membershipRecord) return null
    if (officialMembershipApplicationId === membershipRecord.applicationId) return null
    return familyMembers.find((fm) => fm.applicationId === officialMembershipApplicationId) ?? null
  }, [officialMembershipApplicationId, membershipRecord, familyMembers])
  /** Match ticket requests are available only to active members. */
  const showMatchTickets = Boolean(user?.id && isMembershipActive)
  /** Merchandise is available to any signed-in user. */
  const showMerchandise = Boolean(user?.id)
  const mobileMoreActive =
    activePage === 'board' ||
    activePage === 'merchandise' ||
    activePage === 'contact' ||
    activePage === 'official-membership'
  const welcomeFirstName =
    myProfile?.fullName?.trim().split(/\s+/)[0] ||
    user?.email?.split('@')[0] ||
    'Member'
  const fixturesSource = fixturesFeed
  const upcomingFixtures = fixturesSource
    .filter((m) => new Date(m.kickoffIso).getTime() >= Date.now())
    .sort((a, b) => new Date(a.kickoffIso).getTime() - new Date(b.kickoffIso).getTime())
  const ticketFixtures = upcomingFixtures.filter((f) => isOldTraffordHomeFixture(f))

  const loadFixturesFromCache = useCallback(async () => {
    const { fixtures, updatedAt, error } = await fetchCachedFixtures()
    if (error) {
      setFixturesError('Could not load shared fixtures. Showing fallback list.')
      return
    }
    setFixturesFeed(fixtures)
    setFixturesUpdatedAt(updatedAt)
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    void loadFixturesFromCache()
  }, [session?.user?.id, loadFixturesFromCache])

  const refreshFixtureTicketStates = useCallback(async () => {
    if (!user?.id) return
    const keys = upcomingFixtures.map(fixtureMatchKey)
    if (keys.length === 0) {
      setTicketWindowByKey({})
      setTicketWindowDetailsByKey({})
      setMyTicketRequestByKey({})
      return
    }
    const [windowsRes, myReqRes] = await Promise.all([
      fetchFixtureTicketWindows(keys),
      fetchMyFixtureTicketRequests(keys, user.id),
    ])
    if (windowsRes.error) {
      console.error(windowsRes.error)
    } else {
      const next: Record<string, FixtureTicketWindowStatus> = {}
      const nextDetails: Record<string, { maxTickets: number | null; activeRequestCount: number }> = {}
      for (const r of windowsRes.rows) {
        next[r.matchKey] = r.requestStatus
        nextDetails[r.matchKey] = {
          maxTickets: r.maxTickets,
          activeRequestCount: r.activeRequestCount,
        }
      }
      setTicketWindowByKey(next)
      setTicketWindowDetailsByKey(nextDetails)
    }
    if (myReqRes.error) {
      console.error(myReqRes.error)
    } else {
      const next: Record<string, MyFixtureTicketRequest> = {}
      for (const r of myReqRes.rows) next[r.matchKey] = r
      setMyTicketRequestByKey(next)
    }
  }, [upcomingFixtures, user?.id])

  useEffect(() => {
    if (!showMatchTickets && !(isAdminRoute && isAdmin)) {
      setTicketWindowByKey({})
      setTicketWindowDetailsByKey({})
      setMyTicketRequestByKey({})
      return
    }
    void refreshFixtureTicketStates()
  }, [refreshFixtureTicketStates, showMatchTickets, isAdminRoute, isAdmin])

  const refreshFixtures = useCallback(async () => {
    if (!isAdmin) {
      setFixturesError('Only admin users can refresh fixtures for everyone.')
      return
    }
    setFixturesLoading(true)
    setFixturesError(null)
    const { error } = await syncFixturesFromManutd()
    if (error) {
      setFixturesError(`Could not refresh fixtures live right now: ${error.message}`)
      setFixturesLoading(false)
      return
    }
    await loadFixturesFromCache()
    setFixturesLoading(false)
  }, [isAdmin, loadFixturesFromCache])

  async function setFixtureTicketStatus(fixture: UpcomingFixture, status: FixtureTicketWindowStatus) {
    if (!isAdmin) return
    setTicketBusyKey(fixtureMatchKey(fixture))
    const { error } = await upsertFixtureTicketWindow(fixture, status, user?.id ?? null)
    setTicketBusyKey(null)
    if (error) {
      setFixturesError(`Could not update ticket status: ${error.message}`)
      return
    }
    await refreshFixtureTicketStates()
  }

  async function setFixtureTicketMaxTickets(fixture: UpcomingFixture, maxTickets: number | null) {
    const { data, error } = await updateFixtureTicketWindowMaxTickets(fixture, maxTickets)
    if (error) throw new Error(error.message)
    if (data) {
      const key = fixtureMatchKey(fixture)
      setTicketWindowByKey((prev) => ({ ...prev, [key]: data.requestStatus }))
      setTicketWindowDetailsByKey((prev) => ({
        ...prev,
        [key]: {
          maxTickets: data.maxTickets,
          activeRequestCount: data.activeRequestCount,
        },
      }))
    }
    await refreshFixtureTicketStates()
  }

  async function confirmTicketRequestAndOpenPayment(travelCompanionMembershipNumbers: number[]) {
    if (!ticketRequestConfirmFixture || !user?.id) return
    const fixture = ticketRequestConfirmFixture
    const key = fixtureMatchKey(fixture)
    setTicketRequestConfirmSubmitting(true)
    setTicketRequestConfirmError(null)
    setTicketBusyKey(key)
    const { ticketSlotCount, error } = await requestFixtureTicket(key, user.id, { travelCompanionMembershipNumbers })
    setTicketBusyKey(null)
    setTicketRequestConfirmSubmitting(false)
    if (error) {
      setTicketRequestConfirmError(error.message)
      return
    }
    const resolvedSlotCount = ticketSlotCount ?? 1 + travelCompanionMembershipNumbers.length
    setPendingTicketDepositSlotCount(resolvedSlotCount)
    await refreshFixtureTicketStates()
    setTicketRequestConfirmFixture(null)
    setTicketDepositPaymentFixture(fixture)
  }

  function resolveTicketDepositSlotCount(fixture: UpcomingFixture | null): number {
    if (!fixture) return 1
    const key = fixtureMatchKey(fixture)
    return myTicketRequestByKey[key]?.ticketSlotCount ?? pendingTicketDepositSlotCount ?? 1
  }

  function openTicketDepositPayment(fixture: UpcomingFixture) {
    setTicketDepositPaymentFixture(fixture)
  }

  function closeTicketDepositPayment() {
    setTicketDepositPaymentFixture(null)
    setPendingTicketDepositSlotCount(null)
  }

  function openTicketBalancePayment(fixture: UpcomingFixture) {
    setTicketBalancePaymentFixture(fixture)
  }

  function closeTicketBalancePayment() {
    setTicketBalancePaymentFixture(null)
  }

  async function confirmCancelTicketRequest() {
    if (!ticketCancelConfirmFixture || !user?.id) return
    const key = fixtureMatchKey(ticketCancelConfirmFixture)
    setTicketCancelConfirmSubmitting(true)
    setTicketCancelConfirmError(null)
    setTicketBusyKey(key)
    const { error } = await cancelMyFixtureTicketRequest(key, user.id)
    setTicketBusyKey(null)
    setTicketCancelConfirmSubmitting(false)
    if (error) {
      setTicketCancelConfirmError(error.message)
      return
    }
    setTicketCancelConfirmFixture(null)
    await refreshFixtureTicketStates()
  }

  function openTicketCompletionForm(fixture: UpcomingFixture) {
    setTicketFormFixture(fixture)
    setTicketFormOpen(true)
  }

  function closeTicketCompletionForm() {
    setTicketFormOpen(false)
    setTicketFormFixture(null)
  }

  async function submitTicketCompletionForm() {
    if (!ticketFormFixture) return
    const key = fixtureMatchKey(ticketFormFixture)
    setTicketFormSubmitting(true)
    if (user?.id) {
      const { error } = await completeMyAcceptedTicketRequest(key, user.id)
      if (error) {
        setFixturesError(`Could not submit ticket form: ${error.message}`)
        setTicketFormSubmitting(false)
        return
      }
    }
    setTicketFormSubmittedByKey((prev) => ({ ...prev, [key]: true }))
    setTicketFormSubmitting(false)
    closeTicketCompletionForm()
    await refreshFixtureTicketStates()
    if (isAdmin) await loadAdminRegistry()
  }

  async function applyApproveTicketRequest(row: AdminFixtureTicketRequest) {
    const { error } = await setFixtureTicketRequestStatus(row.id, 'approved')
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
  }

  async function applyCompleteTicketRequest(row: AdminFixtureTicketRequest) {
    const { error } = await setFixtureTicketRequestStatus(row.id, 'completed')
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
  }

  async function applyCancelTicketRequest(row: AdminFixtureTicketRequest) {
    const { error } = await setFixtureTicketRequestStatus(row.id, 'cancelled')
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
  }

  async function applyUpdateTicketDepositConfirmed(requestId: string, depositConfirmed: boolean) {
    const { error } = await updateFixtureTicketRequestDepositConfirmed(requestId, depositConfirmed)
    if (error) throw new Error(error.message)
    await refreshTicketRequestsOnly()
  }

  async function applyUpdateTicketBalancePayment(
    requestId: string,
    options: {
      balanceRemainingAmountEur: number
      balancePaymentDeadline?: string
      balancePaymentNotified: boolean
    },
  ) {
    const { error } = await updateFixtureTicketRequestBalancePayment(requestId, options)
    if (error) throw new Error(error.message)
    await refreshTicketRequestsOnly()
  }

  async function applyUpdateTicketConfirmed(requestId: string) {
    const { error } = await updateFixtureTicketRequestTicketConfirmed(requestId)
    if (error) throw new Error(error.message)
    await refreshTicketRequestsOnly()
  }

  async function refreshTicketRequestsOnly() {
    const { rows, error } = await fetchPendingFixtureTicketRequests()
    if (error) throw new Error(error.message)
    setPendingTicketRequests(rows)
  }

  async function applyUpdateMerchandiseOrderStatus(orderId: string, status: MerchandiseOrderStatus) {
    const { error } = await updateMerchandiseOrderStatus(orderId, status)
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
  }

  async function applyCreateNews(payload: NewsPostPayload) {
    const { error } = await insertNewsPost(payload, user?.id ?? null)
    if (error) throw new Error(error.message)
    await loadAdminNewsPosts()
  }

  async function applyUpdateNews(id: string, payload: NewsPostPayload) {
    const { error } = await updateNewsPost(id, payload, user?.id ?? null)
    if (error) throw new Error(error.message)
    await loadAdminNewsPosts()
  }

  async function applyDeleteNews(id: string) {
    const { error } = await deleteNewsPost(id)
    if (error) throw new Error(error.message)
    await loadAdminNewsPosts()
  }

  const refreshMyMembership = useCallback(async () => {
    if (!user?.id) {
      setMembershipRecord(null)
      setMyProfile(null)
      setMyPendingRenewal(null)
      return
    }
    setMembershipLoading(true)
    const [{ row, error }, profileRes] = await Promise.all([
      fetchMyLatestApplication(user.id),
      fetchMyProfile(user.id),
    ])
    if (profileRes.profile) {
      setMyProfile(profileRes.profile)
    } else if (profileRes.error) {
      console.error(profileRes.error)
      setMyProfile(null)
    } else {
      setMyProfile(null)
    }
    if (error) {
      console.error(error)
      setMembershipRecord(null)
      setMyPendingRenewal(null)
      setMembershipLoading(false)
      return
    }
    if (!row) {
      setMembershipRecord(null)
      setMyPendingRenewal(null)
      setMembershipLoading(false)
      return
    }
    setMembershipRecord(dbRowToMemberEntry(row))
    if (row.status === 'active') {
      const { row: pendingRow, error: pErr } = await fetchMyPendingRenewal(row.application_id)
      if (pErr) console.error(pErr)
      setMyPendingRenewal(pendingRow)
      const { rows: familyRows, error: familyErr } = await fetchMyFamilyMembers(row.application_id)
      if (familyErr) console.error(familyErr)
      setFamilyMembers(familyRows)
    } else {
      setMyPendingRenewal(null)
      setFamilyMembers([])
    }
    setMembershipLoading(false)
  }, [user?.id])

  useEffect(() => {
    void refreshMyMembership()
  }, [refreshMyMembership])

  const loadNewsPosts = useCallback(async () => {
    const { rows, error } = await fetchNewsPosts()
    if (error) {
      console.error(error)
      setNewsPosts([])
      return
    }
    setNewsPosts(rows)
  }, [])

  const loadAdminNewsPosts = useCallback(async () => {
    setNewsLoading(true)
    const { rows, error } = await fetchAdminNewsPosts()
    setNewsLoading(false)
    if (error) {
      console.error(error)
      setNewsPosts([])
      return
    }
    setNewsPosts(rows)
  }, [])

  const loadMerchandiseProducts = useCallback(async () => {
    setMerchLoading(true)
    const { rows, error } = await fetchMerchandiseProducts()
    setMerchLoading(false)
    if (error) {
      console.error(error)
      setMerchProducts([])
      return
    }
    setMerchProducts(rows)
  }, [])

  const loadMyMerchandiseOrders = useCallback(async () => {
    if (!user?.id) {
      setMerchMyOrders([])
      return
    }
    setMerchOrdersLoading(true)
    const { rows, error } = await fetchMyMerchandiseOrders(user.id)
    setMerchOrdersLoading(false)
    if (error) {
      console.error(error)
      setMerchMyOrders([])
      return
    }
    setMerchMyOrders(rows)
  }, [user?.id])

  const loadOfficialOffers = useCallback(async () => {
    if (!session?.user?.id) {
      setOfficialOffers([])
      setOfficialOffersLoading(false)
      return
    }
    setOfficialOffersLoading(true)
    const { rows, error } = await fetchOfficialMembershipOffers()
    setOfficialOffersLoading(false)
    if (error) {
      console.error(error)
      setOfficialOffers([])
      return
    }
    setOfficialOffers(rows)
  }, [session?.user?.id])

  const loadMyOfficialRequests = useCallback(async () => {
    if (!session?.user?.id) {
      setMyOfficialRequests([])
      return
    }
    const { rows, error } = await fetchMyOfficialMembershipRequests()
    if (error) {
      console.error(error)
      setMyOfficialRequests([])
      return
    }
    setMyOfficialRequests(rows)
  }, [session?.user?.id])

  const loadAdminOfficialRequests = useCallback(async () => {
    setAdminOfficialRequestsLoading(true)
    const { rows, error } = await fetchAdminOfficialMembershipRequests()
    setAdminOfficialRequestsLoading(false)
    if (error) {
      console.error(error)
      setAdminOfficialRequests([])
      return
    }
    setAdminOfficialRequests(rows)
  }, [])

  async function applyCreateMerchandiseProductFromAdmin(payload: {
    title: string
    priceEur: number
    photos: string[]
  }) {
    const { error } = await insertMerchandiseProduct({
      title: payload.title,
      priceEur: payload.priceEur,
      photos: payload.photos,
      userId: user?.id ?? null,
    })
    if (error) throw new Error(error.message)
    await loadMerchandiseProducts()
  }

  async function applyDeleteMerchandiseProductFromAdmin(id: string) {
    const { error } = await deleteMerchandiseProduct(id)
    if (error) throw new Error(error.message)
    setMerchCart((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    await loadMerchandiseProducts()
  }

  async function applyUpdateMerchandiseProductFromAdmin(
    id: string,
    payload: { title: string; priceEur: number; photos?: string[] },
  ) {
    const { error } = await updateMerchandiseProduct(id, payload)
    if (error) throw new Error(error.message)
    await loadMerchandiseProducts()
  }

  async function applyReorderMerchandiseProductsFromAdmin(ids: string[]) {
    const { error } = await reorderMerchandiseProducts(ids)
    if (error) throw new Error(error.message)
    await loadMerchandiseProducts()
  }

  async function applyCreateAdminUser(email: string) {
    const { error } = await createAdminUser(email)
    if (error) {
      window.alert(error.message)
      return
    }
    const refreshed = await fetchAdminUsers()
    if (!refreshed.error) setAdminUsers(refreshed.rows)
  }

  async function applyDeleteAdminUser(email: string) {
    const yes = window.confirm(`Remove admin access for ${email}?`)
    if (!yes) return
    const { error } = await deleteAdminUser(email)
    if (error) {
      window.alert(error.message)
      return
    }
    const refreshed = await fetchAdminUsers()
    if (!refreshed.error) setAdminUsers(refreshed.rows)
  }

  async function applyCreateOfficialOffer(payload: { title: string; priceEur: number; imageUrl: string }) {
    const { error } = await createOfficialMembershipOffer(payload)
    if (error) throw error
    const refreshed = await fetchOfficialMembershipOffers()
    if (!refreshed.error) setOfficialOffers(refreshed.rows)
  }

  async function applyDeleteOfficialOffer(id: string) {
    const { error } = await deleteOfficialMembershipOffer(id)
    if (error) throw error
    const refreshed = await fetchOfficialMembershipOffers()
    if (!refreshed.error) setOfficialOffers(refreshed.rows)
  }

  async function applyUpdateOfficialOffer(id: string, payload: { title: string; priceEur: number; imageUrl?: string }) {
    const { error } = await updateOfficialMembershipOffer(id, payload)
    if (error) throw error
    const refreshed = await fetchOfficialMembershipOffers()
    if (!refreshed.error) setOfficialOffers(refreshed.rows)
  }

  async function applyReorderOfficialOffers(ids: string[]) {
    const { error } = await reorderOfficialMembershipOffers(ids)
    if (error) throw error
    const refreshed = await fetchOfficialMembershipOffers()
    if (!refreshed.error) setOfficialOffers(refreshed.rows)
  }

  async function applySetOfficialRequestStatus(
    requestId: string,
    status: 'pending' | 'completed' | 'rejected' | 'cancelled',
    options?: {
      officialMuMembershipId?: string
      officialMuMembershipStatus?: OfficialMuMembershipStatus
    },
  ) {
    const { error } = await setAdminOfficialMembershipRequestStatus(requestId, status, options)
    if (error) throw error
    await loadAdminOfficialRequests()
    await loadAdminRegistry()
    await refreshMyMembership()
  }

  async function applyDeleteOfficialRequest(requestId: string) {
    const { error } = await deleteAdminOfficialMembershipRequest(requestId)
    if (error) throw error
    await loadAdminOfficialRequests()
    await loadMyOfficialRequests()
  }

  const merchCartLines = useMemo(() => {
    const lines: MerchandiseOrderLine[] = []
    for (const p of merchProducts) {
      const qty = merchCart[p.id] ?? 0
      if (qty > 0) {
        lines.push({
          productId: p.id,
          title: p.title,
          unitPriceEur: p.priceEur,
          quantity: qty,
        })
      }
    }
    return lines
  }, [merchProducts, merchCart])

  const merchCartTotal = useMemo(
    () => merchCartLines.reduce((sum, l) => sum + l.unitPriceEur * l.quantity, 0),
    [merchCartLines],
  )

  const merchCartCount = useMemo(() => merchCartLines.reduce((n, l) => n + l.quantity, 0), [merchCartLines])

  async function submitMerchandiseOrder() {
    setMerchOrderMessage(null)
    if (!user?.id) {
      setMerchOrderMessage('You must be signed in to place an order.')
      return
    }
    if (merchCartLines.length === 0) {
      setMerchOrderMessage('Your basket is empty.')
      return
    }
    const branch = merchDeliveryBranch.trim()
    if (!branch) {
      setMerchOrderMessage('Please enter your ACS / Akis Express branch or locker details.')
      return
    }
    setMerchOrderSubmitting(true)
    const { error } = await insertMerchandiseOrder({
      userId: user.id,
      lines: merchCartLines,
      totalEur: merchCartTotal,
      deliveryBranch: branch,
    })
    setMerchOrderSubmitting(false)
    if (error) {
      setMerchOrderMessage(error.message)
      return
    }
    setMerchCart({})
    setMerchDeliveryBranch('')
    setMerchView('shop')
    setMerchOrderMessage('Order submitted. The committee will confirm payment before dispatch.')
    await loadMyMerchandiseOrders()
  }

  // news_posts RLS requires a signed-in user; refetch when session appears (first load on login screen returns empty).
  useEffect(() => {
    if (!session?.user?.id) {
      setNewsPosts([])
      setNewsLoading(false)
      return
    }
    if (isAdminRoute && isAdmin) {
      void loadAdminNewsPosts()
      return
    }
    void loadNewsPosts()
  }, [session?.user?.id, isAdminRoute, isAdmin, loadNewsPosts, loadAdminNewsPosts])

  useEffect(() => {
    if (!session?.user?.id) {
      setMerchProducts([])
      setMerchMyOrders([])
      setMerchCart({})
      setMerchView('shop')
      return
    }
    if ((activePage === 'merchandise' && showMerchandise) || (isAdminRoute && isAdmin)) {
      void loadMerchandiseProducts()
      if (!isAdminRoute) void loadMyMerchandiseOrders()
    }
  }, [
    activePage,
    session?.user?.id,
    loadMerchandiseProducts,
    loadMyMerchandiseOrders,
    showMerchandise,
    isAdminRoute,
    isAdmin,
  ])

  useEffect(() => {
    void loadOfficialOffers()
  }, [loadOfficialOffers])

  useEffect(() => {
    void loadMyOfficialRequests()
  }, [loadMyOfficialRequests])

  useEffect(() => {
    if (activePage !== 'merchandise') {
      setMerchView('shop')
      setMerchOrderMessage(null)
    }
  }, [activePage])

  useEffect(() => {
    if (showMatchTickets) return
    setTicketFormOpen(false)
    setTicketFormFixture(null)
    setTicketBusyKey(null)
    if (activePage === 'merchandise' || activePage === 'tickets') openPage('home')
  }, [showMatchTickets, activePage, openPage])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const resetTok = params.get('resetPasswordToken')?.trim()
    if (resetTok) {
      setPasswordResetToken(resetTok)
      params.delete('resetPasswordToken')
      const next = params.toString()
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', nextUrl)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const verifyToken = params.get('verifyEmailToken')?.trim()
    if (!verifyToken) return
    void (async () => {
      const { error } = await verifyEmail(verifyToken)
      if (error) {
        setMessage(error.message)
      } else {
        setMode('sign-in')
        setMessage('Email verified successfully. You can now sign in.')
      }
      params.delete('verifyEmailToken')
      const next = params.toString()
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', nextUrl)
    })()
  }, [verifyEmail])

  const loadAdminRegistry = useCallback(async () => {
    if (!isAdmin) return
    setRegistryLoading(true)
    setAdminUsersLoading(true)
    setOfficialOffersLoading(true)
    const [{ rows, error }, renewRes, ticketRes, merchRes, adminsRes, officialRes] = await Promise.all([
      fetchAllMembershipApplications(),
      fetchPendingRenewalRequests(),
      fetchPendingFixtureTicketRequests(),
      fetchAllMerchandiseOrders(),
      fetchAdminUsers(),
      fetchOfficialMembershipOffers(),
    ])
    setRegistryLoading(false)
    setAdminUsersLoading(false)
    setOfficialOffersLoading(false)
    if (error) {
      console.error(error)
      setMemberRegistry([])
    } else {
      setMemberRegistry(rows.map(dbRowToMemberEntry))
    }
    if (renewRes.error) {
      console.error(renewRes.error)
      setPendingRenewals([])
    } else {
      setPendingRenewals(renewRes.rows)
    }
    if (ticketRes.error) {
      console.error(ticketRes.error)
      setPendingTicketRequests([])
    } else {
      setPendingTicketRequests(ticketRes.rows)
    }
    if (merchRes.error) {
      console.error(merchRes.error)
      setAdminMerchandiseOrders([])
    } else {
      setAdminMerchandiseOrders(merchRes.rows)
    }
    if (adminsRes.error) {
      console.error(adminsRes.error)
      setAdminUsers([])
    } else {
      setAdminUsers(adminsRes.rows)
    }
    if (officialRes.error) {
      console.error(officialRes.error)
      setOfficialOffers([])
    } else {
      setOfficialOffers(officialRes.rows)
    }
  }, [isAdmin])

  const reloadMemberRegistryOnly = useCallback(async () => {
    if (!isAdmin) return
    const { rows, error } = await fetchAllMembershipApplications()
    if (error) {
      console.error(error)
      return
    }
    setMemberRegistry(rows.map(dbRowToMemberEntry))
  }, [isAdmin])

  const pollActivationEmailStatus = useCallback((applicationId: string) => {
    let attempts = 0
    const maxAttempts = 30
    const tick = async () => {
      attempts += 1
      const { rows, error } = await fetchAllMembershipApplications()
      if (!error) {
        const entries = rows.map(dbRowToMemberEntry)
        setMemberRegistry(entries)
        const entry = entries.find((row) => row.applicationId === applicationId)
        if (entry?.activationEmailStatus && entry.activationEmailStatus !== 'queued') return
      }
      if (attempts < maxAttempts) window.setTimeout(() => void tick(), 3000)
    }
    void tick()
  }, [])

  useEffect(() => {
    if (!isAdminRoute) {
      adminStatusCheckedRef.current = false
      return
    }
    if (adminStatusCheckedRef.current) return
    adminStatusCheckedRef.current = true
    void refreshAdminStatus()
  }, [isAdminRoute, refreshAdminStatus])

  useEffect(() => {
    if (isAdminRoute && isAdmin) void loadAdminRegistry()
  }, [isAdminRoute, isAdmin, loadAdminRegistry])

  useEffect(() => {
    if (isAdminRoute && isAdmin) void loadAdminOfficialRequests()
  }, [isAdminRoute, isAdmin, loadAdminOfficialRequests])

  useEffect(() => {
    if (isAdminRoute && mode === 'create-account') setMode('sign-in')
  }, [isAdminRoute, mode])

  useEffect(() => {
    if (isAdminRoute || typeof window === 'undefined') return
    const onPopState = () => {
      setActivePage(pageFromPath(window.location.pathname))
      setSearchOpen(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isAdminRoute])

  useEffect(() => {
    if (activePage !== 'mycmusc') {
      setShowCyprusMembershipForm(false)
      setShowFamilyMemberForm(false)
      setFamilyPendingRecord(null)
      setFamilyDetailApplicationId(null)
      setFamilyEditApplicationId(null)
      setFamilyEditError(null)
    }
    if (activePage !== 'official-membership') {
      setOfficialMembershipApplicationId(null)
    }
  }, [activePage])

  useEffect(() => {
    if (!membershipRecord || detailsEditOpen) return
    setDetailsFullName((myProfile?.fullName?.trim() || `${membershipRecord.firstName} ${membershipRecord.lastName}`).trim())
    setDetailsMobilePhone(membershipRecord.mobilePhone)
    setDetailsAddress(membershipRecord.address)
    setDetailsArea(membershipRecord.area)
    setDetailsPostalCode(membershipRecord.postalCode)
    setDetailsCity(membershipRecord.city)
    setDetailsCountry(membershipRecord.country)
    setDetailsOfficialMuId(membershipRecord.officialMuMembershipId ?? '')
    setDetailsOfficialMuStatus(
      membershipRecord.officialMuMembershipStatus === 'activated' ||
        membershipRecord.officialMuMembershipStatus === 'pending'
        ? membershipRecord.officialMuMembershipStatus
        : '',
    )
  }, [membershipRecord, myProfile?.fullName, detailsEditOpen])

  useEffect(() => {
    if (isMembershipPending) setShowCyprusMembershipForm(false)
  }, [isMembershipPending])

  async function submitPendingMembershipApplication(
    payload: MemberApplicationPayload,
    optionalOfficialOfferId: string | null,
  ) {
    if (!user?.id) throw new Error('You must be signed in to apply.')
    const applicationId = generateApplicationId()
    const { error } = await insertMembershipApplication(user.id, applicationId, payload)
    if (error) throw new Error(error.message)
    if (optionalOfficialOfferId) {
      const { error: officialError } = await createOfficialMembershipRequest(
        optionalOfficialOfferId,
        applicationId,
      )
      if (officialError) throw new Error(officialError.message)
      await loadMyOfficialRequests()
    }
    setShowCyprusMembershipForm(false)
    await refreshMyMembership()
    await loadMyOfficialRequests()
  }

  async function submitFamilyMemberApplication(
    payload: MemberApplicationPayload,
    optionalOfficialOfferId: string | null,
  ) {
    if (!user?.id || !membershipRecord?.applicationId) throw new Error('You must be signed in with active membership.')
    const applicationId = generateApplicationId()
    const { error } = await insertMembershipApplication(user.id, applicationId, payload, {
      sponsorApplicationId: membershipRecord.applicationId,
    })
    if (error) throw new Error(error.message)
    if (optionalOfficialOfferId) {
      const { error: officialError } = await createOfficialMembershipRequest(
        optionalOfficialOfferId,
        applicationId,
      )
      if (officialError) throw new Error(officialError.message)
      await loadMyOfficialRequests()
    }
    setShowFamilyMemberForm(false)
    const submittedAt = new Date().toISOString()
    const officialMembershipOfferTitle = optionalOfficialOfferId
      ? (officialOffers.find((o) => o.id === optionalOfficialOfferId)?.title ?? null)
      : null
    setFamilyPendingRecord({
      applicationId,
      email: membershipRecord.email,
      status: 'pending',
      submittedAt,
      validUntil: null,
      membershipNumber: null,
      sponsorApplicationId: membershipRecord.applicationId,
      officialMembershipOfferTitle,
      ...payload,
      activationEmailStatus: null,
      activationEmailSentAt: null,
      activationEmailRecipient: null,
      activationEmailError: null,
      presentReceived: false,
      presentReceivedAt: null,
      adminMember: false,
      adminMemberAt: null,
      adminSendMicrosite: false,
      adminSendMicrositeAt: null,
    })
    await refreshMyMembership()
    await loadMyOfficialRequests()
  }

  async function applyActivateMembership(applicationId: string): Promise<string | null> {
    const { error, activationEmailStatus } = await setApplicationStatus(applicationId, 'active')
    if (error) throw new Error(error.message)
    let noticeEntry: MemberRegistryEntry | null = null
    setMemberRegistry((prev) =>
      prev.map((m) => {
        if (m.applicationId !== applicationId) return m
        const updated: MemberRegistryEntry = {
          ...m,
          status: 'active',
          activatedAt: new Date().toISOString(),
          activationEmailStatus: activationEmailStatus ?? null,
          activationEmailSentAt: null,
          activationEmailRecipient: m.email,
          activationEmailError: null,
        }
        noticeEntry = updated
        return updated
      }),
    )
    void reloadMemberRegistryOnly()
    void refreshMyMembership()
    if (activationEmailStatus === 'queued') {
      pollActivationEmailStatus(applicationId)
    }
    if (!noticeEntry) return 'Membership activated.'
    return `Membership activated. ${formatActivationEmailStatus(noticeEntry)}`
  }

  async function applySendPaymentReminder(applicationId: string) {
    const { error } = await sendPaymentReminderEmail(applicationId)
    if (error) throw new Error(error.message)
  }

  async function applySetMembershipPending(applicationId: string) {
    const { error } = await setApplicationStatus(applicationId, 'pending')
    if (error) throw new Error(error.message)
    setMemberRegistry((prev) =>
      prev.map((m) =>
        m.applicationId === applicationId ? { ...m, status: 'pending', activatedAt: undefined } : m,
      ),
    )
    void reloadMemberRegistryOnly()
    void refreshMyMembership()
  }

  async function applyDeleteMemberRequest(applicationId: string) {
    const { error } = await deleteMembershipApplication(applicationId)
    if (error) throw new Error(error.message)
    setMemberRegistry((prev) => prev.filter((m) => m.applicationId !== applicationId))
    void reloadMemberRegistryOnly()
    void refreshMyMembership()
  }

  async function applyUpdateMemberId(
    applicationId: string,
    memberId: string,
    officialMuMembershipStatus: OfficialMuMembershipStatus | null,
  ) {
    const { error } = await updateApplicationMemberId(applicationId, memberId, officialMuMembershipStatus)
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
    await refreshMyMembership()
  }

  async function applyUpdateMembershipNumber(applicationId: string, membershipNumber: number | null) {
    const { error } = await updateApplicationMembershipNumber(applicationId, membershipNumber)
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
    await refreshMyMembership()
  }

  async function applyUpdatePresentReceived(applicationId: string, presentReceived: boolean) {
    const { error } = await updateApplicationPresentReceived(applicationId, presentReceived)
    if (error) throw new Error(error.message)
    setMemberRegistry((prev) =>
      prev.map((m) =>
        m.applicationId === applicationId
          ? {
              ...m,
              presentReceived,
              presentReceivedAt: presentReceived ? new Date().toISOString() : null,
            }
          : m,
      ),
    )
    void reloadMemberRegistryOnly()
  }

  async function applyUpdateAdminMemberFlags(
    applicationId: string,
    flags: { member?: boolean; sendMicrosite?: boolean },
  ) {
    const { error } = await updateApplicationAdminMemberFlags(applicationId, flags)
    if (error) throw new Error(error.message)
    const now = new Date().toISOString()
    setMemberRegistry((prev) =>
      prev.map((m) => {
        if (m.applicationId !== applicationId) return m
        const updated = { ...m }
        if (flags.member !== undefined) {
          updated.adminMember = flags.member
          updated.adminMemberAt = flags.member ? now : null
          if (flags.member) {
            updated.officialMuMembershipStatus = 'activated'
          }
        }
        if (flags.sendMicrosite !== undefined) {
          updated.adminSendMicrosite = flags.sendMicrosite
          updated.adminSendMicrositeAt = flags.sendMicrosite ? now : null
        }
        return updated
      }),
    )
    void reloadMemberRegistryOnly()
  }

  async function applyCompleteRenewal(row: PendingRenewalListRow) {
    const currentVu =
      row.membership_applications?.valid_until && row.membership_applications.valid_until !== ''
        ? row.membership_applications.valid_until
        : defaultMembershipValidUntilIso()
    const nextUntil = nextSeasonValidUntilIso(currentVu)
    const { error } = await completeRenewalRequest(row.id, row.application_id, nextUntil)
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
    await refreshMyMembership()
  }

  async function submitRenewalFromModal() {
    if (!user?.id || !membershipRecord) return
    setRenewalSubmitting(true)
    setRenewalSubmitError(null)
    const { error } = await insertRenewalRequest(user.id, membershipRecord.applicationId)
    setRenewalSubmitting(false)
    if (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : ''
      const msg =
        code === '23505' || error.message?.toLowerCase().includes('duplicate')
          ? 'A renewal request is already pending for this membership.'
          : error.message
      setRenewalSubmitError(msg)
      return
    }
    setRenewalModalOpen(false)
    await refreshMyMembership()
  }

  async function saveMyDetails() {
    if (!membershipRecord) return
    setDetailsError(null)
    if (!detailsFullName.trim()) return setDetailsError('Full name is required.')
    if (
      !detailsMobilePhone.trim() ||
      !detailsAddress.trim() ||
      !detailsArea.trim() ||
      !detailsPostalCode.trim() ||
      !detailsCity.trim() ||
      !detailsCountry.trim()
    ) {
      return setDetailsError('Please complete all required contact/address fields.')
    }
    const lockedStatus = membershipRecord.officialMuMembershipStatus ?? ''
    const parsedMu = parseOfficialMuMembershipFields(
      detailsOfficialMuId,
      lockedStatus as OfficialMuMembershipFormStatus,
    )
    if ('error' in parsedMu) {
      return setDetailsError(parsedMu.error)
    }

    setDetailsSaving(true)
    const { error } = await updateMyProfileDetails({
      fullName: detailsFullName.trim(),
      mobilePhone: detailsMobilePhone.trim(),
      address: detailsAddress.trim(),
      area: detailsArea.trim(),
      postalCode: detailsPostalCode.trim(),
      city: detailsCity.trim(),
      country: detailsCountry.trim(),
      officialMuMembershipId: parsedMu.officialMuMembershipId,
      officialMuMembershipStatus: parsedMu.officialMuMembershipStatus,
    })
    setDetailsSaving(false)
    if (error) return setDetailsError(error.message)
    setDetailsEditOpen(false)
    await refreshMyMembership()
  }

  function populateFamilyEditFromRecord(fm: MemberRegistryEntry) {
    setFamilyEditFirstName(fm.firstName)
    setFamilyEditLastName(fm.lastName)
    setFamilyEditMobilePhone(fm.mobilePhone)
    setFamilyEditDateOfBirth(dateOfBirthToDateInputValue(fm.dateOfBirth))
    setFamilyEditAddress(fm.address)
    setFamilyEditArea(fm.area)
    setFamilyEditPostalCode(fm.postalCode)
    setFamilyEditCity(fm.city)
    setFamilyEditCountry(fm.country)
    setFamilyEditRelationship(fm.familyRelationship ?? '')
    setFamilyEditRelationshipOther(fm.familyRelationshipOther ?? '')
    setFamilyEditOfficialMuId(fm.officialMuMembershipId ?? '')
    setFamilyEditOfficialMuStatus(
      fm.officialMuMembershipStatus === 'activated' || fm.officialMuMembershipStatus === 'pending'
        ? fm.officialMuMembershipStatus
        : '',
    )
  }

  function toggleFamilyDetail(fm: MemberRegistryEntry) {
    if (familyDetailApplicationId === fm.applicationId) {
      setFamilyDetailApplicationId(null)
      setFamilyEditApplicationId(null)
      setFamilyEditError(null)
      return
    }
    setFamilyDetailApplicationId(fm.applicationId)
    setFamilyEditApplicationId(null)
    setFamilyEditError(null)
  }

  function openFamilyEdit(fm: MemberRegistryEntry) {
    setFamilyDetailApplicationId(fm.applicationId)
    setFamilyEditApplicationId(fm.applicationId)
    setFamilyEditError(null)
    populateFamilyEditFromRecord(fm)
  }

  async function saveFamilyMemberDetails() {
    const applicationId = familyEditApplicationId
    if (!applicationId || !membershipRecord) return
    setFamilyEditError(null)
    if (!familyEditFirstName.trim() || !familyEditLastName.trim()) {
      return setFamilyEditError('First and last name are required.')
    }
    if (!familyEditRelationship) {
      return setFamilyEditError('Please select the family relationship.')
    }
    if (familyEditRelationship === 'other' && !familyEditRelationshipOther.trim()) {
      return setFamilyEditError('Please describe the relationship when you select Other.')
    }
    if (
      !familyEditMobilePhone.trim() ||
      !familyEditDateOfBirth ||
      !familyEditAddress.trim() ||
      !familyEditArea.trim() ||
      !familyEditPostalCode.trim() ||
      !familyEditCity.trim() ||
      !familyEditCountry.trim()
    ) {
      return setFamilyEditError('Please complete all required contact and address fields.')
    }
    const dob = parseDateOfBirthInput(familyEditDateOfBirth)
    if (!dob) return setFamilyEditError('Please enter a valid date of birth.')
    const fm = familyMembers.find((member) => member.applicationId === applicationId)
    const lockedStatus = fm?.officialMuMembershipStatus ?? ''
    const parsedMu = parseOfficialMuMembershipFields(
      familyEditOfficialMuId,
      lockedStatus as OfficialMuMembershipFormStatus,
    )
    if ('error' in parsedMu) return setFamilyEditError(parsedMu.error)

    setFamilyEditSaving(true)
    const { error } = await updateFamilyMemberDetails(applicationId, {
      firstName: familyEditFirstName.trim(),
      lastName: familyEditLastName.trim(),
      mobilePhone: familyEditMobilePhone.trim(),
      dateOfBirth: familyEditDateOfBirth,
      address: familyEditAddress.trim(),
      area: familyEditArea.trim(),
      postalCode: familyEditPostalCode.trim(),
      city: familyEditCity.trim(),
      country: familyEditCountry.trim(),
      familyRelationship: familyEditRelationship,
      familyRelationshipOther:
        familyEditRelationship === 'other' ? familyEditRelationshipOther.trim() : null,
      officialMuMembershipId: parsedMu.officialMuMembershipId,
      officialMuMembershipStatus: parsedMu.officialMuMembershipStatus,
    })
    setFamilyEditSaving(false)
    if (error) return setFamilyEditError(error.message)

    setFamilyEditApplicationId(null)
    const { rows, error: reloadErr } = await fetchMyFamilyMembers(membershipRecord.applicationId)
    if (!reloadErr) {
      setFamilyMembers(rows)
      if (familyPendingRecord) {
        const updated = rows.find((r) => r.applicationId === familyPendingRecord.applicationId)
        if (updated) setFamilyPendingRecord(updated)
      }
    } else {
      await refreshMyMembership()
    }
  }

  function resetForm() {
    setEmail('')
    setName('')
    setSurname('')
    setPassword('')
    setMessage(null)
  }

  function handleModeChange(next: Mode) {
    setMode(next)
    resetForm()
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!email.trim()) {
      setMessage('Please enter your email.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage('Please enter a valid email address.')
      return
    }
    setForgotSubmitting(true)
    const { error } = await resetPasswordForEmail(email)
    setForgotSubmitting(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(
      'If an account exists for that email, you will receive a password reset link shortly. Check your inbox and spam folder.',
    )
  }

  async function handleResendVerificationClick() {
    setMessage(null)
    if (!email.trim()) {
      setMessage('Please enter your email first.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage('Please enter a valid email address.')
      return
    }
    setResendVerificationSubmitting(true)
    const { error } = await resendVerificationEmail(email.trim())
    setResendVerificationSubmitting(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('If an account exists for that email and is not yet verified, we sent a new verification email.')
  }

  async function handleRecoverySubmit(e: FormEvent) {
    e.preventDefault()
    setRecoveryError(null)
    if (recoveryPassword.length < 8) {
      setRecoveryError('Password must be at least 8 characters.')
      return
    }
    if (recoveryPassword !== recoveryPasswordConfirm) {
      setRecoveryError('Passwords do not match.')
      return
    }
    if (!passwordResetToken) {
      setRecoveryError('Reset link is missing or invalid. Request a new link from the sign-in page.')
      return
    }
    setRecoverySubmitting(true)
    const { error } = await updatePasswordAfterRecovery(recoveryPassword, passwordResetToken)
    setRecoverySubmitting(false)
    if (error) {
      setRecoveryError(error.message)
      return
    }
    setRecoveryPassword('')
    setRecoveryPasswordConfirm('')
    setPasswordResetToken(null)
    setMode('sign-in')
    setMessage('Your password was updated. You can now sign in.')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (authSubmitting) return
    setMessage(null)

    if (!email.trim()) {
      setMessage('Please enter your email.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage('Please enter a valid email address.')
      return
    }
    if (!password) {
      setMessage('Please enter your password.')
      return
    }
    if (mode === 'create-account') {
      if (!name.trim() || !surname.trim()) {
        setMessage('Please enter your name and surname.')
        return
      }
      if (password.length < 8) {
        setMessage('Password must be at least 8 characters.')
        return
      }
    }

    setAuthSubmitting(true)
    try {
      if (isAdminRoute || mode === 'sign-in') {
        const { error } = await signIn(email, password)
        if (error) {
          setMessage(error.message)
          return
        }
      } else {
        const { error, requiresEmailVerification, verificationResent } = await signUp(
          email,
          password,
          `${name.trim()} ${surname.trim()}`,
        )
        if (error) {
          setMessage(error.message)
          return
        }
        if (requiresEmailVerification) {
          setMode('sign-in')
          setMessage(
            verificationResent
              ? 'We sent another verification email. Please verify your email, then sign in.'
              : 'We sent a verification email. Please verify your email, then sign in.',
          )
          resetForm()
          return
        }
      }

      if (isAdminRoute) {
        if (window.location.pathname.replace(/\/+$/, '') !== '/admin') {
          window.history.replaceState({}, '', '/admin')
        }
      } else {
        openPage('home')
      }
      resetForm()
    } finally {
      setAuthSubmitting(false)
    }
  }

  if (!configured) {
    return (
      <div className="auth-layout">
        <div className="auth-page setup-missing-page">
          <h1 className="auth-title">Server environment is not configured</h1>
          <p className="section-lead">
            Set the backend environment variables in <code className="admin-inline-code">.env</code> (or Railway
            Service Variables):
          </p>
          <pre className="setup-env-sample">
            DATABASE_URL=postgresql://...{'\n'}
            AUTH_JWT_SECRET=your-long-random-secret
          </pre>
          <p className="auth-footnote">
            Copy <code className="admin-inline-code">.env.example</code> to <code className="admin-inline-code">.env</code>{' '}
            and fill in your values.
          </p>
        </div>
      </div>
    )
  }

  if (passwordResetToken) {
    return (
      <div className="auth-layout">
        <div className="auth-page">
          <header className="auth-header">
            <ClubLogoMark className="auth-badge" />
            <h1 className="auth-title">Set a new password</h1>
            <p className="auth-subtitle">Choose a new password for your account, then continue to the members area.</p>
          </header>

          <form className="auth-form" onSubmit={(ev) => void handleRecoverySubmit(ev)} noValidate>
            <label className="auth-field">
              <span className="auth-label">New password</span>
              <input
                className="auth-input"
                type="password"
                name="new-password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={recoveryPassword}
                onChange={(e) => setRecoveryPassword(e.target.value)}
              />
            </label>
            <label className="auth-field">
              <span className="auth-label">Confirm new password</span>
              <input
                className="auth-input"
                type="password"
                name="confirm-new-password"
                autoComplete="new-password"
                placeholder="Repeat new password"
                value={recoveryPasswordConfirm}
                onChange={(e) => setRecoveryPasswordConfirm(e.target.value)}
              />
            </label>

            {recoveryError && <p className="auth-message is-error">{recoveryError}</p>}

            <button type="submit" className="auth-submit" disabled={recoverySubmitting}>
              {recoverySubmitting ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="auth-layout app-loading-screen">
        <p className="app-loading-text">Loading…</p>
      </div>
    )
  }

  if (!session) {
    const authMessageSuccess =
      message?.startsWith('Check your email') ||
      message?.startsWith('If an account exists for that email') ||
      message === 'Your password was updated. You can now sign in.'
    const showResendVerificationAction = message === 'Please verify your email before signing in'

    return (
      <div className="auth-layout">
        <div className="auth-page">
          <header className="auth-header">
            <ClubLogoMark className="auth-badge" />
            <h1 className="auth-title">{isAdminRoute ? 'Admin login' : 'Welcome to the home of Cyprus Manchester United Supporters Club'}</h1>
            <p className="auth-subtitle">{isAdminRoute ? 'Sign in with an admin account' : 'Member access'}</p>
            {isAdminRoute && (
              <p className="admin-portal-url" aria-label="Admin portal address">
                {ADMIN_PORTAL_URL}
              </p>
            )}
          </header>

          {mode === 'forgot-password' ? (
            <>
              <button
                type="button"
                className="auth-back-link"
                onClick={() => {
                  setMode('sign-in')
                  setMessage(null)
                }}
              >
                ← Back to sign in
              </button>
              <h2 className="auth-forgot-title">Reset password</h2>
              <p className="auth-forgot-lead">
                Enter the email you use for this club portal. We will send you a link to choose a new password.
              </p>

              <form className="auth-form" onSubmit={(ev) => void handleForgotSubmit(ev)} noValidate>
                <label className="auth-field">
                  <span className="auth-label">Email</span>
                  <input
                    className="auth-input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                {message && (
                  <p className={`auth-message ${authMessageSuccess ? 'is-success' : 'is-error'}`}>{message}</p>
                )}

                <button type="submit" className="auth-submit" disabled={forgotSubmitting}>
                  {forgotSubmitting ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          ) : (
            <>
              {!isAdminRoute && (
                <div className="auth-panel" role="tablist" aria-label="Authentication">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'sign-in'}
                    className={`auth-tab ${mode === 'sign-in' ? 'is-active' : ''}`}
                    onClick={() => handleModeChange('sign-in')}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'create-account'}
                    className={`auth-tab ${mode === 'create-account' ? 'is-active' : ''}`}
                    onClick={() => handleModeChange('create-account')}
                  >
                    Create account
                  </button>
                </div>
              )}

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <label className="auth-field">
                  <span className="auth-label">Email</span>
                  <input
                    className="auth-input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                {!isAdminRoute && mode === 'create-account' && (
                  <>
                    <label className="auth-field">
                      <span className="auth-label">Name</span>
                      <input
                        className="auth-input"
                        type="text"
                        name="given-name"
                        autoComplete="given-name"
                        placeholder="First name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label className="auth-field">
                      <span className="auth-label">Surname</span>
                      <input
                        className="auth-input"
                        type="text"
                        name="family-name"
                        autoComplete="family-name"
                        placeholder="Last name"
                        value={surname}
                        onChange={(e) => setSurname(e.target.value)}
                      />
                    </label>
                  </>
                )}

                <label className="auth-field">
                  <span className="auth-label">Password</span>
                  <input
                    className="auth-input"
                    type="password"
                    name={mode === 'create-account' ? 'new-password' : 'current-password'}
                    autoComplete={mode === 'create-account' ? 'new-password' : 'current-password'}
                    placeholder={mode === 'create-account' ? 'At least 8 characters' : 'Your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>

                {mode === 'sign-in' && (
                  <div className="auth-forgot-row">
                    <button
                      type="button"
                      className="auth-forgot-link"
                      onClick={() => {
                        setMode('forgot-password')
                        setMessage(null)
                      }}
                    >
                      Forgot your password?
                    </button>
                    {showResendVerificationAction && (
                      <button
                        type="button"
                        className="auth-forgot-link"
                        disabled={resendVerificationSubmitting}
                        onClick={() => void handleResendVerificationClick()}
                      >
                        {resendVerificationSubmitting ? 'Sending…' : 'Resend verification email'}
                      </button>
                    )}
                  </div>
                )}

                {message && (
                  <p className={`auth-message ${authMessageSuccess ? 'is-success' : 'is-error'}`}>{message}</p>
                )}

                <button type="submit" className="auth-submit" disabled={authSubmitting}>
                  {authSubmitting
                    ? isAdminRoute || mode === 'sign-in'
                      ? 'Signing in…'
                      : 'Creating account…'
                    : isAdminRoute || mode === 'sign-in'
                      ? 'Sign in'
                      : 'Create account'}
                </button>
              </form>

              {!isAdminRoute && (
                <p className="auth-footnote">
                  {mode === 'create-account' ? (
                    <span className="auth-footnote-highlight">
                      By clicking the Create Account button, you will receive an email asking you to verify your account details.
                    </span>
                  ) : (
                    <>
                      First visit? Choose <strong>Create account</strong> with your email, name, surname, and password.
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  if (isAdminRoute) {
    return (
      <div className="app-shell app-shell--admin">
        <header className="top-bar top-bar--admin">
          <div className="top-bar-left" />
          <button type="button" className="top-bar-logo-btn" onClick={() => (window.location.href = '/admin')}>
            <ClubLogoMark className="top-bar-club-logo" />
          </button>
          <p className="admin-portal-url admin-portal-url--topbar" aria-label="Admin portal address">
            {ADMIN_PORTAL_URL}
          </p>
          <div className="top-bar-right">
            <button type="button" className="top-bar-pill-btn top-bar-signout" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </header>
        <main className="main-content">
          {isAdmin ? (
            <AdminConsole
              memberRegistry={memberRegistry}
              loading={registryLoading}
              pendingRenewals={pendingRenewals}
              pendingTicketRequests={pendingTicketRequests}
              onActivate={applyActivateMembership}
              onSendPaymentReminder={applySendPaymentReminder}
              onSetPending={applySetMembershipPending}
              onDeleteMemberRequest={applyDeleteMemberRequest}
              onUpdateMemberId={applyUpdateMemberId}
              onUpdateMembershipNumber={applyUpdateMembershipNumber}
              onUpdatePresentReceived={applyUpdatePresentReceived}
              onUpdateAdminMemberFlags={applyUpdateAdminMemberFlags}
              onCompleteRenewal={applyCompleteRenewal}
              onApproveTicketRequest={applyApproveTicketRequest}
              onCompleteTicketRequest={applyCompleteTicketRequest}
              onCancelTicketRequest={applyCancelTicketRequest}
              onUpdateTicketDepositConfirmed={applyUpdateTicketDepositConfirmed}
              onUpdateTicketBalancePayment={applyUpdateTicketBalancePayment}
              onUpdateTicketConfirmed={applyUpdateTicketConfirmed}
              onRefreshTicketRequests={refreshTicketRequestsOnly}
              newsPosts={newsPosts}
              newsLoading={newsLoading}
              onCreateNews={applyCreateNews}
              onUpdateNews={applyUpdateNews}
              onDeleteNews={applyDeleteNews}
              merchandiseOrders={adminMerchandiseOrders}
              onUpdateMerchandiseOrderStatus={applyUpdateMerchandiseOrderStatus}
              merchandiseProducts={merchProducts}
              onCreateMerchandiseProduct={applyCreateMerchandiseProductFromAdmin}
              onUpdateMerchandiseProduct={applyUpdateMerchandiseProductFromAdmin}
              onDeleteMerchandiseProduct={applyDeleteMerchandiseProductFromAdmin}
              onReorderMerchandiseProducts={applyReorderMerchandiseProductsFromAdmin}
              ticketFixtures={ticketFixtures}
              ticketWindowByKey={ticketWindowByKey}
              ticketWindowDetailsByKey={ticketWindowDetailsByKey}
              onSetFixtureTicketStatus={setFixtureTicketStatus}
              onUpdateFixtureTicketMaxTickets={setFixtureTicketMaxTickets}
              onSyncFixtures={refreshFixtures}
              fixturesSyncing={fixturesLoading}
              adminUsers={adminUsers}
              adminUsersLoading={adminUsersLoading}
              onCreateAdminUser={applyCreateAdminUser}
              onDeleteAdminUser={applyDeleteAdminUser}
              officialOffers={officialOffers}
              officialOffersLoading={officialOffersLoading}
              officialRequests={adminOfficialRequests}
              officialRequestsLoading={adminOfficialRequestsLoading}
              onCreateOfficialOffer={applyCreateOfficialOffer}
              onUpdateOfficialOffer={applyUpdateOfficialOffer}
              onDeleteOfficialOffer={applyDeleteOfficialOffer}
              onReorderOfficialOffers={applyReorderOfficialOffers}
              onSetOfficialRequestStatus={applySetOfficialRequestStatus}
              onDeleteOfficialRequest={applyDeleteOfficialRequest}
            />
          ) : (
            <div className="section-page admin-page">
              <h1 className="section-title">Admin access required</h1>
              <p className="section-lead">
                This account is not marked as admin. Add your email under Admin users, or set{' '}
                <code className="admin-inline-code">profiles.is_admin</code> to{' '}
                <code className="admin-inline-code">true</code> in the database, then sign in again.
              </p>
            </div>
          )}
        </main>
        <footer className="admin-portal-footer" aria-label="Admin portal address">
          {ADMIN_PORTAL_URL}
        </footer>
      </div>
    )
  }

  return (
    <div className="app-shell website-shell">
      <header className="top-bar website-top-bar">
        <button
          type="button"
          className="top-bar-logo-btn"
          onClick={() => {
            openPage('home')
          }}
          aria-label="Home — Cyprus Manchester United Supporters Club"
        >
          <ClubLogoMark className="top-bar-club-logo" />
        </button>

        <div className="top-bar-actions">
          {showMatchTickets && (
            <button
              type="button"
              className={`top-bar-pill-btn top-bar-fixtures-btn ${activePage === 'tickets' ? 'is-active' : ''}`}
              aria-label="Manchester United home fixtures and match ticket requests"
              aria-expanded={activePage === 'tickets'}
              onClick={() => openPage('tickets', { resetSearch: true, resetFixtures: false })}
            >
              <IconCalendar />
              <span className="top-bar-fixtures-label">Match ticket requests</span>
            </button>
          )}
          <button
            type="button"
            className={`top-bar-pill-btn top-bar-mycmusc-btn ${activePage === 'mycmusc' || activePage === 'official-membership' ? 'is-active' : ''}`}
            onClick={() => openPage('mycmusc')}
          >
            MY MUCY
          </button>
          <NewsPushBell variant="topbar" />
          <button
            type="button"
            className={`top-bar-icon-btn top-bar-search-btn ${searchOpen ? 'is-active' : ''}`}
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() =>
              setSearchOpen((v) => {
                return !v
              })
            }
          >
            <IconSearch />
          </button>
          <button
            type="button"
            className="top-bar-pill-btn top-bar-signout top-bar-signout--desktop"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="website-nav-bar" aria-label="Website sections">
        <div className="website-nav-inner">
          <button type="button" className={`sub-red-link ${activePage === 'home' ? 'is-active' : ''}`} onClick={() => openPage('home')}>
            Home
          </button>
          <button type="button" className={`sub-red-link ${activePage === 'news' ? 'is-active' : ''}`} onClick={() => openPage('news')}>
            News
          </button>
          <button type="button" className={`sub-red-link ${activePage === 'social' ? 'is-active' : ''}`} onClick={() => openPage('social')}>
            Social Media
          </button>
          <button type="button" className={`sub-red-link ${activePage === 'board' ? 'is-active' : ''}`} onClick={() => openPage('board')}>
            Board
          </button>
          {showMerchandise && (
            <button
              type="button"
              className={`sub-red-link ${activePage === 'merchandise' ? 'is-active' : ''}`}
              onClick={() => openPage('merchandise')}
            >
              Merchandise
            </button>
          )}
          <button type="button" className={`sub-red-link ${activePage === 'contact' ? 'is-active' : ''}`} onClick={() => openPage('contact')}>
            Contact Us
          </button>
        </div>
      </nav>

      {activePage === 'tickets' && showMatchTickets && (
        <section className="fixtures-strip" aria-label="Manchester United home fixtures and match ticket requests">
          <div className="fixtures-strip-inner">
            <p className="fixtures-strip-title">Manchester United — home fixtures and match ticket requests</p>
            {fixturesUpdatedAt && (
              <p className="fixtures-updated-at">
                Last updated: {new Date(fixturesUpdatedAt).toLocaleString('en-GB')}
              </p>
            )}
            {fixturesError && <p className="fixtures-strip-warning">{fixturesError}</p>}
            {ticketFixtures.length === 0 ? (
              <p className="fixtures-strip-empty">No upcoming home fixtures with club ticket requests right now.</p>
            ) : (
              <ul className="fixtures-list">
                {ticketFixtures.map((f) => (
                  <li key={`${f.kickoffIso}-${f.opponent}`} className="fixtures-card">
                    <div className="fixtures-card-main">
                      <div className="fixtures-card-left">
                        <p className="fixtures-kickoff">{formatFixtureKickoff(f.kickoffIso)}</p>
                        <p className="fixtures-opponent">
                          {f.home ? 'Manchester United vs ' : ''}
                          {!f.home ? `${f.opponent} vs Manchester United` : f.opponent}
                        </p>
                        <p className="fixtures-meta">
                          {f.competition} · {f.venue}
                        </p>
                      </div>
                      <div className="fixtures-card-right">
                        {(() => {
                          const key = fixtureMatchKey(f)
                          const status = ticketWindowByKey[key] ?? 'disabled'
                          const windowDetails = ticketWindowDetailsByKey[key]
                          const maxTickets = windowDetails?.maxTickets ?? null
                          const activeRequestCount = windowDetails?.activeRequestCount ?? 0
                          const ticketsRemaining = fixtureTicketsRemaining(maxTickets, activeRequestCount)
                          const atCapacity = ticketsRemaining === 0
                          const myRequest = myTicketRequestByKey[key]
                          const myRequestStatus = myRequest?.status
                          const depositConfirmed = myRequest?.depositConfirmed === true
                          const userCancelled = Boolean(myRequest?.userCancelledAt)
                          const busy = ticketBusyKey === key
                          const canRequestTicket =
                            membershipRecord?.status === 'active' &&
                            membershipRecord.officialMuMembershipStatus === 'activated'
                          const canSubmitNewRequest =
                            !myRequestStatus || userCancelled || myRequestStatus === 'cancelled'
                          const formSubmitted = Boolean(ticketFormSubmittedByKey[key])
                          const showBalancePaymentPending =
                            myRequest?.balancePaymentNotified === true &&
                            myRequest.balanceRemainingAmountEur != null &&
                            myRequest.balanceRemainingAmountEur > 0 &&
                            myRequest?.ticketConfirmed !== true &&
                            !userCancelled &&
                            myRequestStatus !== 'cancelled' &&
                            myRequestStatus !== 'rejected' &&
                            myRequestStatus !== 'completed'
                          const showTicketConfirmed =
                            myRequest?.ticketConfirmed === true &&
                            !userCancelled &&
                            myRequestStatus !== 'cancelled' &&
                            myRequestStatus !== 'rejected' &&
                            myRequestStatus !== 'completed'
                          const showDepositAccepted =
                            depositConfirmed &&
                            !showBalancePaymentPending &&
                            !showTicketConfirmed &&
                            !userCancelled &&
                            myRequestStatus !== 'cancelled' &&
                            myRequestStatus !== 'rejected' &&
                            myRequestStatus !== 'completed'

                          if (showTicketConfirmed) {
                            return (
                              <div className="fixtures-member-ticket-panel fixtures-member-ticket-panel--confirmed-only">
                                <p className="fixtures-ticket-confirmed-msg">Ticket Confirmed</p>
                                <button
                                  type="button"
                                  className="fixtures-ticket-cancel-btn"
                                  onClick={() => {
                                    setTicketCancelConfirmError(null)
                                    setTicketCancelConfirmFixture(f)
                                  }}
                                  disabled={busy || ticketCancelConfirmSubmitting}
                                >
                                  Cancel request
                                </button>
                              </div>
                            )
                          }

                          return (
                            <div className="fixtures-member-ticket-panel">
                              <span className={`fixtures-ticket-pill fixtures-ticket-pill--${status}`}>
                                {fixtureWindowStatusLabel(status)}
                              </span>
                              {status === 'open' && ticketsRemaining != null && (
                                <p className={`fixtures-ticket-availability${atCapacity ? ' is-full' : ''}`}>
                                  {atCapacity
                                    ? 'No tickets remaining'
                                    : `${ticketsRemaining} ticket${ticketsRemaining === 1 ? '' : 's'} remaining`}
                                </p>
                              )}
                              {userCancelled && (
                                <span className="fixtures-ticket-pill fixtures-ticket-pill--closed">
                                  Request cancelled
                                </span>
                              )}
                              {status === 'open' && canSubmitNewRequest && canRequestTicket && !atCapacity && (
                                <button
                                  type="button"
                                  className="fixtures-ticket-request-btn"
                                  onClick={() => {
                                    setTicketRequestConfirmError(null)
                                    setTicketRequestConfirmFixture(f)
                                  }}
                                  disabled={busy || ticketRequestConfirmSubmitting}
                                >
                                  {busy ? 'Sending…' : userCancelled ? 'Request again' : 'Request'}
                                </button>
                              )}
                              {status === 'open' && canSubmitNewRequest && !canRequestTicket && (
                                <p className="fixtures-ticket-eligibility-note">
                                  In order to request a ticket, you need to have active club and official Man UTD
                                  membership.
                                </p>
                              )}
                              {status === 'open' && canSubmitNewRequest && canRequestTicket && atCapacity && (
                                <p className="fixtures-ticket-availability is-full">Ticket requests are full for this match.</p>
                              )}
                              {!userCancelled && myRequestStatus === 'pending' && !depositConfirmed && (
                                <>
                                  <span className="fixtures-ticket-pill fixtures-ticket-pill--pending">Pending</span>
                                  <button
                                    type="button"
                                    className="fixtures-ticket-request-btn"
                                    onClick={() => openTicketDepositPayment(f)}
                                  >
                                    Pay deposit
                                  </button>
                                </>
                              )}
                              {showDepositAccepted && (
                                <>
                                  <p className="fixtures-ticket-accepted-msg">Request accepted</p>
                                  <button
                                    type="button"
                                    className="fixtures-ticket-cancel-btn"
                                    onClick={() => {
                                      setTicketCancelConfirmError(null)
                                      setTicketCancelConfirmFixture(f)
                                    }}
                                    disabled={busy || ticketCancelConfirmSubmitting}
                                  >
                                    Cancel request
                                  </button>
                                </>
                              )}
                              {showBalancePaymentPending && (
                                <button
                                  type="button"
                                  className="fixtures-ticket-balance-pending-btn"
                                  onClick={() => openTicketBalancePayment(f)}
                                >
                                  Ticket payment pending
                                </button>
                              )}
                              {!userCancelled && myRequestStatus === 'approved' && !showBalancePaymentPending && (
                                <>
                                  <span className="fixtures-ticket-pill fixtures-ticket-pill--approved">Accepted</span>
                                  {!formSubmitted && (
                                    <button
                                      type="button"
                                      className="fixtures-ticket-request-btn"
                                      onClick={() => openTicketCompletionForm(f)}
                                    >
                                      Complete form
                                    </button>
                                  )}
                                </>
                              )}
                              {!userCancelled && myRequestStatus === 'completed' && (
                                <span className="fixtures-ticket-pill fixtures-ticket-pill--completed">Completed</span>
                              )}
                              {!userCancelled && myRequestStatus === 'cancelled' && (
                                <span className="fixtures-ticket-pill fixtures-ticket-pill--closed">Cancelled</span>
                              )}
                              {!userCancelled && myRequestStatus === 'rejected' && (
                                <span className="fixtures-ticket-pill fixtures-ticket-pill--closed">Rejected</span>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {searchOpen && (
        <div className="search-strip">
          <label className="search-strip-inner">
            <span className="visually-hidden">Search</span>
            <input
              type="search"
              className="search-strip-input"
              placeholder="Search events, news, members…"
              autoFocus
            />
          </label>
        </div>
      )}

      <main className="main-content">
        <TicketRequestConfirmModal
          open={ticketRequestConfirmFixture !== null}
          fixture={ticketRequestConfirmFixture}
          submitting={ticketRequestConfirmSubmitting}
          error={ticketRequestConfirmError}
          requesterMembershipNumber={membershipRecord?.membershipNumber ?? null}
          onClose={() => {
            if (ticketRequestConfirmSubmitting) return
            setTicketRequestConfirmFixture(null)
            setTicketRequestConfirmError(null)
          }}
          onConfirm={(travelCompanionMembershipNumbers) =>
            void confirmTicketRequestAndOpenPayment(travelCompanionMembershipNumbers)
          }
        />
        <TicketDepositPaymentModal
          open={ticketDepositPaymentFixture !== null}
          onClose={closeTicketDepositPayment}
          fixture={ticketDepositPaymentFixture}
          membershipNumber={formatMembershipNumber(membershipRecord?.membershipNumber)}
          ticketReference={
            ticketDepositPaymentFixture ? fixtureMatchKey(ticketDepositPaymentFixture) : 'match-ticket'
          }
          ticketSlotCount={resolveTicketDepositSlotCount(ticketDepositPaymentFixture)}
        />
        <TicketBalancePaymentModal
          open={ticketBalancePaymentFixture !== null}
          onClose={closeTicketBalancePayment}
          fixture={ticketBalancePaymentFixture}
          membershipNumber={formatMembershipNumber(membershipRecord?.membershipNumber)}
          ticketReference={
            ticketBalancePaymentFixture ? fixtureMatchKey(ticketBalancePaymentFixture) : 'match-ticket'
          }
          balanceRemainingAmountEur={
            ticketBalancePaymentFixture
              ? (myTicketRequestByKey[fixtureMatchKey(ticketBalancePaymentFixture)]?.balanceRemainingAmountEur ?? null)
              : null
          }
          balancePaymentDeadline={
            ticketBalancePaymentFixture
              ? (myTicketRequestByKey[fixtureMatchKey(ticketBalancePaymentFixture)]?.balancePaymentDeadline ?? null)
              : null
          }
        />
        <TicketCancelConfirmModal
          open={ticketCancelConfirmFixture !== null}
          fixture={ticketCancelConfirmFixture}
          submitting={ticketCancelConfirmSubmitting}
          error={ticketCancelConfirmError}
          onClose={() => {
            if (ticketCancelConfirmSubmitting) return
            setTicketCancelConfirmFixture(null)
            setTicketCancelConfirmError(null)
          }}
          onConfirm={() => void confirmCancelTicketRequest()}
        />
        <TicketCompletionModal
          open={ticketFormOpen}
          onClose={closeTicketCompletionForm}
          onSubmit={() => void submitTicketCompletionForm()}
          submitting={ticketFormSubmitting}
          fixture={ticketFormFixture}
          firstName={membershipRecord?.firstName ?? '—'}
          lastName={membershipRecord?.lastName ?? '—'}
          email={myProfile?.email ?? user?.email ?? '—'}
          membershipNumber={formatMembershipNumber(membershipRecord?.membershipNumber)}
          officialMuMembershipId={membershipRecord?.officialMuMembershipId?.trim() ?? ''}
          ticketReference={
            ticketFormFixture ? fixtureMatchKey(ticketFormFixture) : 'match-ticket'
          }
          ticketSlotCount={
            ticketFormFixture
              ? (myTicketRequestByKey[fixtureMatchKey(ticketFormFixture)]?.ticketSlotCount ?? 1)
              : 1
          }
        />
        <NewsDetailModal
          post={newsDetailPost}
          open={newsDetailPost !== null}
          onClose={() => setNewsDetailPost(null)}
        />
        {activePage === 'board' && (
          <div className="board-page">
            <h1 className="board-title">Board</h1>
            <ul className="contact-list">
              <li className="contact-card">
                <p className="contact-name">Δημήτρης Ναθαναήλ (Πρόεδρος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Μάριος Ηροδότου (Αντιπρόεδρος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Θαλής Αλεξάνδρου (Αντιπρόεδρος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Γρηγόρης Γρηγορίου (Αντιπρόεδρος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Χαράλαμπος Λοΐζου (Γραμματέας)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Χρίστος Απέγητος (Βοηθός Γραμματέας)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Νεόφυτος Ιωάννου (Ταμίας)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Θεόδωρος Σαββίδης (Βοηθός Ταμίας)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Γιάννης Νικολαΐδης (Μέλος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Στέλιος Χατζηχριστοφή (Μέλος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Εύρος Αλεξάνδρου (Μέλος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Άκης Νικολάου (Μέλος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Άνδρος Eid (Μέλος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Μιχάλης Πετουφάς (Μέλος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Μάρκος Ασβεστάς (Μέλος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Κωνσταντίνος Πατσιάς (Μέλος)</p>
              </li>
              <li className="contact-card">
                <p className="contact-name">Ρώνης Σωτηριάδης (Επίτημος Πρόεδρος)</p>
              </li>
            </ul>
          </div>
        )}
        {activePage === 'contact' && (
          <div className="board-page">
            <h1 className="board-title">Contact Us</h1>
            <p className="board-lead">Reach the Cyprus Manchester United Supporters Club committee:</p>
            <ul className="contact-list">
              <li className="contact-card">
                <p className="contact-role">Club Chairman</p>
                <p className="contact-name">Demitris Nathanael</p>
                <a className="contact-phone" href="tel:+35799472227">
                  +357 99 472 227
                </a>
              </li>
              <li className="contact-card">
                <p className="contact-role">Club Secretary</p>
                <p className="contact-name">Charalambos Loizou</p>
                <a className="contact-phone" href="tel:+35799489002">
                  +357 99 489 002
                </a>
              </li>
              <li className="contact-card">
                <p className="contact-role">Club PR Officer</p>
                <p className="contact-name">Gregoris Gregoriou</p>
                <a className="contact-phone" href="tel:+35799293992">
                  +357 99 293 992
                </a>
              </li>
            </ul>
          </div>
        )}
        {activePage === 'news' && (
          <div className="section-page news-promo-page">
            <div className="news-page-header">
              <h1 className="section-title">News</h1>
              <NewsPushBell variant="page" />
            </div>
            <p className="section-lead news-promo-page-lead">
              Swipe on mobile or tap a story to read the full announcement.
            </p>
            {newsLoading ? (
              <p className="section-lead">Loading latest club announcements...</p>
            ) : newsPosts.length === 0 ? (
              <p className="section-lead">
                No posts yet. Club announcements and matchday updates will appear here.
              </p>
            ) : (
              <NewsFeed posts={newsPosts} onReadPost={setNewsDetailPost} idPrefix="news-page" />
            )}
          </div>
        )}
        {activePage === 'social' && (
          <div className="section-page social-page">
            <header className="social-hero">
              <p className="social-eyebrow">Connect with us</p>
              <h1 className="section-title social-hero-title">Social media</h1>
              <p className="section-lead social-hero-lead">Official club channels.</p>
            </header>
            <ul className="social-grid">
              <li>
                <a
                  className="social-card social-card--web"
                  href="https://manutd-cyprus.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="social-card-icon" aria-hidden>
                    <IconSocialGlobe className="social-card-svg" />
                  </span>
                  <div className="social-card-text">
                    <span className="social-card-name">Website</span>
                    <span className="social-card-handle">manutd-cyprus.com</span>
                  </div>
                  <span className="social-card-chevron" aria-hidden>
                    ↗
                  </span>
                </a>
              </li>
              <li>
                <a
                  className="social-card social-card--instagram"
                  href="https://www.instagram.com/manutdcyprus/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="social-card-icon" aria-hidden>
                    <IconSocialInstagram className="social-card-svg" />
                  </span>
                  <div className="social-card-text">
                    <span className="social-card-name">Instagram</span>
                    <span className="social-card-handle">@manutdcyprus</span>
                  </div>
                  <span className="social-card-chevron" aria-hidden>
                    ↗
                  </span>
                </a>
              </li>
              <li>
                <a
                  className="social-card social-card--facebook"
                  href="https://www.facebook.com/people/Manchester-United-Supporters-Club-Cyprus/61577162535725/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="social-card-icon" aria-hidden>
                    <IconSocialFacebook className="social-card-svg" />
                  </span>
                  <div className="social-card-text">
                    <span className="social-card-name">Facebook</span>
                    <span className="social-card-handle">Manchester United Supporters Club Cyprus</span>
                  </div>
                  <span className="social-card-chevron" aria-hidden>
                    ↗
                  </span>
                </a>
              </li>
              <li>
                <a
                  className="social-card social-card--tiktok"
                  href="https://www.tiktok.com/@manutdcyprussc"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="social-card-icon" aria-hidden>
                    <IconSocialTikTok className="social-card-svg" />
                  </span>
                  <div className="social-card-text">
                    <span className="social-card-name">TikTok</span>
                    <span className="social-card-handle">@manutdcyprussc</span>
                  </div>
                  <span className="social-card-chevron" aria-hidden>
                    ↗
                  </span>
                </a>
              </li>
            </ul>
          </div>
        )}
        {activePage === 'merchandise' && showMerchandise && (
          <div className={`section-page merch-page ${merchCartCount > 0 && merchView === 'shop' ? 'merch-page--with-basket' : ''}`}>
            <header className="merch-hero">
              <p className="merch-eyebrow">Official club shop</p>
              <h1 className="section-title merch-hero-title">Merchandise</h1>
            </header>

            {!user && (
              <p className="auth-message merch-signin-banner" role="status">
                Sign in to add items to your basket and place an order.
              </p>
            )}

            {merchView === 'shop' && merchOrderMessage && (
              <p
                className={`auth-message ${merchOrderMessage.startsWith('Order submitted') ? 'is-success' : 'is-error'}`}
                role="status"
              >
                {merchOrderMessage}
              </p>
            )}

            {merchView === 'checkout' && user ? (
              <div className="merch-checkout">
                <div className="merch-checkout-head">
                  <button
                    type="button"
                    className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                    onClick={() => {
                      setMerchView('shop')
                      setMerchOrderMessage(null)
                    }}
                  >
                    Back to shop
                  </button>
                  <h2 className="merch-checkout-title">Your basket</h2>
                </div>

                {merchCartLines.length === 0 ? (
                  <p className="section-lead merch-empty">Your basket is empty.</p>
                ) : (
                  <>
                    <ul className="merch-checkout-lines">
                      {merchCartLines.map((line) => (
                        <li key={line.productId} className="merch-checkout-line">
                          <div className="merch-checkout-line-main">
                            <span className="merch-checkout-line-title">{line.title}</span>
                            <span className="merch-checkout-line-meta">
                              €{line.unitPriceEur.toFixed(2)} × {line.quantity}
                            </span>
                          </div>
                          <span className="merch-checkout-line-total">
                            €{(line.unitPriceEur * line.quantity).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="merch-checkout-grand">
                      <span>Items total</span>
                      <strong>€{merchCartTotal.toFixed(2)}</strong>
                    </p>
                    <p className="merch-delivery-note" role="note">
                      Delivery is sent via ACS or Akis Express. <strong>Delivery cost is charged to you</strong> when you
                      collect or receive the parcel — it is not included in the product total above.
                    </p>

                    <label className="auth-field membership-field">
                      <span className="auth-label">ACS / Akis Express branch or locker</span>
                      <textarea
                        className="auth-input admin-news-textarea"
                        name="merch-delivery-branch"
                        rows={3}
                        placeholder="e.g. Akis Express — Nicosia Hub, Strovolos 123…"
                        value={merchDeliveryBranch}
                        onChange={(ev) => setMerchDeliveryBranch(ev.target.value)}
                        disabled={merchOrderSubmitting}
                      />
                    </label>

                    <p className="membership-payment-intro merch-checkout-pay-intro">
                      Pay the <strong>items total</strong> using bank transfer, Revolut, or Stripe below. For manual
                      transfers, include your <strong>full name</strong>
                      {membershipRecord?.membershipNumber ? (
                        <>
                          {' '}
                          and <strong>membership number {formatMembershipNumber(membershipRecord.membershipNumber)}</strong>
                        </>
                      ) : null}{' '}
                      in the payment reference.
                    </p>

                    <ClubPaymentMethodsBlock
                      heading="Payment methods"
                      headingId="merch-checkout-payment-heading"
                      stripe={{
                        amountEur: merchCartTotal,
                        description: 'Cyprus MU Supporters Club — merchandise order',
                        paymentKind: 'merchandise',
                        returnPath: '/merchandise',
                      }}
                    />

                    {merchOrderMessage && (
                      <p className="auth-message is-error" role="status">
                        {merchOrderMessage}
                      </p>
                    )}

                    <button
                      type="button"
                      className="mycmusc-reg-btn mycmusc-reg-btn--primary merch-checkout-submit"
                      disabled={merchOrderSubmitting || merchCartLines.length === 0}
                      onClick={() => void submitMerchandiseOrder()}
                    >
                      {merchOrderSubmitting ? 'Submitting…' : 'Submit order'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {merchLoading ? (
                  <p className="section-lead merch-shelf-msg merch-shelf-msg--loading">Loading products…</p>
                ) : merchProducts.length === 0 ? (
                  <p className="section-lead merch-shelf-msg merch-shelf-msg--empty">No products yet. Check back soon.</p>
                ) : (
                  <ul className="merch-grid">
                    {merchProducts.map((p) => {
                      const cover = p.photos[0]
                      const qty = merchCart[p.id] ?? 0
                      return (
                        <li key={p.id} className="merch-card">
                          <div className="merch-card-visual">
                            {cover ? (
                              <img src={cover} alt="" className="merch-card-img" />
                            ) : (
                              <div className="merch-card-placeholder" aria-hidden>
                                No photo
                              </div>
                            )}
                          </div>
                          <div className="merch-card-body">
                            <h2 className="merch-card-title">{p.title}</h2>
                            <p className="merch-card-price">€{p.priceEur.toFixed(2)}</p>
                            {p.photos.length > 1 && (
                              <ul className="merch-card-thumbs" aria-label="More photos">
                                {p.photos.slice(1).map((src, i) => (
                                  <li key={`${p.id}-extra-${i}`}>
                                    <img src={src} alt="" className="merch-card-thumb" />
                                  </li>
                                ))}
                              </ul>
                            )}
                            {user ? (
                              <div className="merch-qty-row">
                                <span className="merch-qty-label">Quantity</span>
                                <div className="merch-qty-controls">
                                  <button
                                    type="button"
                                    className="merch-qty-btn"
                                    aria-label="Decrease quantity"
                                    disabled={qty <= 0}
                                    onClick={() =>
                                      setMerchCart((prev) => {
                                        const next = { ...prev }
                                        const q = (next[p.id] ?? 0) - 1
                                        if (q <= 0) delete next[p.id]
                                        else next[p.id] = q
                                        return next
                                      })
                                    }
                                  >
                                    −
                                  </button>
                                  <span className="merch-qty-value" aria-live="polite">
                                    {qty}
                                  </span>
                                  <button
                                    type="button"
                                    className="merch-qty-btn"
                                    aria-label="Increase quantity"
                                    onClick={() =>
                                      setMerchCart((prev) => ({
                                        ...prev,
                                        [p.id]: Math.min(99, (prev[p.id] ?? 0) + 1),
                                      }))
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="merch-card-signin-hint">Sign in to order.</p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {user && merchCartCount > 0 && merchView === 'shop' && (
                  <div className="merch-basket-bar">
                    <button
                      type="button"
                      className="merch-basket-btn"
                      onClick={() => {
                        setMerchOrderMessage(null)
                        setMerchView('checkout')
                      }}
                    >
                      <span className="merch-basket-label">Basket</span>
                      <span className="merch-basket-meta">
                        {merchCartCount} item{merchCartCount === 1 ? '' : 's'} · €{merchCartTotal.toFixed(2)}
                      </span>
                    </button>
                  </div>
                )}

                {user && merchMyOrders.length > 0 && (
                  <section className="merch-orders" aria-labelledby="merch-orders-heading">
                    <h2 id="merch-orders-heading" className="merch-orders-title">
                      Your recent orders
                    </h2>
                    {merchOrdersLoading ? (
                      <p className="section-lead">Loading orders…</p>
                    ) : (
                      <ul className="merch-orders-list">
                        {merchMyOrders.map((o) => (
                          <li key={o.id} className="merch-order-card">
                            <div className="merch-order-row">
                              <span className="merch-order-date">
                                {new Date(o.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                              <span className={`merch-order-status merch-order-status--${o.status}`}>{o.status}</span>
                            </div>
                            <p className="merch-order-total">
                              <strong>€{o.totalEur.toFixed(2)}</strong>
                            </p>
                            <p className="merch-order-branch">
                              <span className="merch-order-branch-label">Delivery:</span> {o.deliveryBranch}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        )}
        {activePage === 'official-membership' && (
          <div className="section-page official-membership-page">
            {membershipLoading ? (
              <p className="section-lead">Loading membership…</p>
            ) : membershipRecord ? (
              <OfficialMembershipRequestSection
                officialOffers={officialOffers}
                officialOffersLoading={officialOffersLoading}
                myOfficialRequests={myOfficialRequests}
                membershipApplicationId={
                  officialMembershipApplicationId ?? membershipRecord.applicationId
                }
                familyMemberLabel={
                  officialMembershipFamilyMember
                    ? `${officialMembershipFamilyMember.firstName} ${officialMembershipFamilyMember.lastName}`.trim()
                    : null
                }
                onRefreshRequests={loadMyOfficialRequests}
                returnPath="/official-membership"
                onBack={() => {
                  setOfficialMembershipApplicationId(null)
                  openPage('mycmusc')
                }}
              />
            ) : (
              <>
                <h1 className="section-title">Official Manchester United membership</h1>
                <p className="section-lead">
                  Complete your Cyprus club membership in MY MUCY before requesting official Manchester United
                  membership.
                </p>
                <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--primary" onClick={() => openPage('mycmusc')}>
                  Go to MY MUCY
                </button>
              </>
            )}
          </div>
        )}
        {activePage === 'mycmusc' && (
          <div className="section-page mycmusc-page">
            <h1 className="section-title">MY MUCY</h1>
            {membershipLoading ? (
              <p className="section-lead">Loading membership…</p>
            ) : isMembershipActive && membershipRecord ? (
              showFamilyMemberForm ? (
                <CyprusMembershipForm
                  variant="family"
                  onBack={() => setShowFamilyMemberForm(false)}
                  officialOffers={officialOffers}
                  officialOffersLoading={officialOffersLoading}
                  onSubmitApplication={submitFamilyMemberApplication}
                />
              ) : familyPendingRecord ? (
                <MembershipPendingView
                  record={familyPendingRecord}
                  officialOffers={officialOffers}
                  myOfficialRequests={myOfficialRequests}
                  isFamilyMember
                  onBack={() => setFamilyPendingRecord(null)}
                />
              ) : (
              (() => {
                const validUntilIso =
                  membershipRecord.validUntil?.trim() || defaultMembershipValidUntilIso()
                const nextLabels = nextSeasonPeriodLabels(validUntilIso)
                const showRenewalBanner =
                  isInRenewalNoticeWindow(validUntilIso) && !myPendingRenewal
                return (
              <>
                <p className="section-lead mycmusc-reg-lead">
                  Welcome, <strong>{welcomeFirstName}</strong>
                </p>
                <div className="mycmusc-member-header">
                  <div className="mycmusc-member-status-row">
                    <span className="mycmusc-status-label">Membership status</span>
                    <span className="mycmusc-status-badge mycmusc-status-badge--active">Activated</span>
                  </div>
                  <p className="mycmusc-member-number">
                    <span className="mycmusc-member-number-label">Membership no.</span>{' '}
                    <strong className="mycmusc-member-number-value">
                      {formatMembershipNumber(membershipRecord.membershipNumber)}
                    </strong>
                  </p>
                  <p className="mycmusc-renewal-until">
                    Activated until {formatValidUntilLabel(validUntilIso)}
                  </p>
                  {myPendingRenewal && (
                    <div className="mycmusc-renewal-pending-banner" role="status">
                      <p className="mycmusc-renewal-pending-title">Renewal pending approval</p>
                      <p className="mycmusc-renewal-pending-text">
                        We received your renewal on{' '}
                        {new Date(myPendingRenewal.submitted_at).toLocaleString('en-GB')}. The committee will
                        confirm payment and extend your membership — you will see an updated &quot;Activated
                        until&quot; date here once that is done.
                      </p>
                    </div>
                  )}
                  {showRenewalBanner && (
                    <div className="mycmusc-renewal-callout" role="region" aria-label="Membership renewal">
                      <p className="mycmusc-renewal-callout-title">Time to renew</p>
                      <p className="mycmusc-renewal-callout-text">
                        Your membership for this season ends on{' '}
                        <strong>{formatValidUntilLabel(validUntilIso)}</strong>. Renew now for the next season (
                        {nextLabels.start} – {nextLabels.end}).
                      </p>
                      <button
                        type="button"
                        className="mycmusc-reg-btn mycmusc-reg-btn--primary renewal-open-modal-btn"
                        onClick={() => {
                          setRenewalSubmitError(null)
                          setRenewalModalOpen(true)
                        }}
                      >
                        Renew membership
                      </button>
                    </div>
                  )}
                  {membershipRecord.membershipNumber == null && (
                    <p className="mycmusc-migration-hint" role="note">
                      If you do not see a number yet, the Neon database may need the latest server migrations. Your
                      admin can run <code className="admin-inline-code">npm run migrate</code> against production, then
                      refresh this page.
                    </p>
                  )}
                </div>

                <div className="mycmusc-profile-card">
                  <h2 className="mycmusc-profile-card-title">Your details</h2>
                  <div className="mycmusc-membership-summary" aria-label="Official membership ID">
                    <div className="mycmusc-summary-row">
                      <span className="mycmusc-summary-label">Official Man Utd ID number</span>
                      <span
                        className={`mycmusc-summary-value ${membershipRecord.officialMuMembershipId?.trim() ? 'mycmusc-summary-value--mono' : ''}`}
                      >
                        {formatOfficialMuMembershipId(membershipRecord.officialMuMembershipId)}
                      </span>
                    </div>
                    <div className="mycmusc-summary-row">
                      <span className="mycmusc-summary-label">Official MU status</span>
                      <span className="mycmusc-summary-value">
                        {formatOfficialMuMembershipStatus(membershipRecord.officialMuMembershipStatus)}
                      </span>
                    </div>
                  </div>
                  {detailsEditOpen ? (
                    <div className="mycmusc-reg-form">
                      {detailsError && <p className="auth-message is-error">{detailsError}</p>}
                      <label className="auth-field membership-field">
                        <span className="auth-label">Account name</span>
                        <input className="auth-input" value={detailsFullName} onChange={(e) => setDetailsFullName(e.target.value)} />
                      </label>
                      <label className="auth-field membership-field">
                        <span className="auth-label">Mobile</span>
                        <input className="auth-input" value={detailsMobilePhone} onChange={(e) => setDetailsMobilePhone(e.target.value)} />
                      </label>
                      <label className="auth-field membership-field">
                        <span className="auth-label">Address</span>
                        <input className="auth-input" value={detailsAddress} onChange={(e) => setDetailsAddress(e.target.value)} />
                      </label>
                      <div className="merch-admin-grid">
                        <label className="auth-field membership-field">
                          <span className="auth-label">Area</span>
                          <input className="auth-input" value={detailsArea} onChange={(e) => setDetailsArea(e.target.value)} />
                        </label>
                        <label className="auth-field membership-field">
                          <span className="auth-label">Postal code</span>
                          <input className="auth-input" value={detailsPostalCode} onChange={(e) => setDetailsPostalCode(e.target.value)} />
                        </label>
                      </div>
                      <div className="merch-admin-grid">
                        <label className="auth-field membership-field">
                          <span className="auth-label">City</span>
                          <input className="auth-input" value={detailsCity} onChange={(e) => setDetailsCity(e.target.value)} />
                        </label>
                        <label className="auth-field membership-field">
                          <span className="auth-label">Country</span>
                          <input className="auth-input" value={detailsCountry} onChange={(e) => setDetailsCountry(e.target.value)} />
                        </label>
                      </div>
                      <OfficialMuMembershipFields
                        membershipId={detailsOfficialMuId}
                        onMembershipIdChange={setDetailsOfficialMuId}
                        status={detailsOfficialMuStatus}
                        onStatusChange={setDetailsOfficialMuStatus}
                        idInputName="profile-official-mu-id"
                        statusReadOnly
                        statusHint="Add or update your official MU membership. Choose Activated when your Manchester United membership is active, or Pending while you are waiting."
                      />
                      <div className="renewal-modal-actions">
                        <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--secondary" onClick={() => setDetailsEditOpen(false)}>
                          Cancel
                        </button>
                        <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--primary" onClick={() => void saveMyDetails()} disabled={detailsSaving}>
                          {detailsSaving ? 'Saving…' : 'Save details'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <dl className="mycmusc-profile-dl">
                        <div>
                          <dt>Account name</dt>
                          <dd>
                            {myProfile?.fullName?.trim()
                              ? myProfile.fullName.trim()
                              : `${membershipRecord.firstName} ${membershipRecord.lastName}`.trim()}
                          </dd>
                        </div>
                        <div>
                          <dt>Email</dt>
                          <dd>{myProfile?.email ?? user?.email ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Mobile</dt>
                          <dd>{membershipRecord.mobilePhone}</dd>
                        </div>
                        <div>
                          <dt>Date of birth</dt>
                      <dd>{formatDateOfBirthDisplay(membershipRecord.dateOfBirth) || '—'}</dd>
                        </div>
                        <div>
                          <dt>Address</dt>
                          <dd>
                            {membershipRecord.address}
                            <br />
                            {membershipRecord.area}, {membershipRecord.postalCode}
                            <br />
                            {membershipRecord.city}, {membershipRecord.country}
                          </dd>
                        </div>
                        <div>
                          <dt>Application reference</dt>
                          <dd>
                            <code className="mycmusc-inline-ref">{membershipRecord.applicationId}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Activated on</dt>
                          <dd>
                            {membershipRecord.activatedAt
                              ? new Date(membershipRecord.activatedAt).toLocaleString('en-GB')
                              : 'Not recorded'}
                          </dd>
                        </div>
                      </dl>
                      <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--secondary" onClick={() => setDetailsEditOpen(true)}>
                        Edit details
                      </button>
                    </>
                  )}
                </div>

                <section className="mycmusc-profile-card" aria-label="Family members">
                  <div className="mycmusc-family-head">
                    <h2 className="mycmusc-profile-card-title">Family members</h2>
                    <button
                      type="button"
                      className="mycmusc-family-add-btn"
                      onClick={() => {
                        setFamilyPendingRecord(null)
                        setFamilyDetailApplicationId(null)
                        setFamilyEditApplicationId(null)
                        setFamilyEditError(null)
                        setShowFamilyMemberForm(true)
                      }}
                    >
                      <span className="mycmusc-family-add-icon" aria-hidden>
                        +
                      </span>
                      Family member
                    </button>
                  </div>
                  {familyMembers.length === 0 ? (
                    <p className="section-lead merch-shelf-msg merch-shelf-msg--empty">No family members added yet.</p>
                  ) : (
                    <ul className="mycmusc-family-list">
                      {familyMembers.map((fm) => {
                        const detailOpen = familyDetailApplicationId === fm.applicationId
                        const editing = familyEditApplicationId === fm.applicationId
                        return (
                          <li key={fm.applicationId} className="mycmusc-family-list-item">
                            <div>
                              <strong>
                                {fm.firstName} {fm.lastName}
                              </strong>
                              <span className={`fixtures-ticket-pill fixtures-ticket-pill--${fm.status}`}>
                                {fm.status}
                              </span>
                            </div>
                            <small>
                              {formatFamilyRelationship(fm.familyRelationship, fm.familyRelationshipOther)}
                              {' · '}
                              Ref <code className="mycmusc-inline-ref">{fm.applicationId}</code>
                            </small>
                            {fm.status === 'active' && fm.membershipNumber != null && (
                              <p className="mycmusc-family-member-number">
                                <span className="mycmusc-member-number-label">Membership ID</span>{' '}
                                <strong className="mycmusc-member-number-value">
                                  {formatMembershipNumber(fm.membershipNumber)}
                                </strong>
                              </p>
                            )}
                            <div
                              className="mycmusc-membership-summary mycmusc-family-official-summary"
                              aria-label={`Official membership for ${fm.firstName} ${fm.lastName}`}
                            >
                              <div className="mycmusc-summary-row">
                                <span className="mycmusc-summary-label">Official Man Utd ID number</span>
                                <span
                                  className={`mycmusc-summary-value ${fm.officialMuMembershipId?.trim() ? 'mycmusc-summary-value--mono' : ''}`}
                                >
                                  {formatOfficialMuMembershipId(fm.officialMuMembershipId)}
                                </span>
                              </div>
                              <div className="mycmusc-summary-row">
                                <span className="mycmusc-summary-label">Official MU status</span>
                                <span className="mycmusc-summary-value">
                                  {formatOfficialMuMembershipStatus(fm.officialMuMembershipStatus)}
                                </span>
                              </div>
                            </div>
                            <FamilyOfficialMembershipTeaser
                              familyMember={fm}
                              myOfficialRequests={myOfficialRequests}
                              onRegister={() => {
                                setOfficialMembershipApplicationId(fm.applicationId)
                                openPage('official-membership')
                              }}
                            />
                            <div className="mycmusc-family-list-actions">
                              <button
                                type="button"
                                className="mycmusc-family-action-btn"
                                aria-expanded={detailOpen}
                                onClick={() => toggleFamilyDetail(fm)}
                              >
                                {detailOpen ? 'Hide details' : 'More info'}
                              </button>
                              <button
                                type="button"
                                className="mycmusc-family-action-btn mycmusc-family-action-btn--primary"
                                onClick={() => openFamilyEdit(fm)}
                              >
                                Edit
                              </button>
                              {fm.status === 'pending' && (
                                <button
                                  type="button"
                                  className="mycmusc-family-action-btn"
                                  onClick={() => setFamilyPendingRecord(fm)}
                                >
                                  View payment
                                </button>
                              )}
                            </div>
                            {detailOpen && (
                              <div className="mycmusc-family-detail" aria-label={`Details for ${fm.firstName} ${fm.lastName}`}>
                                {editing ? (
                                  <div className="mycmusc-reg-form">
                                    {familyEditError && <p className="auth-message is-error">{familyEditError}</p>}
                                    <div className="merch-admin-grid">
                                      <label className="auth-field membership-field">
                                        <span className="auth-label">First name</span>
                                        <input
                                          className="auth-input"
                                          value={familyEditFirstName}
                                          onChange={(e) => setFamilyEditFirstName(e.target.value)}
                                        />
                                      </label>
                                      <label className="auth-field membership-field">
                                        <span className="auth-label">Last name</span>
                                        <input
                                          className="auth-input"
                                          value={familyEditLastName}
                                          onChange={(e) => setFamilyEditLastName(e.target.value)}
                                        />
                                      </label>
                                    </div>
                                    <label className="auth-field membership-field">
                                      <span className="auth-label">Relationship to you</span>
                                      <select
                                        className="auth-input"
                                        value={familyEditRelationship}
                                        onChange={(e) => {
                                          setFamilyEditRelationship(e.target.value)
                                          if (e.target.value !== 'other') setFamilyEditRelationshipOther('')
                                        }}
                                      >
                                        <option value="">Select relationship…</option>
                                        {FAMILY_RELATIONSHIP_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    {familyEditRelationship === 'other' && (
                                      <label className="auth-field membership-field">
                                        <span className="auth-label">Please specify</span>
                                        <input
                                          className="auth-input"
                                          value={familyEditRelationshipOther}
                                          onChange={(e) => setFamilyEditRelationshipOther(e.target.value)}
                                        />
                                      </label>
                                    )}
                                    <label className="auth-field membership-field">
                                      <span className="auth-label">Mobile</span>
                                      <input
                                        className="auth-input"
                                        type="tel"
                                        value={familyEditMobilePhone}
                                        onChange={(e) => setFamilyEditMobilePhone(e.target.value)}
                                      />
                                    </label>
                                    <label className="auth-field membership-field">
                                      <span className="auth-label">Date of birth</span>
                                      <input
                                        className="auth-input membership-input-date"
                                        type="date"
                                        max={new Date().toISOString().slice(0, 10)}
                                        value={familyEditDateOfBirth}
                                        onChange={(e) => setFamilyEditDateOfBirth(e.target.value)}
                                      />
                                    </label>
                                    <label className="auth-field membership-field">
                                      <span className="auth-label">Address</span>
                                      <input
                                        className="auth-input"
                                        value={familyEditAddress}
                                        onChange={(e) => setFamilyEditAddress(e.target.value)}
                                      />
                                    </label>
                                    <div className="merch-admin-grid">
                                      <label className="auth-field membership-field">
                                        <span className="auth-label">Area</span>
                                        <input
                                          className="auth-input"
                                          value={familyEditArea}
                                          onChange={(e) => setFamilyEditArea(e.target.value)}
                                        />
                                      </label>
                                      <label className="auth-field membership-field">
                                        <span className="auth-label">Postal code</span>
                                        <input
                                          className="auth-input"
                                          value={familyEditPostalCode}
                                          onChange={(e) => setFamilyEditPostalCode(e.target.value)}
                                        />
                                      </label>
                                    </div>
                                    <div className="merch-admin-grid">
                                      <label className="auth-field membership-field">
                                        <span className="auth-label">City</span>
                                        <input
                                          className="auth-input"
                                          value={familyEditCity}
                                          onChange={(e) => setFamilyEditCity(e.target.value)}
                                        />
                                      </label>
                                      <label className="auth-field membership-field">
                                        <span className="auth-label">Country</span>
                                        <input
                                          className="auth-input"
                                          value={familyEditCountry}
                                          onChange={(e) => setFamilyEditCountry(e.target.value)}
                                        />
                                      </label>
                                    </div>
                                    <OfficialMuMembershipFields
                                      membershipId={familyEditOfficialMuId}
                                      onMembershipIdChange={setFamilyEditOfficialMuId}
                                      status={familyEditOfficialMuStatus}
                                      onStatusChange={setFamilyEditOfficialMuStatus}
                                      idInputName={`family-official-mu-id-${fm.applicationId}`}
                                      statusReadOnly
                                      statusHint="Optional official MU membership for this family member."
                                    />
                                    <div className="renewal-modal-actions">
                                      <button
                                        type="button"
                                        className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                                        onClick={() => {
                                          setFamilyEditApplicationId(null)
                                          setFamilyEditError(null)
                                          populateFamilyEditFromRecord(fm)
                                        }}
                                        disabled={familyEditSaving}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        className="mycmusc-reg-btn mycmusc-reg-btn--primary"
                                        onClick={() => void saveFamilyMemberDetails()}
                                        disabled={familyEditSaving}
                                      >
                                        {familyEditSaving ? 'Saving…' : 'Save details'}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <dl className="mycmusc-profile-dl">
                                      <div>
                                        <dt>Relationship</dt>
                                        <dd>
                                          {formatFamilyRelationship(fm.familyRelationship, fm.familyRelationshipOther)}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt>Mobile</dt>
                                        <dd>{fm.mobilePhone}</dd>
                                      </div>
                                      <div>
                                        <dt>Date of birth</dt>
                                        <dd>{formatDateOfBirthDisplay(fm.dateOfBirth) || '—'}</dd>
                                      </div>
                                      <div>
                                        <dt>Address</dt>
                                        <dd>
                                          {fm.address}
                                          <br />
                                          {fm.area}, {fm.postalCode}
                                          <br />
                                          {fm.city}, {fm.country}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt>Application reference</dt>
                                        <dd>
                                          <code className="mycmusc-inline-ref">{fm.applicationId}</code>
                                        </dd>
                                      </div>
                                      {fm.status === 'active' && (
                                        <div>
                                          <dt>Membership ID</dt>
                                          <dd>
                                            {fm.membershipNumber != null ? (
                                              <strong className="mycmusc-member-number-value">
                                                {formatMembershipNumber(fm.membershipNumber)}
                                              </strong>
                                            ) : (
                                              'Pending assignment'
                                            )}
                                          </dd>
                                        </div>
                                      )}
                                      {fm.status === 'active' && fm.activatedAt && (
                                        <div>
                                          <dt>Activated on</dt>
                                          <dd>{new Date(fm.activatedAt).toLocaleString('en-GB')}</dd>
                                        </div>
                                      )}
                                      {fm.validUntil && (
                                        <div>
                                          <dt>Activated until</dt>
                                          <dd>{formatValidUntilLabel(fm.validUntil)}</dd>
                                        </div>
                                      )}
                                    </dl>
                                    <button
                                      type="button"
                                      className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                                      onClick={() => openFamilyEdit(fm)}
                                    >
                                      Edit details
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                <OfficialMembershipTeaser
                  membershipRecord={membershipRecord}
                  myOfficialRequests={myOfficialRequests}
                  onOpenRequestPage={() => {
                    setOfficialMembershipApplicationId(null)
                    openPage('official-membership')
                  }}
                />

                <RenewMembershipModal
                  open={renewalModalOpen}
                  onClose={() => {
                    if (!renewalSubmitting) {
                      setRenewalModalOpen(false)
                      setRenewalSubmitError(null)
                    }
                  }}
                  onSubmit={submitRenewalFromModal}
                  submitting={renewalSubmitting}
                  error={renewalSubmitError}
                  currentSeasonEndLabel={formatValidUntilLabel(validUntilIso)}
                  nextSeasonStartLabel={nextLabels.start}
                  nextSeasonEndLabel={nextLabels.end}
                  applicationId={membershipRecord.applicationId}
                />
              </>
                )
              })()
              )
            ) : isMembershipPending && membershipRecord ? (
              <>
                <MembershipPendingView
                  record={membershipRecord}
                  officialOffers={officialOffers}
                  myOfficialRequests={myOfficialRequests}
                />
                <OfficialMembershipTeaser
                  membershipRecord={membershipRecord}
                  myOfficialRequests={myOfficialRequests}
                  onOpenRequestPage={() => {
                    setOfficialMembershipApplicationId(null)
                    openPage('official-membership')
                  }}
                />
              </>
            ) : showCyprusMembershipForm ? (
              <CyprusMembershipForm
                onBack={() => setShowCyprusMembershipForm(false)}
                officialOffers={officialOffers}
                officialOffersLoading={officialOffersLoading}
                onSubmitApplication={submitPendingMembershipApplication}
              />
            ) : (
              <>
                <p className="section-lead mycmusc-reg-lead">
                  Welcome, <strong>{welcomeFirstName}</strong>
                </p>
                <p className="section-lead mycmusc-reg-lead">
                  As part of the Cyprus Manchester United Supporters Club you will have access to match tickets, club
                  events, merchandise, group trips to Old Trafford, and many more!
                </p>
                <p className="section-lead mycmusc-reg-lead">
                  Please complete the registration procedure to select your Membership Package, pay your Membership Fee
                  and unlock your Membership Benefits!
                </p>
                <div className="mycmusc-reg-actions">
                  <button
                    type="button"
                    className="mycmusc-reg-btn mycmusc-reg-btn--primary"
                    onClick={() => setShowCyprusMembershipForm(true)}
                  >
                    Cyprus MU Supporters Club Membership Registration
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {activePage === 'home' && (
          <div className="home-page">
            <p className="home-welcome">
              Welcome
              {(() => {
                const profileName = myProfile?.fullName ? formatDisplayName(myProfile.fullName) : ''
                if (profileName) return `, ${profileName}`
                if (membershipRecord) return `, ${`${membershipRecord.firstName} ${membershipRecord.lastName}`.trim()}`
                const emailName = user?.email ? formatDisplayName(user.email.split('@')[0] ?? '') : ''
                return emailName ? `, ${emailName}` : ''
              })()}
              .
            </p>
            {!isMembershipActive && (
              <div className="section-card" style={{ marginBottom: '1rem' }}>
                <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
                  Cyprus Club Membership
                </h2>
                <p className="section-lead" style={{ marginBottom: '0.75rem' }}>
                  Register for Cyprus Club Membership to unlock match ticket requests.
                </p>
                <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--primary" onClick={() => openPage('mycmusc')}>
                  Register for Cyprus Club Membership
                </button>
              </div>
            )}
            {newsLoading ? (
              <p className="section-lead">Loading latest club announcements...</p>
            ) : newsPosts.length === 0 ? (
              <p className="section-lead">No news posts yet.</p>
            ) : (
              <>
                <NewsFeed
                  posts={newsPosts}
                  onReadPost={setNewsDetailPost}
                  limit={3}
                  variant="home"
                  idPrefix="home-news"
                />
                <p className="home-news-more">
                  <button type="button" className="home-news-more-link" onClick={() => openPage('news')}>
                    View all news
                  </button>
                </p>
              </>
            )}
          </div>
        )}
      </main>

      {mobileMoreOpen && (
        <button
          type="button"
          className="mobile-more-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileMoreOpen(false)}
        />
      )}
      {mobileMoreOpen && (
        <div className="mobile-nav-sheet" role="menu" aria-label="More options">
          <button
            type="button"
            role="menuitem"
            className={`mobile-nav-sheet-item ${activePage === 'board' ? 'is-active' : ''}`}
            onClick={() => openPage('board')}
          >
            Board
          </button>
          {showMerchandise && (
            <button
              type="button"
              role="menuitem"
              className={`mobile-nav-sheet-item ${activePage === 'merchandise' ? 'is-active' : ''}`}
              onClick={() => openPage('merchandise')}
            >
              Merchandise
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={`mobile-nav-sheet-item ${activePage === 'contact' ? 'is-active' : ''}`}
            onClick={() => openPage('contact')}
          >
            Contact Us
          </button>
          <div className="mobile-nav-sheet-divider" aria-hidden />
          <button
            type="button"
            role="menuitem"
            className="mobile-nav-sheet-item mobile-nav-sheet-item--signout"
            onClick={() => {
              setMobileMoreOpen(false)
              void signOut()
            }}
          >
            Sign out
          </button>
        </div>
      )}

      <div className="mobile-bottom-nav-wrap">
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          <button
            type="button"
            className={`mobile-bottom-nav-btn ${activePage === 'home' ? 'is-active' : ''}`}
            onClick={() => openPage('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={`mobile-bottom-nav-btn ${activePage === 'news' ? 'is-active' : ''}`}
            onClick={() => openPage('news')}
          >
            News
          </button>
          <button
            type="button"
            className={`mobile-bottom-nav-btn ${activePage === 'social' ? 'is-active' : ''}`}
            onClick={() => openPage('social')}
          >
            Social Media
          </button>
          <button
            type="button"
            className={`mobile-bottom-nav-btn ${mobileMoreActive || mobileMoreOpen ? 'is-active' : ''}`}
            aria-expanded={mobileMoreOpen}
            aria-haspopup="menu"
            onClick={() => setMobileMoreOpen((open) => !open)}
          >
            More
          </button>
        </nav>
      </div>

      <footer className="website-footer">
        <p>Cyprus Manchester United Supporters Club</p>
      </footer>
    </div>
  )
}

export default App
