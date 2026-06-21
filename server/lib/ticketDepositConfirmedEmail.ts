import { formatFixtureMatchKeyForEmail } from './fixtureMatchKey.ts'
import { sendEmail } from './email.ts'
import { TICKET_DEPOSIT_FEE_EUR } from './ticketTravelCompanions.ts'

const SUBJECT = 'Αίτημά σας για εισιτήριο του αγώνα της Manchester United'

const NOTES_BULLETS = [
  'Η υποβολή αιτήματος και η καταβολή προκαταβολής δεν εγγυώνται την εξασφάλιση εισιτηρίου.',
  'Σε περίπτωση που ο Σύνδεσμος δεν λάβει επαρκή αριθμό εισιτηρίων για να καλύψει όλα τα αιτήματα, θα σας επιστραφεί ολόκληρο το ποσό της προκαταβολής σας.',
  'Σε περίπτωση που επιθυμείτε να ακυρώσετε το αίτημά σας, η προκαταβολή σας θα επιστραφεί μόνο εφόσον το συγκεκριμένο εισιτήριο διατεθεί σε άλλο μέλος. Σε αυτή την περίπτωση θα παρακρατείται ποσό €10 ως διοικητικό κόστος ακύρωσης.',
  'Κατά τη διαδικασία κατανομής εισιτηρίων, προτεραιότητα δίνεται πάντοτε στα μέλη που δεν έχουν προηγουμένως παρακολουθήσει αγώνα της Manchester United στο Old Trafford μέσω του Συνδέσμου μας.',
]

const SCHEDULE_REMINDER =
  'Οι ημερομηνίες και ώρες των αγώνων που ανακοινώνονται στο αρχικό πρόγραμμα της Premier League δεν θεωρούνται οριστικές. Οι αγώνες προγραμματίζονται αρχικά για Σάββατο, ωστόσο ενδέχεται να μεταφερθούν σε Παρασκευή, Κυριακή ή, σε ορισμένες περιπτώσεις, Δευτέρα λόγω τηλεοπτικών μεταδόσεων, ευρωπαϊκών διοργανώσεων ή άλλων αγωνιστικών υποχρεώσεων. Ως εκ τούτου, συνιστούμε στα μέλη μας να λαμβάνουν υπόψη το ενδεχόμενο αλλαγής ημερομηνίας πριν προχωρήσουν σε κρατήσεις αεροπορικών εισιτηρίων, ξενοδοχείων ή άλλων ταξιδιωτικών διευθετήσεων. Το Cyprus Manchester United Supporters Club δεν φέρει ευθύνη για οποιοδήποτε κόστος προκύψει από αλλαγές στο επίσημο πρόγραμμα των αγώνων.'

function formatAmountEur(amountEur: number): string {
  return amountEur.toFixed(2)
}

function formatDepositReceivedLine(depositAmountEur: number, ticketSlotCount: number): string {
  const amountLabel = `€${formatAmountEur(depositAmountEur)}`
  if (ticketSlotCount <= 1) {
    return `Η προκαταβολή σας ύψους ${amountLabel} έχει ληφθεί.`
  }
  return `Η προκαταβολή σας ύψους ${amountLabel} (€${formatAmountEur(TICKET_DEPOSIT_FEE_EUR)} × ${ticketSlotCount} εισιτήρια) έχει ληφθεί.`
}

function buildText(matchKey: string, depositAmountEur: number, ticketSlotCount: number): string {
  const { matchName, matchDate } = formatFixtureMatchKeyForEmail(matchKey)
  const bullets = NOTES_BULLETS.map((line) => `* ${line}`).join('\n\n')
  const depositLine = formatDepositReceivedLine(depositAmountEur, ticketSlotCount)

  return `Αγαπητό Μέλος,

Σας ευχαριστούμε για το αίτημά σας για εισιτήριο του αγώνα:

${matchName}
${matchDate}

Το αίτημά σας έχει καταχωρηθεί με επιτυχία και ${depositLine}

Μόλις η Manchester United διαθέσει τα εισιτήρια προς τον Σύνδεσμό μας και ολοκληρωθεί η διαδικασία κατανομής τους, θα ενημερωθείτε για το τελικό κόστος του εισιτηρίου σας. Στη συνέχεια θα κληθείτε να καταβάλετε το υπόλοιπο ποσό εντός της καθορισμένης προθεσμίας.

Μετά την εξόφληση του συνολικού ποσού, το εισιτήριό σας θα μεταφερθεί στον επίσημο λογαριασμό σας μέσω της εφαρμογής της Manchester United και θα είναι διαθέσιμο για χρήση την ημέρα του αγώνα.

Παρακαλούμε σημειώστε τα ακόλουθα:

${bullets}

Σας ευχαριστούμε για τη συνεργασία και την κατανόησή σας.

Σημαντική Υπενθύμιση: ${SCHEDULE_REMINDER}

Για οποιαδήποτε απορία ή διευκρίνιση, παρακαλούμε επικοινωνήστε μαζί μας.

Με εκτίμηση,

Cyprus Manchester United Supporters Club

One United. One Family. One Club.`
}

function buildHtml(matchKey: string, depositAmountEur: number, ticketSlotCount: number): string {
  const { matchName, matchDate } = formatFixtureMatchKeyForEmail(matchKey)
  const bulletsHtml = NOTES_BULLETS.map((line) => `<li>${line}</li>`).join('')
  const depositLine = formatDepositReceivedLine(depositAmountEur, ticketSlotCount)

  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητό Μέλος,</p>
  <p>Σας ευχαριστούμε για το αίτημά σας για εισιτήριο του αγώνα:</p>
  <p><strong>${matchName}</strong><br>${matchDate}</p>
  <p>Το αίτημά σας έχει καταχωρηθεί με επιτυχία και ${depositLine}</p>
  <p>Μόλις η Manchester United διαθέσει τα εισιτήρια προς τον Σύνδεσμό μας και ολοκληρωθεί η διαδικασία κατανομής τους, θα ενημερωθείτε για το τελικό κόστος του εισιτηρίου σας. Στη συνέχεια θα κληθείτε να καταβάλετε το υπόλοιπο ποσό εντός της καθορισμένης προθεσμίας.</p>
  <p>Μετά την εξόφληση του συνολικού ποσού, το εισιτήριό σας θα μεταφερθεί στον επίσημο λογαριασμό σας μέσω της εφαρμογής της Manchester United και θα είναι διαθέσιμο για χρήση την ημέρα του αγώνα.</p>
  <p>Παρακαλούμε σημειώστε τα ακόλουθα:</p>
  <ul>${bulletsHtml}</ul>
  <p>Σας ευχαριστούμε για τη συνεργασία και την κατανόησή σας.</p>
  <p><strong>Σημαντική Υπενθύμιση:</strong> ${SCHEDULE_REMINDER}</p>
  <p>Για οποιαδήποτε απορία ή διευκρίνιση, παρακαλούμε επικοινωνήστε μαζί μας.</p>
  <p>Με εκτίμηση,</p>
  <p><strong>Cyprus Manchester United Supporters Club</strong><br>
  One United. One Family. One Club.</p>
</div>`
}

export async function sendTicketDepositConfirmedEmail(options: {
  to: string
  matchKey: string
  depositAmountEur: number
  ticketSlotCount: number
}): Promise<void> {
  const text = buildText(options.matchKey, options.depositAmountEur, options.ticketSlotCount)
  const html = buildHtml(options.matchKey, options.depositAmountEur, options.ticketSlotCount)
  await sendEmail(options.to, SUBJECT, text, html)
}
