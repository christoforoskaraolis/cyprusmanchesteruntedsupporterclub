import { formatFixtureMatchKeyForEmail, parseFixtureMatchKey } from './fixtureMatchKey.ts'
import { clubEmailClosingHtml, clubEmailClosingText } from './clubEmailSignature.ts'
import { sendEmail } from './email.ts'
import { TICKET_DEPOSIT_FEE_EUR } from './ticketTravelCompanions.ts'

const SUBJECT = 'Αίτημά σας για εισιτήριο του αγώνα της Manchester United'
const BAYERN_LIVERPOOL_SUBJECT =
  'Δήλωση ενδιαφέροντος: Manchester United – Bayern Munich / Liverpool'

const NOTES_BULLETS = [
  'Η υποβολή αιτήματος και η καταβολή προκαταβολής δεν εγγυώνται την εξασφάλιση εισιτηρίου.',
  'Σε περίπτωση που ο Σύνδεσμος δεν λάβει επαρκή αριθμό εισιτηρίων για να καλύψει όλα τα αιτήματα, θα σας επιστραφεί ολόκληρο το ποσό της προκαταβολής σας.',
  'Σε περίπτωση που επιθυμείτε να ακυρώσετε το αίτημά σας, η προκαταβολή σας θα επιστραφεί μόνο εφόσον το συγκεκριμένο εισιτήριο διατεθεί σε άλλο μέλος. Σε αυτή την περίπτωση θα παρακρατείται ποσό €10 ως διοικητικό κόστος ακύρωσης.',
  'Κατά τη διαδικασία κατανομής εισιτηρίων, προτεραιότητα δίνεται πάντοτε στα μέλη που δεν έχουν προηγουμένως παρακολουθήσει αγώνα της Manchester United στο Old Trafford μέσω του Συνδέσμου μας.',
]

const SCHEDULE_REMINDER =
  'Οι ημερομηνίες και ώρες των αγώνων που ανακοινώνονται στο αρχικό πρόγραμμα της Premier League δεν θεωρούνται οριστικές. Οι αγώνες προγραμματίζονται αρχικά για Σάββατο, ωστόσο ενδέχεται να μεταφερθούν σε Παρασκευή, Κυριακή ή, σε ορισμένες περιπτώσεις, Δευτέρα λόγω τηλεοπτικών μεταδόσεων, ευρωπαϊκών διοργανώσεων ή άλλων αγωνιστικών υποχρεώσεων. Ως εκ τούτου, συνιστούμε στα μέλη μας να λαμβάνουν υπόψη το ενδεχόμενο αλλαγής ημερομηνίας πριν προχωρήσουν σε κρατήσεις αεροπορικών εισιτηρίων, ξενοδοχείων ή άλλων ταξιδιωτικών διευθετήσεων. Το Cyprus Manchester United Supporters Club δεν φέρει ευθύνη για οποιοδήποτε κόστος προκύψει από αλλαγές στο επίσημο πρόγραμμα των αγώνων.'

/** Home fixtures that use the special Bayern/Liverpool interest email. */
export function isBayernOrLiverpoolHomeMatchKey(matchKey: string): boolean {
  const parsed = parseFixtureMatchKey(matchKey)
  if (!parsed?.home) return false
  const opponent = parsed.opponent.trim().toLowerCase()
  return opponent.includes('bayern') || opponent.includes('liverpool')
}

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

function buildDefaultText(matchKey: string, depositAmountEur: number, ticketSlotCount: number): string {
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

${clubEmailClosingText()}`
}

function buildDefaultHtml(matchKey: string, depositAmountEur: number, ticketSlotCount: number): string {
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
  ${clubEmailClosingHtml()}
</div>`
}

