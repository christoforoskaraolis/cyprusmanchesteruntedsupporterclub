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
  fetchAllMembershipApplications,
  fetchMyLatestApplication,
  fetchMyPendingRenewal,
  fetchMyProfile,
  fetchPendingRenewalRequests,
  formatMembershipNumber,
  generateApplicationId,
  insertMembershipApplication,
  insertRenewalRequest,
  setApplicationStatus,
  updateMyProfileDetails,
} from './lib/membershipApi.ts'
import { fetchCachedFixtures, syncFixturesFromManutd, type UpcomingFixture } from './lib/fixturesApi.ts'
import { deleteNewsPost, fetchNewsPosts, insertNewsPost, type NewsPost, updateNewsPost } from './lib/newsApi.ts'
import {
  completeMyAcceptedTicketRequest,
  type AdminFixtureTicketRequest,
  type FixtureTicketWindowStatus,
  fetchPendingFixtureTicketRequests,
  fetchFixtureTicketWindows,
  fetchMyFixtureTicketRequests,
  fixtureMatchKey,
  requestFixtureTicket,
  setFixtureTicketRequestStatus,
  upsertFixtureTicketWindow,
} from './lib/fixtureTicketsApi.ts'
import {
  deleteMerchandiseProduct,
  fetchAllMerchandiseOrders,
  fetchMerchandiseProducts,
  fetchMyMerchandiseOrders,
  insertMerchandiseOrder,
  insertMerchandiseProduct,
  updateMerchandiseOrderStatus,
  type MerchandiseOrderLine,
  type MerchandiseOrderRow,
  type MerchandiseOrderStatus,
  type MerchandiseProduct,
} from './lib/merchandiseApi.ts'
import { resizeImageFileToJpegDataUrl } from './lib/resizeImage.ts'
import { createAdminUser, deleteAdminUser, fetchAdminUsers, type AdminUserRow } from './lib/adminUsersApi.ts'
import {
  fetchAdminOfficialMembershipRequests,
  createOfficialMembershipRequest,
  createOfficialMembershipOffer,
  deleteOfficialMembershipOffer,
  fetchOfficialMembershipOffers,
  fetchMyOfficialMembershipRequests,
  setAdminOfficialMembershipRequestStatus,
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

/** Membership fee and payment details — replace IBAN / Revolut with your club’s real information. */
const MEMBERSHIP_FEE_EUR = 15
const CMUSC_PAYMENT_ACCOUNT_NAME = 'Charalambos Loizou & Demetris Nathanael'
const CMUSC_PAYMENT_IBAN = 'LT70 3250 0300 6556 3775'
const CMUSC_PAYMENT_SWIFT = 'REVOLT21'
const CMUSC_PAYMENT_BANK_NAME = 'Revolut Bank UAB'
const CMUSC_PAYMENT_BANK_ADDRESS = 'Konstitucijos ave. 21B, 08130, Vilnius, Lithuania'
const CMUSC_PAYMENT_REVOLUT = 'https://revolut.me/yourclub'
const TICKET_RESERVATION_FEE_EUR = 20

function ClubPaymentMethodFields() {
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
          <a
            className="membership-payment-revolut-link"
            href={CMUSC_PAYMENT_REVOLUT}
            target="_blank"
            rel="noopener noreferrer"
          >
            {CMUSC_PAYMENT_REVOLUT}
          </a>
        ) : (
          <p className="membership-payment-revolut-text">{CMUSC_PAYMENT_REVOLUT}</p>
        )}
      </div>
    </>
  )
}

function ClubPaymentMethodsBlock({ heading, headingId }: { heading?: string; headingId?: string }) {
  const id = headingId ?? 'club-payment-methods-heading'
  return (
    <div className="membership-payment-card merch-payment-card" role="region" aria-labelledby={id}>
      <h3 id={id} className="membership-payment-title">
        {heading ?? 'Payment'}
      </h3>
      <ClubPaymentMethodFields />
    </div>
  )
}


