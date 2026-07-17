import { formatFixtureMatchKeyForEmail } from './fixtureMatchKey.ts'
import { clubEmailClosingHtml, clubEmailClosingText } from './clubEmailSignature.ts'
import { sendEmail } from './email.ts'

const SUBJECT =
  'Το Cyprus Manchester United Supporters Club έχει εξασφαλίσει εισιτήριο για εσάς στο Old Trafford!'

function formatAmountEur(amountEur: number): string {
  return amountEur.toFixed(2)
}

function normalizePaymentDeadlineInput(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, '0')
    const day = String(value.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const trimmed = String(value).trim()
  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoPrefix) return isoPrefix[1]!

  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear()
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
    const day = String(parsed.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return trimmed
}

function formatPaymentDeadlineGreek(deadline: string | Date): string {
  const iso = normalizePaymentDeadlineInput(deadline)
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(deadline)

  const dt = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return iso

  return dt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatRemainingAmountLines(options: {
  balanceRemainingAmountEur: number
  perTicketAmountEur: number
  ticketSlotCount: number
}): { textBlock: string; htmlBlock: string } {
  const total = formatAmountEur(options.balanceRemainingAmountEur)
  if (options.ticketSlotCount <= 1) {
    return {
      textBlock: `€${total}`,
      htmlBlock: `<p><strong>€${total}</strong></p>`,
    }
  }

  const perTicket = formatAmountEur(options.perTicketAmountEur)
  const slots = options.ticketSlotCount
  const explanation =
    `Το υπόλοιπο ποσό υπολογίζεται ανά εισιτήριο (€${perTicket}) και πολλαπλασιάζεται επί ${slots} εισιτήρια ` +
    `(εσείς και οι συνοδοί σας στο αίτημα).`
  return {
    textBlock: `€${total}\n(€${perTicket} × ${slots} εισιτήρια)\n\n${explanation}`,
    htmlBlock:
      `<p><strong>€${total}</strong><br>(€${perTicket} × ${slots} εισιτήρια)</p>` +
      `<p>${explanation}</p>`,
  }
}

function securedTicketsLine(ticketSlotCount: number): string {
  if (ticketSlotCount <= 1) {
    return 'έχει εγκριθεί και ο Cyprus Manchester United Supporters Club έχει εξασφαλίσει εισιτήριο για εσάς στο Old Trafford!'
  }
  return `έχει εγκριθεί και ο Cyprus Manchester United Supporters Club έχει εξασφαλίσει ${ticketSlotCount} εισιτήρια για εσάς στο Old Trafford!`
}

function issuedTicketsLine(ticketSlotCount: number): string {
  if (ticketSlotCount <= 1) {
    return 'Μετά την παραλαβή της πληρωμής σας, το εισιτήριό σας θα εκδοθεί και θα εμφανιστεί στον επίσημο λογαριασμό σας μέσω της εφαρμογής της Manchester United. Παράλληλα, θα λάβετε και σχετική επιβεβαίωση από τη Manchester United στο email σας.'
  }
  return 'Μετά την παραλαβή της πληρωμής σας, τα εισιτήριά σας θα εκδοθούν και θα εμφανιστούν στον επίσημο λογαριασμό σας μέσω της εφαρμογής της Manchester United. Παράλληλα, θα λάβετε και σχετική επιβεβαίωση από τη Manchester United στο email σας.'
}

function buildText(options: {
  matchKey: string
  balanceRemainingAmountEur: number
  perTicketAmountEur: number
  ticketSlotCount: number
  paymentDeadlineIso: string | Date
}): string {
  const { matchName, matchDate } = formatFixtureMatchKeyForEmail(options.matchKey)
  const paymentDeadline = formatPaymentDeadlineGreek(options.paymentDeadlineIso)
  const amountLines = formatRemainingAmountLines(options)

  return `Αγαπητό Μέλος,

Με μεγάλη χαρά σας ενημερώνουμε ότι το αίτημά σας για τον αγώνα:

${matchName}
${matchDate}

${securedTicketsLine(options.ticketSlotCount)}

Για την ολοκλήρωση της διαδικασίας, παρακαλούμε να καταβάλετε το υπόλοιπο ποσό των:

${amountLines.textBlock}

εντός της καθορισμένης προθεσμίας που αναγράφεται πιο κάτω:

Προθεσμία πληρωμής: ${paymentDeadline}

${issuedTicketsLine(options.ticketSlotCount)}

⚠️ Παρακαλούμε να μην προχωρήσετε σε οποιαδήποτε ταξιδιωτική διευθέτηση χωρίς να παρακολουθείτε τις επίσημες ανακοινώσεις για τον αγώνα. Οι ημερομηνίες και ώρες των αγώνων ενδέχεται να αλλάξουν λόγω τηλεοπτικών μεταδόσεων, ευρωπαϊκών διοργανώσεων ή άλλων αγωνιστικών υποχρεώσεων.

Εκ μέρους όλων μας, σας ευχόμαστε να απολαύσετε μία μοναδική εμπειρία στο Theatre of Dreams και να δημιουργήσετε αναμνήσεις που θα σας συνοδεύουν για μια ζωή.

Θα θέλαμε επίσης να σας παρακαλέσουμε, εφόσον το επιθυμείτε, να στηρίξετε τον Σύνδεσμό μας με μια μικρή αναφορά στα μέσα κοινωνικής δικτύωσής σας. Μοιραστείτε φωτογραφίες ή βίντεο από το ταξίδι και την εμπειρία σας στο Old Trafford κάνοντας αναφορά ή ταγκάροντας το Cyprus Manchester United Supporters Club. Οι αναρτήσεις των μελών μας αποτελούν την καλύτερη προβολή για τον Σύνδεσμο και εμπνέουν περισσότερους φίλους της United στην Κύπρο να ζήσουν το όνειρό τους.

Σας ευχαριστούμε για τη συνεχή στήριξή σας και για την εμπιστοσύνη που δείχνετε στον Σύνδεσμό μας.

Καλή επιτυχία στην ομάδα μας και ευχόμαστε να φέρετε γούρι στους Reds με μία μεγάλη νίκη!

${clubEmailClosingText()}`
}

function buildHtml(options: {
  matchKey: string
  balanceRemainingAmountEur: number
  perTicketAmountEur: number
  ticketSlotCount: number
  paymentDeadlineIso: string | Date
}): string {
  const { matchName, matchDate } = formatFixtureMatchKeyForEmail(options.matchKey)
  const paymentDeadline = formatPaymentDeadlineGreek(options.paymentDeadlineIso)
  const amountLines = formatRemainingAmountLines(options)

  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητό Μέλος,</p>
  <p>Με μεγάλη χαρά σας ενημερώνουμε ότι το αίτημά σας για τον αγώνα:</p>
  <p><strong>${matchName}</strong><br>${matchDate}</p>
  <p>${securedTicketsLine(options.ticketSlotCount)}</p>
  <p>Για την ολοκλήρωση της διαδικασίας, παρακαλούμε να καταβάλετε το υπόλοιπο ποσό των:</p>
  ${amountLines.htmlBlock}
  <p>εντός της καθορισμένης προθεσμίας που αναγράφεται πιο κάτω:</p>
  <p><strong>Προθεσμία πληρωμής:</strong> ${paymentDeadline}</p>
  <p>${issuedTicketsLine(options.ticketSlotCount)}</p>
  <p>⚠️ Παρακαλούμε να μην προχωρήσετε σε οποιαδήποτε ταξιδιωτική διευθέτηση χωρίς να παρακολουθείτε τις επίσημες ανακοινώσεις για τον αγώνα. Οι ημερομηνίες και ώρες των αγώνων ενδέχεται να αλλάξουν λόγω τηλεοπτικών μεταδόσεων, ευρωπαϊκών διοργανώσεων ή άλλων αγωνιστικών υποχρεώσεων.</p>
  <p>Εκ μέρους όλων μας, σας ευχόμαστε να απολαύσετε μία μοναδική εμπειρία στο Theatre of Dreams και να δημιουργήσετε αναμνήσεις που θα σας συνοδεύουν για μια ζωή.</p>
  <p>Θα θέλαμε επίσης να σας παρακαλέσουμε, εφόσον το επιθυμείτε, να στηρίξετε τον Σύνδεσμό μας με μια μικρή αναφορά στα μέσα κοινωνικής δικτύωσής σας. Μοιραστείτε φωτογραφίες ή βίντεο από το ταξίδι και την εμπειρία σας στο Old Trafford κάνοντας αναφορά ή ταγκάροντας το Cyprus Manchester United Supporters Club. Οι αναρτήσεις των μελών μας αποτελούν την καλύτερη προβολή για τον Σύνδεσμο και εμπνέουν περισσότερους φίλους της United στην Κύπρο να ζήσουν το όνειρό τους.</p>
  <p>Σας ευχαριστούμε για τη συνεχή στήριξή σας και για την εμπιστοσύνη που δείχνετε στον Σύνδεσμό μας.</p>
  <p>Καλή επιτυχία στην ομάδα μας και ευχόμαστε να φέρετε γούρι στους Reds με μία μεγάλη νίκη!</p>
  ${clubEmailClosingHtml()}
</div>`
}

export async function sendTicketBalancePaymentEmail(options: {
  to: string
  matchKey: string
  balanceRemainingAmountEur: number
  perTicketAmountEur: number
  ticketSlotCount: number
  paymentDeadlineIso: string | Date
}): Promise<void> {
  const text = buildText(options)
  const html = buildHtml(options)
  await sendEmail(options.to, SUBJECT, text, html)
}