function buildBayernLiverpoolText(): string {
  return `Αγαπητό Μέλος,

Ενόψει των δύο μεγάλων αγώνων που ακολουθούν στο Old Trafford, Manchester United – Bayern Munich και Manchester United – Liverpool, ανοίγουμε τη διαδικασία δήλωσης ενδιαφέροντος για εισιτήριο μέσω του MY MUCY App.

🔴 ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ – ΜΠΟΡΕΙΣ ΝΑ ΕΠΙΛΕΞΕΙΣ ΜΟΝΟ ΕΝΑΝ ΑΠΟ ΤΟΥΣ ΔΥΟ ΑΓΩΝΕΣ.

Κάθε ενεργό μέλος μπορεί να υποβάλει αίτηση είτε για το παιχνίδι με την Bayern Munich είτε για το παιχνίδι με τη Liverpool. Δεν είναι δυνατή η αίτηση και για τα δύο παιχνίδια.

⚠️ Η ΑΙΤΗΣΗ ΔΕΝ ΣΗΜΑΙΝΕΙ ΟΤΙ ΕΧΕΙΣ ΕΞΑΣΦΑΛΙΣΕΙ ΕΙΣΙΤΗΡΙΟ

Θέλουμε να είμαστε απόλυτα ξεκάθαροι με όλα τα μέλη μας.

Η υποβολή αίτησης, καθώς και η καταβολή της προκαταβολής των €50, αποτελούν δήλωση πραγματικού ενδιαφέροντος για το συγκεκριμένο παιχνίδι και δεν αποτελούν εγγύηση ή επιβεβαίωση ότι θα δοθεί εισιτήριο.

Λόγω της πολύ μεγάλης ζήτησης για τα συγκεκριμένα παιχνίδια, οι αιτήσεις θα εξεταστούν από το Διοικητικό Συμβούλιο του Συνδέσμου, λαμβάνοντας υπόψη τον αριθμό των διαθέσιμων εισιτηρίων και το ιστορικό των αιτήσεων των μελών.

❤️ Προτεραιότητα σε όσους δεν έχουν ζήσει ακόμη αυτή την εμπειρία

Βασικός στόχος του Συνδέσμου είναι να δώσουμε σε όσο το δυνατόν περισσότερα μέλη την ευκαιρία να ζήσουν ένα μεγάλο παιχνίδι στο Old Trafford.

Για τον λόγο αυτό, θα δοθεί προτεραιότητα σε μέλη που:

* δεν έχουν παρακολουθήσει αγώνα στο Old Trafford μέσω του Συνδέσμου τη φετινή σεζόν,
* δεν έχουν παρακολουθήσει προηγούμενα μεγάλα παιχνίδια μέσω του Συνδέσμου,
* και γενικότερα δεν είχαν την ευκαιρία να ζήσουν αυτή την εμπειρία τα προηγούμενα χρόνια.

Δεν θέλουμε τα μεγάλα παιχνίδια να καταλήγουν κάθε χρόνο στα ίδια άτομα.

Ο Σύνδεσμος είναι για όλους.
Σκοπός μας είναι να δώσουμε σε όσο το δυνατόν περισσότερα μέλη την ευκαιρία να ζήσουν τη μοναδική εμπειρία ενός μεγάλου αγώνα στο Theatre of Dreams. 🔴

💶 Τι ισχύει με την προκαταβολή των €50

Η προκαταβολή των €50 δεν αποτελεί πληρωμή για εξασφαλισμένο εισιτήριο.

Με την καταβολή της, απλώς επιβεβαιώνεις ότι ενδιαφέρεσαι πραγματικά για το συγκεκριμένο παιχνίδι και επιθυμείς να συμπεριληφθείς στη διαδικασία επιλογής.

Σε περίπτωση που δεν επιλεγείς από το Διοικητικό Συμβούλιο, το ποσό των €50 θα σου επιστραφεί πλήρως.

Με αυτόν τον τρόπο θέλουμε η διαδικασία να είναι:

ξεκάθαρη – διαφανής – δίκαιη για όλους.

Γνωρίζουμε ότι τα συγκεκριμένα παιχνίδια είναι ιδιαίτερα σημαντικά για όλους μας και κατανοούμε απόλυτα την επιθυμία να βρεθείς στο Old Trafford.

Παράλληλα, έχουμε ευθύνη απέναντι σε όλα τα μέλη του Συνδέσμου και θέλουμε κάθε απόφαση να λαμβάνεται με όσο το δυνατόν πιο δίκαιο τρόπο.

Σε ευχαριστούμε για την κατανόηση και την εμπιστοσύνη σου.

Καλή επιτυχία σε όλους! 🤞🔴

Manchester United – Bayern Munich
ή
Manchester United – Liverpool

One club. One family. One experience for everyone.

Ευχόμαστε να σε δούμε σύντομα στο Theatre of Dreams!

Με εκτίμηση,
Χαράλαμπος Λοΐζου
Γραμματέας
99489002

Cyprus Manchester United Supporters Club`
}