function formatLongDate(day: number, monthIndex: number, year: number): string {
  return new Date(year, monthIndex, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

type CyprusMembershipFormProps = {
  onBack: () => void
  onSubmitApplication: (payload: MemberApplicationPayload) => Promise<void>
}

function CyprusMembershipForm({ onBack, onSubmitApplication }: CyprusMembershipFormProps) {
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
      officialMuMembershipId: officialMuMembershipId.trim(),
    }

    setSubmitting(true)
    try {
      await onSubmitApplication(payload)
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

      <h2 className="membership-form-title">Cyprus MU Supporters Club — membership</h2>

      <div className="membership-info-card">
        <p className="membership-info-period">
          <strong>Membership season:</strong> Supporters Club membership starts on{' '}
          <strong>1 June</strong> each year and expires on <strong>31 May</strong> of the following year.
        </p>
        <p className="membership-info-current">
          The current season runs from <strong>{periodStart}</strong> to <strong>{periodEnd}</strong>.
        </p>
        <p className="membership-info-benefits">
          By becoming a member of Cyprus Manchester United Supporters Club, you are eligible for the members
          benefits.
        </p>
      </div>

      <form className="membership-form" onSubmit={handleMembershipSubmit} noValidate>
        <p className="membership-form-intro">Complete the form below to apply for membership.</p>

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

        <label className="auth-field membership-field">
          <span className="auth-label">Official Man Utd membership ID</span>
          <input
            className="auth-input"
            type="text"
            name="membership-official-mu-id"
            autoComplete="off"
            placeholder="Optional — if you already have an official Manchester United membership number"
            value={officialMuMembershipId}
            onChange={(ev) => setOfficialMuMembershipId(ev.target.value)}
          />
        </label>

        <div className="membership-payment-card" role="region" aria-labelledby="membership-payment-heading">
          <h3 id="membership-payment-heading" className="membership-payment-title">
            Payment — before you submit
          </h3>
          <p className="membership-payment-fee">
            <strong>Membership fee:</strong> €{MEMBERSHIP_FEE_EUR} for the membership season (
            {periodStart} – {periodEnd}).
          </p>
          <p className="membership-payment-intro">
            Use one of the options below to pay. Please include your <strong>full name</strong> as the payment
            reference so we can match your transfer to this application.
          </p>

          <ClubPaymentMethodFields />
        </div>

        <label className="membership-checkbox-row">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(ev) => setAgreed(ev.target.checked)}
          />
          <span>
            I understand that membership runs from 1 June to 31 May and I wish to apply for Cyprus
            Manchester United Supporters Club membership.
          </span>
        </label>

        {formError && <p className="auth-message is-error">{formError}</p>}

        <button type="submit" className="auth-submit membership-submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit membership application'}
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
            Use one of the options below. Include your <strong>full name</strong> and{' '}
            <strong>membership number</strong> in the payment reference so we can match your transfer.
          </p>
          <ClubPaymentMethodFields />
        </div>

        <label className="membership-checkbox-row renewal-modal-checkbox">
          <input
            type="checkbox"
            checked={confirmedPayment}
            onChange={(ev) => setConfirmedPayment(ev.target.checked)}
          />
          <span>
            I have paid or will pay the renewal fee using the details above and understand my renewal stays{' '}
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
        {post.imageUrl && (
          <div className="news-detail-modal-visual">
            <img src={post.imageUrl} alt="" className="news-detail-modal-img" />
          </div>
        )}
        <div className="news-detail-modal-body">{post.body}</div>
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
type AdminTab = 'members' | 'tickets' | 'news' | 'merch' | 'official'
type AdminTicketFilter = 'pending' | 'approved' | 'completed'

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
}: TicketCompletionModalProps) {
  const [confirmedPayment, setConfirmedPayment] = useState(false)

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

        <div className="membership-payment-card renewal-modal-payment" role="region" aria-labelledby="ticket-payment-heading">
          <h3 id="ticket-payment-heading" className="membership-payment-title">
            Payment details
          </h3>
          <p className="membership-payment-fee">
            <strong>Amount to reserve ticket:</strong> €{TICKET_RESERVATION_FEE_EUR}
          </p>
          <p className="membership-payment-intro">
            Use one of the options below. Include your <strong>full name</strong> and <strong>membership number</strong>{' '}
            in the payment reference so we can match your transfer.
          </p>
          <ClubPaymentMethodFields />
        </div>

        <label className="membership-checkbox-row renewal-modal-checkbox">
          <input
            type="checkbox"
            checked={confirmedPayment}
            onChange={(ev) => setConfirmedPayment(ev.target.checked)}
          />
          <span>I confirm I will pay the ticket reservation amount with the details above.</span>
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

type AdminConsoleProps = {
  memberRegistry: MemberRegistryEntry[]
  loading: boolean
  pendingRenewals: PendingRenewalListRow[]
  pendingTicketRequests: AdminFixtureTicketRequest[]
  onActivate: (applicationId: string) => Promise<void>
  onSetPending: (applicationId: string) => Promise<void>
  onCompleteRenewal: (row: PendingRenewalListRow) => Promise<void>
  onApproveTicketRequest: (row: AdminFixtureTicketRequest) => Promise<void>
  onCompleteTicketRequest: (row: AdminFixtureTicketRequest) => Promise<void>
  onCancelTicketRequest: (row: AdminFixtureTicketRequest) => Promise<void>
  newsPosts: NewsPost[]
  newsLoading: boolean
  onCreateNews: (payload: { title: string; body: string; imageUrl: string | null; publishedAt: string }) => Promise<void>
  onUpdateNews: (id: string, payload: { title: string; body: string; imageUrl: string | null; publishedAt: string }) => Promise<void>
  onDeleteNews: (id: string) => Promise<void>
  merchandiseOrders: MerchandiseOrderRow[]
  onUpdateMerchandiseOrderStatus: (orderId: string, status: MerchandiseOrderStatus) => Promise<void>
  merchandiseProducts: MerchandiseProduct[]
  onCreateMerchandiseProduct: (payload: { title: string; priceEur: number; photos: string[] }) => Promise<void>
  onDeleteMerchandiseProduct: (id: string) => Promise<void>
  ticketFixtures: UpcomingFixture[]
  ticketWindowByKey: Record<string, FixtureTicketWindowStatus>
  onSetFixtureTicketStatus: (fixture: UpcomingFixture, status: FixtureTicketWindowStatus) => Promise<void>
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
  onDeleteOfficialOffer: (id: string) => Promise<void>
  onSetOfficialRequestStatus: (
    requestId: string,
    status: 'pending' | 'completed' | 'rejected' | 'cancelled',
    officialMuMembershipId?: string,
  ) => Promise<void>
}

function AdminConsole({
  memberRegistry,
  loading,
  pendingRenewals,
  pendingTicketRequests,
  onActivate,
  onSetPending,
  onCompleteRenewal,
  onApproveTicketRequest,
  onCompleteTicketRequest,
  onCancelTicketRequest,
  newsPosts,
  newsLoading,
  onCreateNews,
  onUpdateNews,
  onDeleteNews,
  merchandiseOrders,
  onUpdateMerchandiseOrderStatus,
  merchandiseProducts,
  onCreateMerchandiseProduct,
  onDeleteMerchandiseProduct,
  ticketFixtures,
  ticketWindowByKey,
  onSetFixtureTicketStatus,
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
  onDeleteOfficialOffer,
  onSetOfficialRequestStatus,
}: AdminConsoleProps) {
  const [adminTab, setAdminTab] = useState<AdminTab>('members')
  const [filter, setFilter] = useState<AdminFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyRenewalId, setBusyRenewalId] = useState<string | null>(null)
  const [busyTicketRequestId, setBusyTicketRequestId] = useState<string | null>(null)
  const [ticketFilter, setTicketFilter] = useState<AdminTicketFilter>('pending')
  const [newsTitle, setNewsTitle] = useState('')
  const [newsBody, setNewsBody] = useState('')
  const [newsImageUrl, setNewsImageUrl] = useState('')
  const [newsPublishedAt, setNewsPublishedAt] = useState('')
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null)
  const [busyNewsId, setBusyNewsId] = useState<string | null>(null)
  const [newsError, setNewsError] = useState<string | null>(null)
  const [busyMerchOrderId, setBusyMerchOrderId] = useState<string | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')
  const [merchSearch, setMerchSearch] = useState('')
  const [busyTicketWindowKey, setBusyTicketWindowKey] = useState<string | null>(null)
  const [adminMerchTitle, setAdminMerchTitle] = useState('')
  const [adminMerchPrice, setAdminMerchPrice] = useState('')
  const [adminMerchPhotos, setAdminMerchPhotos] = useState<string[]>([])
  const [adminMerchBusy, setAdminMerchBusy] = useState(false)
  const [adminMerchError, setAdminMerchError] = useState<string | null>(null)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [adminUsersBusy, setAdminUsersBusy] = useState(false)
  const [officialTitle, setOfficialTitle] = useState('')
  const [officialPrice, setOfficialPrice] = useState('')
  const [officialImageUrl, setOfficialImageUrl] = useState('')
  const [officialBusy, setOfficialBusy] = useState(false)
  const [officialError, setOfficialError] = useState<string | null>(null)
  const [officialRequestBusyId, setOfficialRequestBusyId] = useState<string | null>(null)
  const [expandedOfficialRequestId, setExpandedOfficialRequestId] = useState<string | null>(null)
  const [officialMuIdDraftByRequestId, setOfficialMuIdDraftByRequestId] = useState<Record<string, string>>({})
  const pendingMembersCount = memberRegistry.filter((member) => member.status === 'pending').length
  const activeMembersCount = memberRegistry.filter((member) => member.status === 'active').length
  const pendingOrdersCount = merchandiseOrders.filter((order) => order.status === 'pending').length

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

  const filteredTicketRequests = pendingTicketRequests
    .filter((r) => r.status === ticketFilter)
    .filter((r) => {
      const q = ticketSearch.trim().toLowerCase()
      if (!q) return true
      return r.matchKey.toLowerCase().includes(q) || r.userId.toLowerCase().includes(q)
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

  async function onPickNewsImage(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNewsError('Please choose an image file.')
      return
    }
    if (file.size > 2_500_000) {
      setNewsError('Image is too large. Please use a file up to 2.5MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setNewsImageUrl(typeof reader.result === 'string' ? reader.result : '')
      setNewsError(null)
    }
    reader.onerror = () => setNewsError('Could not read image file.')
    reader.readAsDataURL(file)
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
            <strong className="admin-kpi-value">{pendingTicketRequests.filter((request) => request.status === 'pending').length}</strong>
          </div>
          <div className="admin-kpi-card" role="listitem">
            <span className="admin-kpi-label">Pending merch orders</span>
            <strong className="admin-kpi-value">{pendingOrdersCount}</strong>
          </div>
        </div>
        <p className="admin-page-hint">
          Admin access is controlled in <code className="admin-inline-code">profiles.is_admin</code> on Supabase.
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
      </div>

      {loading ? (
        <p className="admin-empty">Loading members…</p>
      ) : filtered.length === 0 ? (
        <p className="admin-empty">No applications in this view.</p>
      ) : (
        <ul className="admin-member-list">
          {filtered.map((m) => (
            <li key={m.applicationId} className="admin-member-card">
              <div className="admin-member-card-top">
                <div>
                  <code className="admin-member-ref">{m.applicationId}</code>
                  <p className="admin-member-name">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="admin-member-meta">
                    {m.city}, {m.country} · {m.mobilePhone}
                    {m.status === 'active' && m.membershipNumber != null && (
                      <> · Member #{formatMembershipNumber(m.membershipNumber)}</>
                    )}
                  </p>
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
              <div className="admin-member-actions">
                {m.status === 'pending' ? (
                  <button
                    type="button"
                    className="board-admin-activate"
                    disabled={busyId !== null}
                    onClick={async () => {
                      setBusyId(m.applicationId)
                      try {
                        await onActivate(m.applicationId)
                      } finally {
                        setBusyId(null)
                      }
                    }}
                  >
                    {busyId === m.applicationId ? 'Updating…' : 'Activate membership'}
                  </button>
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
              </div>
              {expandedId === m.applicationId && (
                <dl className="admin-member-dl">
                  {m.status === 'active' && (
                    <>
                      <div>
                        <dt>Membership number</dt>
                        <dd>
                          {m.membershipNumber != null
                            ? formatMembershipNumber(m.membershipNumber)
                            : '— (run latest DB migration)'}
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
                  <div>
                    <dt>Date of birth</dt>
                    <dd>{m.dateOfBirth}</dd>
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
                    <dt>Official MU ID</dt>
                    <dd>{m.officialMuMembershipId || '—'}</dd>
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
        <section className="admin-ticket-requests-block admin-panel-block" aria-label="Ticket requests">
          <div className="admin-block-head">
            <h2 className="admin-block-title">Ticket requests</h2>
            <p className="admin-block-lead">Track requests through pending, accepted, and completed stages.</p>
          </div>
          <section className="admin-panel-block" aria-label="Match ticket availability">
            <div className="admin-block-head">
              <h3 className="admin-block-title">Match ticket availability</h3>
              <p className="admin-block-lead">Open, close, or disable ticket requests for each home fixture.</p>
              <button type="button" className="fixtures-refresh-btn" onClick={() => void onSyncFixtures()} disabled={fixturesSyncing}>
                {fixturesSyncing ? 'Refreshing…' : 'Sync fixtures from manutd.com'}
              </button>
            </div>
            {ticketFixtures.length === 0 ? (
              <p className="admin-empty">No upcoming home fixtures right now.</p>
            ) : (
              <ul className="fixtures-list">
                {ticketFixtures.map((fixture) => {
                  const key = fixtureMatchKey(fixture)
                  const status = ticketWindowByKey[key] ?? 'disabled'
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
          <div className="admin-filter-row" role="tablist" aria-label="Filter ticket requests by status">
            {(['pending', 'approved', 'completed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={ticketFilter === f}
                className={`admin-filter-btn ${ticketFilter === f ? 'is-active' : ''}`}
                onClick={() => setTicketFilter(f)}
              >
                {f === 'pending' ? 'Pending' : f === 'approved' ? 'Accepted' : 'Completed'}
              </button>
            ))}
          </div>
          <div className="admin-search-row">
            <input
              className="auth-input admin-search-input"
              type="search"
              placeholder="Search ticket requests by match key or user ID"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
            />
          </div>
          {filteredTicketRequests.length === 0 ? (
            <p className="admin-empty">No {ticketFilter === 'approved' ? 'accepted' : ticketFilter} ticket requests.</p>
          ) : (
            <ul className="admin-ticket-request-list">
              {filteredTicketRequests.map((r) => (
                <li key={r.id} className="admin-ticket-request-card">
                  <div className="admin-ticket-request-main">
                    <code className="admin-member-ref">{r.matchKey}</code>
                    <p className="admin-member-meta">User: {r.userId}</p>
                    <p className="admin-renewal-meta">
                      Requested: {new Date(r.requestedAt).toLocaleString('en-GB')}
                    </p>
                    <span className={`fixtures-ticket-pill fixtures-ticket-pill--${r.status}`}>
                      {r.status === 'approved' ? 'Accepted' : r.status[0].toUpperCase() + r.status.slice(1)}
                    </span>
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
              ))}
            </ul>
          )}
        </section>
      )}
      {adminTab === 'news' && (
        <section className="admin-news-block admin-panel-block" aria-label="Manage news posts">
          <div className="admin-block-head">
            <h2 className="admin-block-title">News posts</h2>
            <p className="admin-block-lead">Create or edit posts shown on the public News page.</p>
          </div>
          <form
            className="admin-news-form"
            onSubmit={async (e) => {
              e.preventDefault()
              setNewsError(null)
              const title = newsTitle.trim()
              const body = newsBody.trim()
              const imageUrl = newsImageUrl.trim() || null
              const publishedAt = newsPublishedAt ? new Date(newsPublishedAt).toISOString() : new Date().toISOString()
              if (!title || !body) {
                setNewsError('Title and content are required.')
                return
              }
              try {
                if (editingNewsId) {
                  await onUpdateNews(editingNewsId, { title, body, imageUrl, publishedAt })
                } else {
                  await onCreateNews({ title, body, imageUrl, publishedAt })
                }
                setNewsTitle('')
                setNewsBody('')
                setNewsImageUrl('')
                setNewsPublishedAt('')
                setEditingNewsId(null)
              } catch (err) {
                setNewsError(err instanceof Error ? err.message : 'Could not save news.')
              }
            }}
          >
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
            <label className="admin-news-date-row">
              <span>Photo (optional)</span>
              <input
                className="auth-input"
                type="url"
                placeholder="https://example.com/photo.jpg"
                value={newsImageUrl}
                onChange={(e) => setNewsImageUrl(e.target.value)}
              />
            </label>
            <label className="admin-news-date-row">
              <span>Or upload photo (optional)</span>
              <input
                className="auth-input"
                type="file"
                accept="image/*"
                onChange={(e) => void onPickNewsImage(e.target.files?.[0] ?? null)}
              />
            </label>
            {newsImageUrl.trim() && (
              <img src={newsImageUrl} alt="News preview" className="admin-news-preview-image" />
            )}
            <label className="admin-news-date-row">
              <span>Publish date/time (optional)</span>
              <input
                className="auth-input"
                type="datetime-local"
                value={newsPublishedAt}
                onChange={(e) => setNewsPublishedAt(e.target.value)}
              />
            </label>
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
                    setNewsPublishedAt('')
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
                <li key={n.id} className="admin-news-card">
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
                      onClick={() => {
                        setEditingNewsId(n.id)
                        setNewsTitle(n.title)
                        setNewsBody(n.body)
                        setNewsImageUrl(n.imageUrl ?? '')
                        setNewsPublishedAt(new Date(n.publishedAt).toISOString().slice(0, 16))
                        setNewsError(null)
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="admin-revoke-btn"
                      disabled={busyNewsId !== null}
                      onClick={async () => {
                        setBusyNewsId(n.id)
                        try {
                          await onDeleteNews(n.id)
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
          </div>
          <section className="admin-panel-block" aria-label="Manage merchandise products">
            <div className="admin-block-head">
              <h3 className="admin-block-title">Manage merchandise products</h3>
              <p className="admin-block-lead">Add new products and remove existing ones.</p>
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
              {merchandiseProducts.map((product) => (
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
              ))}
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
            <p className="admin-block-lead">Add offers with title, picture, and price.</p>
          </div>
          <section className="admin-panel-block" aria-label="Official membership requests">
            <div className="admin-block-head">
              <h3 className="admin-block-title">Official membership requests</h3>
              <p className="admin-block-lead">Requests submitted by users are listed here for admin processing.</p>
            </div>
            {officialRequestsLoading ? (
              <p className="admin-empty">Loading requests…</p>
            ) : officialRequests.length === 0 ? (
              <p className="admin-empty">No requests yet.</p>
            ) : (
              <ul className="admin-ticket-request-list">
                {officialRequests.map((row) => {
                  const expanded = expandedOfficialRequestId === row.id
                  const displayName = row.user.fullName?.trim() || row.userId
                  return (
                    <li key={row.id} className="admin-ticket-request-card">
                      <div className="admin-ticket-request-main">
                        <strong>{displayName}</strong>
                        <small>
                          {row.offerTitle} · €{row.offerPriceEur.toFixed(2)} · {new Date(row.requestedAt).toLocaleString('en-GB')}
                        </small>
                      </div>
                      <div className="admin-ticket-request-actions">
                        <span className={`fixtures-ticket-pill fixtures-ticket-pill--${row.status}`}>{row.status}</span>
                        <button
                          type="button"
                          className="admin-main-tab"
                          onClick={() => {
                            if (!expanded && officialMuIdDraftByRequestId[row.id] === undefined) {
                              setOfficialMuIdDraftByRequestId((prev) => ({
                                ...prev,
                                [row.id]: row.user.officialMuMembershipId ?? '',
                              }))
                            }
                            setExpandedOfficialRequestId(expanded ? null : row.id)
                          }}
                        >
                          {expanded ? 'Hide info' : 'More info'}
                        </button>
                        <button
                          type="button"
                          className="admin-news-delete-btn"
                          disabled={officialRequestBusyId !== null}
                          onClick={async () => {
                            setOfficialRequestBusyId(row.id)
                            try {
                              await onSetOfficialRequestStatus(
                                row.id,
                                'completed',
                                (officialMuIdDraftByRequestId[row.id] ?? row.user.officialMuMembershipId ?? '').trim(),
                              )
                            } finally {
                              setOfficialRequestBusyId(null)
                            }
                          }}
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          className="admin-news-delete-btn"
                          disabled={officialRequestBusyId !== null}
                          onClick={async () => {
                            setOfficialRequestBusyId(row.id)
                            try {
                              await onSetOfficialRequestStatus(row.id, 'rejected')
                            } finally {
                              setOfficialRequestBusyId(null)
                            }
                          }}
                        >
                          Reject
                        </button>
                      </div>
                      {expanded && (
                        <div className="admin-ticket-request-main" style={{ marginTop: '0.6rem' }}>
                          <small>Name: {row.user.fullName ?? '—'}</small>
                          <small>Email: {row.user.email ?? '—'}</small>
                          <small>Mobile: {row.user.mobilePhone ?? '—'}</small>
                          <small>Date of birth: {row.user.dateOfBirth ?? '—'}</small>
                          <small>Address: {row.user.address ?? '—'}</small>
                          <small>
                            Area/Post code: {row.user.area ?? '—'} / {row.user.postalCode ?? '—'}
                          </small>
                          <small>City/Country: {row.user.city ?? '—'} / {row.user.country ?? '—'}</small>
                          <label className="auth-field membership-field">
                            <span className="auth-label">Official MU ID (set before Complete)</span>
                            <input
                              className="auth-input"
                              type="text"
                              value={officialMuIdDraftByRequestId[row.id] ?? row.user.officialMuMembershipId ?? ''}
                              onChange={(e) =>
                                setOfficialMuIdDraftByRequestId((prev) => ({
                                  ...prev,
                                  [row.id]: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <small>Application reference: {row.user.applicationId ?? '—'}</small>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
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
              {officialOffers.map((offer) => (
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
              ))}
            </ul>
          )}
        </section>
      )}
        </div>
      </div>
    </div>
  )
}

type Mode = 'sign-in' | 'create-account' | 'forgot-password'
type ActivePage = 'home' | 'board' | 'news' | 'social' | 'mycmusc' | 'tickets' | 'merchandise' | 'official-memberships'

function pageFromPath(pathname: string): ActivePage {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/contact') return 'board'
  if (clean === '/news') return 'news'
  if (clean === '/social') return 'social'
  if (clean === '/mycmusc') return 'mycmusc'
  if (clean === '/tickets') return 'tickets'
  if (clean === '/merchandise') return 'merchandise'
  if (clean === '/official-memberships') return 'official-memberships'
  return 'home'
}

function pathFromPage(page: ActivePage): string {
  if (page === 'board') return '/contact'
  if (page === 'news') return '/news'
  if (page === 'social') return '/social'
  if (page === 'mycmusc') return '/mycmusc'
  if (page === 'tickets') return '/tickets'
  if (page === 'merchandise') return '/merchandise'
  if (page === 'official-memberships') return '/official-memberships'
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

/** Short teaser for news promo cards (first meaningful line, else truncated). */
function newsBodyExcerpt(body: string, maxChars = 160): string {
  const lines = body
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const first = lines[0] ?? ''
  if (first.length >= 24 && first.length <= maxChars) return first
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= maxChars) return flat
  return `${flat.slice(0, Math.max(24, maxChars - 1)).trim()}…`
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

function formatDateOfBirthLabel(raw: string): string {
  const value = raw.trim()
  if (!value) return '—'

  // Preferred path for form-like values.
  const parsedFromInput = parseDateOfBirthInput(value)
  if (parsedFromInput) {
    return parsedFromInput.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // Handles values already stored as ISO datetime.
  const parsedIso = new Date(value)
  if (!Number.isNaN(parsedIso.getTime())) {
    return parsedIso.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return value
}

function isOldTraffordHomeFixture(f: UpcomingFixture): boolean {
  if (!f.home) return false
  const venue = f.venue.toLowerCase()
  return venue.includes('old trafford') || venue.includes('manchester')
}

function App() {
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/admin'
  const {
    configured,
    loading: authLoading,
    session,
    user,
    isAdmin,
    passwordRecoveryPending,
    refreshAdminStatus,
    signIn,
    signUp,
    verifyEmail,
    resetPasswordForEmail,
    updatePasswordAfterRecovery,
    signOut,
  } = useAuth()
  const [activePage, setActivePage] = useState<ActivePage>(() =>
    typeof window === 'undefined' ? 'home' : pageFromPath(window.location.pathname),
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [fixturesFeed, setFixturesFeed] = useState<UpcomingFixture[]>([])
  const [fixturesLoading, setFixturesLoading] = useState(false)
  const [fixturesError, setFixturesError] = useState<string | null>(null)
  const [fixturesUpdatedAt, setFixturesUpdatedAt] = useState<string | null>(null)
  const [ticketWindowByKey, setTicketWindowByKey] = useState<Record<string, FixtureTicketWindowStatus>>({})
  const [myTicketRequestByKey, setMyTicketRequestByKey] = useState<Record<string, string>>({})
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
  const [adminOfficialRequests, setAdminOfficialRequests] = useState<AdminOfficialMembershipRequest[]>([])
  const [adminOfficialRequestsLoading, setAdminOfficialRequestsLoading] = useState(false)
  const [myOfficialRequests, setMyOfficialRequests] = useState<OfficialMembershipRequest[]>([])
  const [selectedOfficialOfferId, setSelectedOfficialOfferId] = useState<string>('')
  const [officialRequestSubmitting, setOfficialRequestSubmitting] = useState(false)
  const [officialRequestMessage, setOfficialRequestMessage] = useState<string | null>(null)
  const [officialPaymentOfferId, setOfficialPaymentOfferId] = useState<string | null>(null)
  const [newsPosts, setNewsPosts] = useState<NewsPost[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsDetailPost, setNewsDetailPost] = useState<NewsPost | null>(null)
  const [showCyprusMembershipForm, setShowCyprusMembershipForm] = useState(false)
  const [ticketFormOpen, setTicketFormOpen] = useState(false)
  const [ticketFormFixture, setTicketFormFixture] = useState<UpcomingFixture | null>(null)
  const [ticketFormSubmitting, setTicketFormSubmitting] = useState(false)
  const [ticketFormSubmittedByKey, setTicketFormSubmittedByKey] = useState<Record<string, boolean>>({})
  const [myPendingRenewal, setMyPendingRenewal] = useState<DbRenewalRequest | null>(null)
  const [renewalModalOpen, setRenewalModalOpen] = useState(false)
  const [renewalSubmitting, setRenewalSubmitting] = useState(false)
  const [renewalSubmitError, setRenewalSubmitError] = useState<string | null>(null)
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('')
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [recoverySubmitting, setRecoverySubmitting] = useState(false)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
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

  const openPage = useCallback(
    (page: ActivePage, opts?: { resetSearch?: boolean; resetFixtures?: boolean }) => {
      if (opts?.resetSearch ?? true) setSearchOpen(false)
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
  /** Match ticket requests are available only to active members. */
  const showMatchTickets = Boolean(user?.id && isMembershipActive)
  /** Merchandise is available to any signed-in user. */
  const showMerchandise = Boolean(user?.id)
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
      for (const r of windowsRes.rows) next[r.matchKey] = r.requestStatus
      setTicketWindowByKey(next)
    }
    if (myReqRes.error) {
      console.error(myReqRes.error)
    } else {
      const next: Record<string, string> = {}
      for (const r of myReqRes.rows) next[r.matchKey] = r.status
      setMyTicketRequestByKey(next)
    }
  }, [upcomingFixtures, user?.id])

  useEffect(() => {
    if (!showMatchTickets && !(isAdminRoute && isAdmin)) {
      setTicketWindowByKey({})
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

  async function submitTicketRequestForMatch(fixture: UpcomingFixture) {
    if (!user?.id) return
    const key = fixtureMatchKey(fixture)
    setTicketBusyKey(key)
    const { error } = await requestFixtureTicket(key, user.id)
    setTicketBusyKey(null)
    if (error) {
      setFixturesError(`Could not request ticket: ${error.message}`)
      return
    }
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

  async function applyUpdateMerchandiseOrderStatus(orderId: string, status: MerchandiseOrderStatus) {
    const { error } = await updateMerchandiseOrderStatus(orderId, status)
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
  }

  async function applyCreateNews(payload: { title: string; body: string; imageUrl: string | null; publishedAt: string }) {
    const { error } = await insertNewsPost(payload, user?.id ?? null)
    if (error) throw new Error(error.message)
    await loadNewsPosts()
  }

  async function applyUpdateNews(
    id: string,
    payload: { title: string; body: string; imageUrl: string | null; publishedAt: string },
  ) {
    const { error } = await updateNewsPost(id, payload, user?.id ?? null)
    if (error) throw new Error(error.message)
    await loadNewsPosts()
  }

  async function applyDeleteNews(id: string) {
    const { error } = await deleteNewsPost(id)
    if (error) throw new Error(error.message)
    await loadNewsPosts()
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
    } else {
      setMyPendingRenewal(null)
    }
    setMembershipLoading(false)
  }, [user?.id])

  useEffect(() => {
    void refreshMyMembership()
  }, [refreshMyMembership])

  const loadNewsPosts = useCallback(async () => {
    setNewsLoading(true)
    const { rows, error } = await fetchNewsPosts()
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
    if (!isAdmin) {
      setAdminOfficialRequests([])
      return
    }
    setAdminOfficialRequestsLoading(true)
    const { rows, error } = await fetchAdminOfficialMembershipRequests()
    setAdminOfficialRequestsLoading(false)
    if (error) {
      console.error(error)
      setAdminOfficialRequests([])
      return
    }
    setAdminOfficialRequests(rows)
  }, [isAdmin])

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

  async function applySetOfficialRequestStatus(
    requestId: string,
    status: 'pending' | 'completed' | 'rejected' | 'cancelled',
    officialMuMembershipId?: string,
  ) {
    const { error } = await setAdminOfficialMembershipRequestStatus(requestId, status, officialMuMembershipId)
    if (error) throw error
    await loadAdminOfficialRequests()
    await refreshMyMembership()
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
    void loadNewsPosts()
  }, [session?.user?.id, loadNewsPosts])

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
    void loadAdminOfficialRequests()
  }, [loadAdminOfficialRequests])

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
    if (activePage !== 'mycmusc') setShowCyprusMembershipForm(false)
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
  }, [membershipRecord, myProfile?.fullName, detailsEditOpen])

  useEffect(() => {
    if (isMembershipPending) setShowCyprusMembershipForm(false)
  }, [isMembershipPending])

  async function submitPendingMembershipApplication(payload: MemberApplicationPayload) {
    if (!user?.id) throw new Error('You must be signed in to apply.')
    const applicationId = generateApplicationId()
    const { error } = await insertMembershipApplication(user.id, applicationId, payload)
    if (error) throw new Error(error.message)
    setShowCyprusMembershipForm(false)
    await refreshMyMembership()
  }

  async function applyActivateMembership(applicationId: string) {
    const { error } = await setApplicationStatus(applicationId, 'active')
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
    await refreshMyMembership()
  }

  async function applySetMembershipPending(applicationId: string) {
    const { error } = await setApplicationStatus(applicationId, 'pending')
    if (error) throw new Error(error.message)
    await loadAdminRegistry()
    await refreshMyMembership()
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
    setDetailsSaving(true)
    const { error } = await updateMyProfileDetails({
      fullName: detailsFullName.trim(),
      mobilePhone: detailsMobilePhone.trim(),
      address: detailsAddress.trim(),
      area: detailsArea.trim(),
      postalCode: detailsPostalCode.trim(),
      city: detailsCity.trim(),
      country: detailsCountry.trim(),
      officialMuMembershipId: detailsOfficialMuId.trim(),
    })
    setDetailsSaving(false)
    if (error) return setDetailsError(error.message)
    setDetailsEditOpen(false)
    await refreshMyMembership()
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
    setRecoverySubmitting(true)
    const { error } = await updatePasswordAfterRecovery(recoveryPassword)
    setRecoverySubmitting(false)
    if (error) {
      setRecoveryError(error.message)
      return
    }
    setRecoveryPassword('')
    setRecoveryPasswordConfirm('')
  }

  async function handleSubmit(e: FormEvent) {
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

    if (isAdminRoute || mode === 'sign-in') {
      const { error } = await signIn(email, password)
      if (error) {
        setMessage(error.message)
        return
      }
    } else {
      const { error, requiresEmailVerification } = await signUp(email, password, `${name.trim()} ${surname.trim()}`)
      if (error) {
        setMessage(error.message)
        return
      }
      if (requiresEmailVerification) {
        setMode('sign-in')
        setMessage('We sent a verification email. Please verify your email, then sign in.')
        resetForm()
        return
      }
    }

    openPage('home')
    resetForm()
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

  if (authLoading) {
    return (
      <div className="auth-layout app-loading-screen">
        <p className="app-loading-text">Loading…</p>
      </div>
    )
  }

  if (session && passwordRecoveryPending) {
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

  if (!session) {
    const authMessageSuccess =
      message?.startsWith('Check your email') ||
      message?.startsWith('If an account exists for that email')

    return (
      <div className="auth-layout">
        <div className="auth-page">
          <header className="auth-header">
            <ClubLogoMark className="auth-badge" />
            <h1 className="auth-title">{isAdminRoute ? 'Admin login' : 'Cyprus Manchester United Supporters Club'}</h1>
            <p className="auth-subtitle">{isAdminRoute ? 'Sign in with an admin account' : 'Member access'}</p>
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
                  </div>
                )}

                {message && (
                  <p className={`auth-message ${authMessageSuccess ? 'is-success' : 'is-error'}`}>{message}</p>
                )}

                <button type="submit" className="auth-submit">
                  {isAdminRoute || mode === 'sign-in' ? 'Sign in' : 'Create account'}
                </button>
              </form>

              {!isAdminRoute && (
                <p className="auth-footnote">
                  First visit? Choose <strong>Create account</strong> with your email, name, surname, and password.
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
      <div className="app-shell">
        <header className="top-bar">
          <div className="top-bar-left" />
          <button type="button" className="top-bar-logo-btn" onClick={() => (window.location.href = '/')}>
            <ClubLogoMark className="top-bar-club-logo" />
          </button>
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
              onSetPending={applySetMembershipPending}
              onCompleteRenewal={applyCompleteRenewal}
              onApproveTicketRequest={applyApproveTicketRequest}
              onCompleteTicketRequest={applyCompleteTicketRequest}
              onCancelTicketRequest={applyCancelTicketRequest}
              newsPosts={newsPosts}
              newsLoading={newsLoading}
              onCreateNews={applyCreateNews}
              onUpdateNews={applyUpdateNews}
              onDeleteNews={applyDeleteNews}
              merchandiseOrders={adminMerchandiseOrders}
              onUpdateMerchandiseOrderStatus={applyUpdateMerchandiseOrderStatus}
              merchandiseProducts={merchProducts}
              onCreateMerchandiseProduct={applyCreateMerchandiseProductFromAdmin}
              onDeleteMerchandiseProduct={applyDeleteMerchandiseProductFromAdmin}
              ticketFixtures={ticketFixtures}
              ticketWindowByKey={ticketWindowByKey}
              onSetFixtureTicketStatus={setFixtureTicketStatus}
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
              onDeleteOfficialOffer={applyDeleteOfficialOffer}
              onSetOfficialRequestStatus={applySetOfficialRequestStatus}
            />
          ) : (
            <div className="section-page admin-page">
              <h1 className="section-title">Admin access required</h1>
              <p className="section-lead">
                This account is not marked as admin. Set <code className="admin-inline-code">profiles.is_admin</code> to{' '}
                <code className="admin-inline-code">true</code> in Supabase for this user and sign in again.
              </p>
            </div>
          )}
        </main>
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

        {showMatchTickets && (
          <button
            type="button"
            className={`top-bar-icon-btn top-bar-fixtures-btn ${activePage === 'tickets' ? 'is-active' : ''}`}
            aria-label="Manchester United home fixtures and match ticket requests"
            aria-expanded={activePage === 'tickets'}
            onClick={() => openPage('tickets', { resetSearch: true, resetFixtures: false })}
          >
            <IconCalendar />
            <span className="top-bar-fixtures-label">Match ticket requests</span>
          </button>
        )}

        <div className="top-bar-right">
          <button
            type="button"
            className={`top-bar-pill-btn ${activePage === 'mycmusc' ? 'is-active' : ''}`}
            onClick={() => openPage('mycmusc')}
          >
            MY MUCY
          </button>
          <button
            type="button"
            className={`top-bar-icon-btn ${searchOpen ? 'is-active' : ''}`}
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
          <button type="button" className="top-bar-pill-btn top-bar-signout" onClick={() => void signOut()}>
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
            Contact Us
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
                          const myRequest = myTicketRequestByKey[key]
                          const busy = ticketBusyKey === key
                          if (isAdmin) {
                            return (
                              <div className="fixtures-admin-controls">
                                <span className={`fixtures-ticket-pill fixtures-ticket-pill--${status}`}>
                                  {status === 'open' ? 'Tickets open' : status === 'closed' ? 'Request closed' : 'Tickets disabled'}
                                </span>
                                <div className="fixtures-admin-btn-row">
                                  <button
                                    type="button"
                                    className={`fixtures-admin-btn ${status === 'open' ? 'is-active' : ''}`}
                                    onClick={() => void setFixtureTicketStatus(f, 'open')}
                                    disabled={busy}
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    className={`fixtures-admin-btn ${status === 'closed' ? 'is-active' : ''}`}
                                    onClick={() => void setFixtureTicketStatus(f, 'closed')}
                                    disabled={busy}
                                  >
                                    Close
                                  </button>
                                  <button
                                    type="button"
                                    className={`fixtures-admin-btn ${status === 'disabled' ? 'is-active' : ''}`}
                                    onClick={() => void setFixtureTicketStatus(f, 'disabled')}
                                    disabled={busy}
                                  >
                                    Disable
                                  </button>
                                </div>
                              </div>
                            )
                          }
                          if (myRequest === 'approved') {
                            const formSubmitted = Boolean(ticketFormSubmittedByKey[key])
                            return (
                              <div className="fixtures-approved-actions">
                                <span className="fixtures-ticket-pill fixtures-ticket-pill--approved">Accepted</span>
                                {formSubmitted ? (
                                  <span className="fixtures-ticket-pill fixtures-ticket-pill--pending">Form submitted</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="fixtures-ticket-request-btn"
                                    onClick={() => openTicketCompletionForm(f)}
                                  >
                                    Complete form
                                  </button>
                                )}
                              </div>
                            )
                          }
                          if (myRequest === 'completed') {
                            return <span className="fixtures-ticket-pill fixtures-ticket-pill--completed">Completed</span>
                          }
                          if (status === 'open') {
                            const canRequestTicket =
                              membershipRecord?.status === 'active' &&
                              Boolean(membershipRecord.officialMuMembershipId?.trim())
                            return myRequest === 'pending' ? (
                              <span className="fixtures-ticket-pill fixtures-ticket-pill--pending">Request pending</span>
                            ) : !canRequestTicket ? (
                              <p className="fixtures-ticket-eligibility-note">
                                In order to request a ticket, you need to have active club and official Man UTD membership.
                              </p>
                            ) : (
                              <button
                                type="button"
                                className="fixtures-ticket-request-btn"
                                onClick={() => {
                                  const yes = window.confirm(
                                    'Are you sure you want to submit a match ticket request for this fixture?',
                                  )
                                  if (yes) void submitTicketRequestForMatch(f)
                                }}
                                disabled={busy}
                              >
                                {busy ? 'Sending…' : 'Tickets open'}
                              </button>
                            )
                          }
                          if (myRequest === 'cancelled') {
                            return <span className="fixtures-ticket-pill fixtures-ticket-pill--closed">Request cancelled</span>
                          }
                          if (status === 'closed') {
                            return <span className="fixtures-ticket-pill fixtures-ticket-pill--closed">Request closed</span>
                          }
                          return <span className="fixtures-ticket-pill fixtures-ticket-pill--disabled">Not open yet</span>
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
        />
        <NewsDetailModal
          post={newsDetailPost}
          open={newsDetailPost !== null}
          onClose={() => setNewsDetailPost(null)}
        />
        {activePage === 'board' && (
          <div className="board-page">
            <h1 className="board-title">Contact Us</h1>
            <p className="board-lead">Reach the Cyprus Manchester United Supporters Club committee:</p>
            <ul className="contact-list">
              <li className="contact-card">
                <p className="contact-role">Club Chairman</p>
                <p className="contact-name">Demitris Nathanael</p>
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
            <h1 className="section-title">News</h1>
            <p className="section-lead news-promo-page-lead">
              Tap <strong>More info</strong> on a card to read the full announcement.
            </p>
            {newsLoading ? (
              <p className="section-lead">Loading latest club announcements...</p>
            ) : newsPosts.length === 0 ? (
              <p className="section-lead">
                No posts yet. Club announcements and matchday updates will appear here.
              </p>
            ) : (
              <ul className="news-promo-grid">
                {newsPosts.map((post) => (
                  <li key={post.id}>
                    <article
                      className={`news-promo-card ${post.imageUrl ? '' : 'news-promo-card--no-image'}`}
                      aria-labelledby={`news-promo-title-${post.id}`}
                    >
                      {post.imageUrl ? (
                        <div
                          className="news-promo-card-bg"
                          style={{ backgroundImage: `url(${post.imageUrl})` }}
                          role="img"
                          aria-hidden
                        />
                      ) : null}
                      <div className="news-promo-card-overlay" aria-hidden />
                      <div className="news-promo-card-inner">
                        <h2 id={`news-promo-title-${post.id}`} className="news-promo-card-title">
                          {post.title}
                        </h2>
                        <p className="news-promo-card-excerpt">{newsBodyExcerpt(post.body)}</p>
                        <button
                          type="button"
                          className="news-promo-card-btn"
                          onClick={() => setNewsDetailPost(post)}
                        >
                          More info
                        </button>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
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
                      Pay the <strong>items total</strong> using one of the options below. Include your{' '}
                      <strong>full name</strong>
                      {membershipRecord?.membershipNumber ? (
                        <>
                          {' '}
                          and <strong>membership number {formatMembershipNumber(membershipRecord.membershipNumber)}</strong>
                        </>
                      ) : null}{' '}
                      in the payment reference so we can match your transfer to this order.
                    </p>

                    <ClubPaymentMethodsBlock heading="Payment methods" headingId="merch-checkout-payment-heading" />

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
          </div>
        )}
        {activePage === 'mycmusc' && (
          <div className="section-page mycmusc-page">
            <h1 className="section-title">MY MUCY</h1>
            {membershipLoading ? (
              <p className="section-lead">Loading membership…</p>
            ) : isMembershipActive && membershipRecord ? (
              (() => {
                const validUntilIso =
                  membershipRecord.validUntil?.trim() || defaultMembershipValidUntilIso()
                const nextLabels = nextSeasonPeriodLabels(validUntilIso)
                const showRenewalBanner =
                  isInRenewalNoticeWindow(validUntilIso) && !myPendingRenewal
                return (
              <>
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
                      If you do not see a number yet, the club database needs the latest migration (
                      <code className="admin-inline-code">20260411140000_membership_serial_number.sql</code>
                      ). Your admin can run it in the Supabase SQL Editor; then refresh this page.
                    </p>
                  )}
                </div>

                <div className="mycmusc-profile-card">
                  <h2 className="mycmusc-profile-card-title">Your details</h2>
                  <div className="mycmusc-membership-summary" aria-label="Activation and official membership ID">
                    <div className="mycmusc-summary-row">
                      <span className="mycmusc-summary-label">Activated on</span>
                      <span className="mycmusc-summary-value">
                        {membershipRecord.activatedAt
                          ? new Date(membershipRecord.activatedAt).toLocaleString('en-GB')
                          : 'Not recorded'}
                      </span>
                    </div>
                    <div className="mycmusc-summary-row">
                      <span className="mycmusc-summary-label">Official Man Utd ID number</span>
                      <span
                        className={`mycmusc-summary-value ${membershipRecord.officialMuMembershipId?.trim() ? 'mycmusc-summary-value--mono' : ''}`}
                      >
                        {membershipRecord.officialMuMembershipId?.trim()
                          ? membershipRecord.officialMuMembershipId.trim()
                          : 'Not on file (optional — add when you have a number from Manchester United)'}
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
                      <label className="auth-field membership-field">
                        <span className="auth-label">Official Man Utd ID number (optional)</span>
                        <input className="auth-input" value={detailsOfficialMuId} onChange={(e) => setDetailsOfficialMuId(e.target.value)} />
                      </label>
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
                      <dd>{formatDateOfBirthLabel(membershipRecord.dateOfBirth)}</dd>
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
                      </dl>
                      <button type="button" className="mycmusc-reg-btn mycmusc-reg-btn--secondary" onClick={() => setDetailsEditOpen(true)}>
                        Edit details
                      </button>
                    </>
                  )}
                </div>

                <p className="section-lead mycmusc-active-footnote">
                  Your Cyprus membership is active. Get or renew your official Manchester United membership from
                  here.
                </p>
                {officialOffersLoading ? (
                  <p className="section-lead merch-shelf-msg merch-shelf-msg--loading">Loading official memberships…</p>
                ) : officialOffers.length === 0 ? (
                  <p className="section-lead merch-shelf-msg merch-shelf-msg--empty">
                    No official membership options available yet. Please check again soon.
                  </p>
                ) : (
                  <div className="mycmusc-reg-actions mycmusc-reg-actions--after-cyprus">
                    <button
                      type="button"
                      className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                      onClick={() => {
                        setOfficialRequestMessage(null)
                        openPage('official-memberships')
                      }}
                    >
                      Get or Renew your Official Manchester United Membership from here
                    </button>
                  </div>
                )}

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
                />
              </>
                )
              })()
            ) : isMembershipPending && membershipRecord ? (
              <div className="membership-pending-card">
                <p className="membership-pending-title">Application received</p>
                <p className="section-lead membership-pending-lead">
                  Thank you. Your membership application is <strong>pending</strong>. The committee will
                  check your details and payment, then activate your membership.
                </p>
                <p className="membership-pending-ref-label">Your unique application reference (save this):</p>
                <code className="membership-pending-ref" tabIndex={0}>
                  {membershipRecord.applicationId}
                </code>
                <p className="membership-pending-meta">
                  Submitted: {new Date(membershipRecord.submittedAt).toLocaleString('en-GB')}
                </p>
                <p className="mycmusc-reg-hint membership-pending-footnote" role="note">
                  Once the committee activates your Cyprus club membership, you will <strong>unlock</strong> official
                  Manchester United membership registration, <strong>match ticket requests</strong>,{' '}
                  <strong>Merchandise</strong>, and other member-only areas of the app.
                </p>
              </div>
            ) : showCyprusMembershipForm ? (
              <CyprusMembershipForm
                onBack={() => setShowCyprusMembershipForm(false)}
                onSubmitApplication={submitPendingMembershipApplication}
              />
            ) : (
              <>
                <p className="section-lead mycmusc-reg-lead">
                  Start by registering with the <strong>Cyprus MU Supporters Club</strong>. When your Cyprus club
                  membership is <strong>active</strong>, that unlocks official{' '}
                  <strong>Manchester United membership</strong> registration — and other member-only features such as{' '}
                  <strong>match ticket requests</strong> and <strong>Merchandise</strong>.
                </p>
                <div className="mycmusc-reg-actions">
                  <button
                    type="button"
                    className="mycmusc-reg-btn mycmusc-reg-btn--primary"
                    onClick={() => setShowCyprusMembershipForm(true)}
                  >
                    Cyprus MU Supporters Club Membership Registration
                  </button>
                  <button
                    type="button"
                    className="mycmusc-reg-btn mycmusc-reg-btn--secondary"
                    disabled
                    title="Complete Cyprus MU Supporters Club membership first"
                  >
                    Register for Official Man Utd Membership Registration
                  </button>
                </div>
                <p className="mycmusc-reg-hint" role="note">
                  Registering for Cyprus club membership is what lets you unlock official MU membership, match ticket
                  requests, Merchandise, and the rest of the members&apos; experience once your application is approved and
                  activated.
                </p>
              </>
            )}
          </div>
        )}
        {activePage === 'official-memberships' && (
          <div className="section-page mycmusc-page">
            <h1 className="section-title">Official Manchester United Membership</h1>
            <p className="section-lead">Select a membership option, then request it with the button below.</p>
            {officialOffersLoading ? (
              <p className="section-lead merch-shelf-msg merch-shelf-msg--loading">Loading official memberships…</p>
            ) : officialOffers.length === 0 ? (
              <p className="section-lead merch-shelf-msg merch-shelf-msg--empty">No official membership options yet.</p>
            ) : (
              <>
                <ul className="merch-grid">
                  {officialOffers.map((offer) => {
                    const selected = selectedOfficialOfferId === offer.id
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
                          <h2 className="merch-card-title">{offer.title}</h2>
                          <p className="merch-card-price">€{offer.priceEur.toFixed(2)}</p>
                          <button
                            type="button"
                            className={`mycmusc-reg-btn ${selected ? 'mycmusc-reg-btn--primary' : 'mycmusc-reg-btn--secondary'}`}
                            onClick={() => setSelectedOfficialOfferId(offer.id)}
                          >
                            {selected ? 'Selected' : 'Select option'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>

                {officialRequestMessage && (
                  <p
                    className={`auth-message ${officialRequestMessage.startsWith('Request submitted') ? 'is-success' : 'is-error'}`}
                    role="status"
                  >
                    {officialRequestMessage}
                  </p>
                )}

                <button
                  type="button"
                  className="mycmusc-reg-btn mycmusc-reg-btn--primary"
                  disabled={!selectedOfficialOfferId || officialRequestSubmitting}
                  onClick={async () => {
                    if (!selectedOfficialOfferId) return
                    setOfficialRequestSubmitting(true)
                    setOfficialRequestMessage(null)
                    const { error } = await createOfficialMembershipRequest(selectedOfficialOfferId)
                    setOfficialRequestSubmitting(false)
                    if (error) {
                      setOfficialRequestMessage(error.message)
                      return
                    }
                    await loadMyOfficialRequests()
                    setOfficialRequestMessage('Request submitted successfully. Admin will review it.')
                    setOfficialPaymentOfferId(selectedOfficialOfferId)
                  }}
                >
                  {officialRequestSubmitting ? 'Submitting…' : 'Request selected membership'}
                </button>

                {officialPaymentOfferId && (
                  <div className="mycmusc-profile-card" style={{ marginTop: '1rem' }}>
                    {(() => {
                      const offer = officialOffers.find((o) => o.id === officialPaymentOfferId)
                      const price = offer?.priceEur ?? MEMBERSHIP_FEE_EUR
                      return (
                        <>
                          <h2 className="mycmusc-profile-card-title">Payment details</h2>
                          <p className="membership-payment-intro">
                            Your request is submitted. To proceed, pay <strong>€{price.toFixed(2)}</strong> with the details
                            below and include your full name in payment reference.
                          </p>
                          <ClubPaymentMethodsBlock
                            heading="Official membership payment methods"
                            headingId="official-membership-payment-heading"
                          />
                        </>
                      )
                    })()}
                  </div>
                )}

                {myOfficialRequests.length > 0 && (
                  <section className="merch-orders" aria-labelledby="official-requests-heading">
                    <h2 id="official-requests-heading" className="merch-orders-title">
                      Your membership requests
                    </h2>
                    <ul className="merch-orders-list">
                      {myOfficialRequests.map((row) => (
                        <li key={row.id} className="merch-order-card">
                          <div className="merch-order-head">
                            <strong>Request {row.id.slice(0, 8).toUpperCase()}</strong>
                            <span className={`fixtures-ticket-pill fixtures-ticket-pill--${row.status}`}>{row.status}</span>
                          </div>
                          <p className="merch-order-meta">Submitted: {new Date(row.requestedAt).toLocaleString('en-GB')}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
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
                <button type="button" className="top-bar-pill-btn" onClick={() => openPage('mycmusc')}>
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
                <ul className="news-promo-grid news-promo-grid--home">
                  {newsPosts.slice(0, 2).map((post) => (
                    <li key={post.id}>
                      <article
                        className={`news-promo-card ${post.imageUrl ? '' : 'news-promo-card--no-image'}`}
                        aria-labelledby={`home-news-promo-${post.id}`}
                      >
                        {post.imageUrl ? (
                          <div
                            className="news-promo-card-bg"
                            style={{ backgroundImage: `url(${post.imageUrl})` }}
                            role="img"
                            aria-hidden
                          />
                        ) : null}
                        <div className="news-promo-card-overlay" aria-hidden />
                        <div className="news-promo-card-inner">
                          <h2 id={`home-news-promo-${post.id}`} className="news-promo-card-title">
                            {post.title}
                          </h2>
                          <p className="news-promo-card-excerpt">{newsBodyExcerpt(post.body)}</p>
                          <button
                            type="button"
                            className="news-promo-card-btn"
                            onClick={() => setNewsDetailPost(post)}
                          >
                            More info
                          </button>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
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

      <footer className="website-footer">
        <p>Cyprus Manchester United Supporters Club</p>
      </footer>
    </div>
  )
}

export default App
