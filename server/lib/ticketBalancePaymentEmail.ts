import { formatFixtureMatchKeyForEmail } from './fixtureMatchKey.ts'
import { sendEmail } from './email.ts'

const SUBJECT =
  'Το Cyprus Manchester United Supporters Club έχει εξασφαλίσει εισιτήριο για εσάς στο Old Trafford!'

function formatAmountEur(amountEur: number): string {
  return amountEur.toFixed(2)
}

function formatPaymentDeadlineGreek(deadlineIso: string): string {
  const dt = new Date(`${deadlineIso}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return deadlineIso
  return dt.toLocaleDateString('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function buildText(options: {
  matchKey: string
  balanceRemainingAmountEur: number
  paymentDeadlineIso: string
}): string {
  const { matchName, matchDate } = formatFixtureMatchKeyForEmail(options.matchKey)
  const amount = formatAmountEur(options.balanceRemainingAmountEur)
  const paymentDeadline = formatPaymentDeadlineGreek(options.paymentDeadlineIso)

  return `Αγαπητό Μέλος,

Με μεγάλη χαρά σας ενημερώνουμε ότι το αίτημά σας για τον αγώνα:

${matchName}
${matchDate}

έχει εγκριθεί και ο Cyprus Manchester United Supporters Club έχει εξασφαλίσει εισιτήριο για εσάς στο Old Trafford!

Για την ολοκλήρωση της διαδικασίας, παρακαλούμε να καταβάλετε το υπόλοιπο ποσό των:

€${amount}

εντός της καθορισμένης προθεσμίας που αναγράφεται πιο κάτω:

Προθεσμία πληρωμής: ${paymentDeadline}

Μετά την παραλαβή της πληρωμής σας, το εισιτήριό σας θα εκδοθεί και θα εμφανιστεί στον επίσημο λογαριασμό σας μέσω της εφαρμογής της Manchester United. Παράλληλα, θα λάβετε και σχετική επιβεβαίωση από τη Manchester United στο email σας.

⚠️ Παρακαλούμε να μην προχωρήσετε σε οποιαδήποτε ταξιδιωτική διευθέτηση χωρίς να παρακολουθείτε τις επίσημες ανακοινώσεις για τον αγώνα. Οι ημερομηνίες και ώρες των αγώνων ενδέχεται να αλλάξουν λόγω τηλεοπτικών μεταδόσεων, ευρωπαϊκών διοργανώσεων ή άλλων αγωνιστικών υποχρεώσεων.

Εκ μέρους όλων μας, σας ευχόμαστε να απολαύσετε μία μοναδική εμπειρία στο Theatre of Dreams και να δημιουργήσετε αναμνήσεις που θα σας συνοδεύουν για μια ζωή.

Θα θέλαμε επίσης να σας παρακαλέσουμε, εφόσον το επιθυμείτε, να στηρίξετε τον Σύνδεσμό μας με μια μικρή αναφορά στα μέσα κοινωνικής δικτύωσής σας. Μοιραστείτε φωτογραφίες ή βίντεο από το ταξίδι και την εμπειρία σας στο Old Trafford κάνοντας αναφορά ή ταγκάροντας το Cyprus Manchester United Supporters Club. Οι αναρτήσεις των μελών μας αποτελούν την καλύτερη προβολή για τον Σύνδεσμο και εμπνέουν περισσότερους φίλους της United στην Κύπρο να ζήσουν το όνειρό τους.

Σας ευχαριστούμε για τη συνεχή στήριξή σας και για την εμπιστοσύνη που δείχνετε στον Σύνδεσμό μας.

Καλή επιτυχία στην ομάδα μας και ευχόμαστε να φέρετε γούρι στους Reds με μία μεγάλη νίκη!

Με εκτίμηση,

Cyprus Manchester United Supporters Club

One United. One Family. One Club.`
}

function buildHtml(options: {
  matchKey: string
  balanceRemainingAmountEur: number
  paymentDeadlineIso: string
}): string {
  const { matchName, matchDate } = formatFixtureMatchKeyForEmail(options.matchKey)
  const amount = formatAmountEur(options.balanceRemainingAmountEur)
  const paymentDeadline = formatPaymentDeadlineGreek(options.paymentDeadlineIso)

  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητό Μέλος,</p>
  <p>Με μεγάλη χαρά σας ενημερώνουμε ότι το αίτημά σας για τον αγώνα:</p>
  <p><strong>${matchName}</strong><br>${matchDate}</p>
  <p>έχει εγκριθεί και ο Cyprus Manchester United Supporters Club έχει εξασφαλίσει εισιτήριο για εσάς στο Old Trafford!</p>
  <p>Για την ολοκλήρωση της διαδικασίας, παρακαλούμε να καταβάλετε το υπόλοιπο ποσό των:</p>
  <p><strong>€${amount}</strong></p>
  <p>εντός της καθορισμένης προθεσμίας που αναγράφεται πιο κάτω:</p>
  <p><strong>Προθεσμία πληρωμής:</strong> ${paymentDeadline}</p>
  <p>Μετά την παραλαβή της πληρωμής σας, το εισιτήριό σας θα εκδοθεί και θα εμφανιστεί στον επίσημο λογαριασμό σας μέσω της εφαρμογής της Manchester United. Παράλληλα, θα λάβετε και σχετική επιβεβαίωση από τη Manchester United στο email σας.</p>
  <p>⚠️ Παρακαλούμε να μην προχωρήσετε σε οποιαδήποτε ταξιδιωτική διευθέτηση χωρίς να παρακολουθείτε τις επίσημες ανακοινώσεις για τον αγώνα. Οι ημερομηνίες και ώρες των αγώνων ενδέχεται να αλλάξουν λόγω τηλεοπτικών μεταδόσεων, ευρωπαϊκών διοργανώσεων ή άλλων αγωνιστικών υποχρεώσεων.</p>
  <p>Εκ μέρους όλων μας, σας ευχόμαστε να απολαύσετε μία μοναδική εμπειρία στο Theatre of Dreams και να δημιουργήσετε αναμνήσεις που θα σας συνοδεύουν για μια ζωή.</p>
  <p>Θα θέλαμε επίσης να σας παρακαλέσουμε, εφόσον το επιθυμείτε, να στηρίξετε τον Σύνδεσμό μας με μια μικρή αναφορά στα μέσα κοινωνικής δικτύωσής σας. Μοιραστείτε φωτογραφίες ή βίντεο από το ταξίδι και την εμπειρία σας στο Old Trafford κάνοντας αναφορά ή ταγκάροντας το Cyprus Manchester United Supporters Club. Οι αναρτήσεις των μελών μας αποτελούν την καλύτερη προβολή για τον Σύνδεσμο και εμπνέουν περισσότερους φίλους της United στην Κύπρο να ζήσουν το όνειρό τους.</p>
  <p>Σας ευχαριστούμε για τη συνεχή στήριξή σας και για την εμπιστοσύνη που δείχνετε στον Σύνδεσμό μας.</p>
  <p>Καλή επιτυχία στην ομάδα μας και ευχόμαστε να φέρετε γούρι στους Reds με μία μεγάλη νίκη!</p>
  <p>Με εκτίμηση,</p>
  <p><strong>Cyprus Manchester United Supporters Club</strong><br>
  One United. One Family. One Club.</p>
</div>`
}

export async function sendTicketBalancePaymentEmail(options: {
  to: string
  matchKey: string
  balanceRemainingAmountEur: number
  paymentDeadlineIso: string
}): Promise<void> {
  const text = buildText(options)
  const html = buildHtml(options)
  await sendEmail(options.to, SUBJECT, text, html)
}