function buildBayernLiverpoolHtml(): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητό Μέλος,</p>
  <p>Ενόψει των δύο μεγάλων αγώνων που ακολουθούν στο Old Trafford, Manchester United – Bayern Munich και Manchester United – Liverpool, ανοίγουμε τη διαδικασία δήλωσης ενδιαφέροντος για εισιτήριο μέσω του MY MUCY App.</p>
  <p><strong>🔴 ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ – ΜΠΟΡΕΙΣ ΝΑ ΕΠΙΛΕΞΕΙΣ ΜΟΝΟ ΕΝΑΝ ΑΠΟ ΤΟΥΣ ΔΥΟ ΑΓΩΝΕΣ.</strong></p>
  <p>Κάθε ενεργό μέλος μπορεί να υποβάλει αίτηση είτε για το παιχνίδι με την Bayern Munich είτε για το παιχνίδι με τη Liverpool. Δεν είναι δυνατή η αίτηση και για τα δύο παιχνίδια.</p>
  <p><strong>⚠️ Η ΑΙΤΗΣΗ ΔΕΝ ΣΗΜΑΙΝΕΙ ΟΤΙ ΕΧΕΙΣ ΕΞΑΣΦΑΛΙΣΕΙ ΕΙΣΙΤΗΡΙΟ</strong></p>
  <p>Θέλουμε να είμαστε απόλυτα ξεκάθαροι με όλα τα μέλη μας.</p>
  <p>Η υποβολή αίτησης, καθώς και η καταβολή της προκαταβολής των €50, αποτελούν δήλωση πραγματικού ενδιαφέροντος για το συγκεκριμένο παιχνίδι και δεν αποτελούν εγγύηση ή επιβεβαίωση ότι θα δοθεί εισιτήριο.</p>
  <p>Λόγω της πολύ μεγάλης ζήτησης για τα συγκεκριμένα παιχνίδια, οι αιτήσεις θα εξεταστούν από το Διοικητικό Συμβούλιο του Συνδέσμου, λαμβάνοντας υπόψη τον αριθμό των διαθέσιμων εισιτηρίων και το ιστορικό των αιτήσεων των μελών.</p>
  <p><strong>❤️ Προτεραιότητα σε όσους δεν έχουν ζήσει ακόμη αυτή την εμπειρία</strong></p>
  <p>Βασικός στόχος του Συνδέσμου είναι να δώσουμε σε όσο το δυνατόν περισσότερα μέλη την ευκαιρία να ζήσουν ένα μεγάλο παιχνίδι στο Old Trafford.</p>
  <p>Για τον λόγο αυτό, θα δοθεί προτεραιότητα σε μέλη που:</p>
  <ul>
    <li>δεν έχουν παρακολουθήσει αγώνα στο Old Trafford μέσω του Συνδέσμου τη φετινή σεζόν,</li>
    <li>δεν έχουν παρακολουθήσει προηγούμενα μεγάλα παιχνίδια μέσω του Συνδέσμου,</li>
    <li>και γενικότερα δεν είχαν την ευκαιρία να ζήσουν αυτή την εμπειρία τα προηγούμενα χρόνια.</li>
  </ul>
  <p>Δεν θέλουμε τα μεγάλα παιχνίδια να καταλήγουν κάθε χρόνο στα ίδια άτομα.</p>
  <p>Ο Σύνδεσμος είναι για όλους.<br>
  Σκοπός μας είναι να δώσουμε σε όσο το δυνατόν περισσότερα μέλη την ευκαιρία να ζήσουν τη μοναδική εμπειρία ενός μεγάλου αγώνα στο Theatre of Dreams. 🔴</p>
  <p><strong>💶 Τι ισχύει με την προκαταβολή των €50</strong></p>
  <p>Η προκαταβολή των €50 δεν αποτελεί πληρωμή για εξασφαλισμένο εισιτήριο.</p>
  <p>Με την καταβολή της, απλώς επιβεβαιώνεις ότι ενδιαφέρεσαι πραγματικά για το συγκεκριμένο παιχνίδι και επιθυμείς να συμπεριληφθείς στη διαδικασία επιλογής.</p>
  <p>Σε περίπτωση που δεν επιλεγείς από το Διοικητικό Συμβούλιο, το ποσό των €50 θα σου επιστραφεί πλήρως.</p>
  <p>Με αυτόν τον τρόπο θέλουμε η διαδικασία να είναι:</p>
  <p><strong>ξεκάθαρη – διαφανής – δίκαιη για όλους.</strong></p>
  <p>Γνωρίζουμε ότι τα συγκεκριμένα παιχνίδια είναι ιδιαίτερα σημαντικά για όλους μας και κατανοούμε απόλυτα την επιθυμία να βρεθείς στο Old Trafford.</p>
  <p>Παράλληλα, έχουμε ευθύνη απέναντι σε όλα τα μέλη του Συνδέσμου και θέλουμε κάθε απόφαση να λαμβάνεται με όσο το δυνατόν πιο δίκαιο τρόπο.</p>
  <p>Σε ευχαριστούμε για την κατανόηση και την εμπιστοσύνη σου.</p>
  <p>Καλή επιτυχία σε όλους! 🤞🔴</p>
  <p><strong>Manchester United – Bayern Munich</strong><br>
  ή<br>
  <strong>Manchester United – Liverpool</strong></p>
  <p><em>One club. One family. One experience for everyone.</em></p>
  <p>Ευχόμαστε να σε δούμε σύντομα στο Theatre of Dreams!</p>
  <p>Με εκτίμηση,<br>
  <strong>Χαράλαμπος Λοΐζου</strong><br>
  Γραμματέας<br>
  99489002</p>
  <p><strong>Cyprus Manchester United Supporters Club</strong></p>
</div>`
}

export async function sendTicketDepositConfirmedEmail(options: {
  to: string
  matchKey: string
  depositAmountEur: number
  ticketSlotCount: number
}): Promise<void> {
  if (isBayernOrLiverpoolHomeMatchKey(options.matchKey)) {
    await sendEmail(options.to, BAYERN_LIVERPOOL_SUBJECT, buildBayernLiverpoolText(), buildBayernLiverpoolHtml())
    return
  }

  const text = buildDefaultText(options.matchKey, options.depositAmountEur, options.ticketSlotCount)
  const html = buildDefaultHtml(options.matchKey, options.depositAmountEur, options.ticketSlotCount)
  await sendEmail(options.to, SUBJECT, text, html)
}
