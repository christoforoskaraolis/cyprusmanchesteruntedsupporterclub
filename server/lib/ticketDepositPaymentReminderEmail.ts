import { clubEmailClosingHtml, clubEmailClosingText } from './clubEmailSignature.ts'
import { sendEmail } from './email.ts'
import { TICKET_DEPOSIT_FEE_EUR } from './ticketTravelCompanions.ts'

const SUBJECT = 'Υπενθύμιση: Ολοκλήρωση Προκαταβολής για την Αίτηση Εισιτηρίου'

function formatAmountEur(amountEur: number): string {
  return amountEur.toFixed(2).replace(/\.00$/, '')
}

function formatDepositAmountPhrase(depositAmountEur: number, ticketSlotCount: number): string {
  const amountLabel = `€${formatAmountEur(depositAmountEur)}`
  if (ticketSlotCount <= 1) {
    return `της προκαταβολής των ${amountLabel}`
  }
  return `της προκαταβολής των ${amountLabel} (€${formatAmountEur(TICKET_DEPOSIT_FEE_EUR)} × ${ticketSlotCount} εισιτήρια)`
}

function buildText(depositAmountEur: number, ticketSlotCount: number): string {
  const depositPhrase = formatDepositAmountPhrase(depositAmountEur, ticketSlotCount)

  return `Αγαπητό Μέλος,

Ευχαριστούμε που υπέβαλες αίτηση για εισιτήριο μέσω του MY MUCY App.

Παρατηρήσαμε ότι η αίτησή σου δεν έχει ακόμη ολοκληρωθεί, καθώς εκκρεμεί η πληρωμή ${depositPhrase}.

Η πληρωμή της προκαταβολής είναι απαραίτητη για να κλειδώσει η αίτησή σου και να επιβεβαιώσεις το πραγματικό ενδιαφέρον σου για το συγκεκριμένο παιχνίδι.

⚠️ Σημαντικό: Εάν η προκαταβολή δεν καταβληθεί μέχρι την καταληκτική ημερομηνία, η αίτησή σου δεν θα θεωρηθεί έγκυρη και δεν θα συμπεριληφθεί στο τελικό αίτημα που θα αποσταλεί στη Manchester United.

Σου προτείνουμε να ολοκληρώσεις την πληρωμή το συντομότερο δυνατό, ώστε να διασφαλίσεις τη συμμετοχή σου στη διαδικασία κατανομής των εισιτηρίων.

Εάν έχεις ήδη πραγματοποιήσει την πληρωμή, παρακαλούμε αγνόησε το παρόν email. Σε περίπτωση που η πληρωμή δεν εμφανίζεται ακόμη στο σύστημά μας, θα εκτιμούσαμε αν μπορούσες να μας αποστείλεις την επιβεβαίωση πληρωμής, ώστε να ενημερώσουμε άμεσα τον λογαριασμό σου.

Για οποιαδήποτε απορία ή βοήθεια, η ομάδα του Συνδέσμου είναι πάντα στη διάθεσή σου.

Καλή επιτυχία και ευχόμαστε σύντομα να σε δούμε στο Theatre of Dreams!

${clubEmailClosingText()}`
}

function buildHtml(depositAmountEur: number, ticketSlotCount: number): string {
  const depositPhrase = formatDepositAmountPhrase(depositAmountEur, ticketSlotCount)

  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητό Μέλος,</p>
  <p>Ευχαριστούμε που υπέβαλες αίτηση για εισιτήριο μέσω του MY MUCY App.</p>
  <p>Παρατηρήσαμε ότι η αίτησή σου δεν έχει ακόμη ολοκληρωθεί, καθώς εκκρεμεί η πληρωμή ${depositPhrase}.</p>
  <p>Η πληρωμή της προκαταβολής είναι απαραίτητη για να κλειδώσει η αίτησή σου και να επιβεβαιώσεις το πραγματικό ενδιαφέρον σου για το συγκεκριμένο παιχνίδι.</p>
  <p><strong>⚠️ Σημαντικό:</strong> Εάν η προκαταβολή δεν καταβληθεί μέχρι την καταληκτική ημερομηνία, η αίτησή σου δεν θα θεωρηθεί έγκυρη και δεν θα συμπεριληφθεί στο τελικό αίτημα που θα αποσταλεί στη Manchester United.</p>
  <p>Σου προτείνουμε να ολοκληρώσεις την πληρωμή το συντομότερο δυνατό, ώστε να διασφαλίσεις τη συμμετοχή σου στη διαδικασία κατανομής των εισιτηρίων.</p>
  <p>Εάν έχεις ήδη πραγματοποιήσει την πληρωμή, παρακαλούμε αγνόησε το παρόν email. Σε περίπτωση που η πληρωμή δεν εμφανίζεται ακόμη στο σύστημά μας, θα εκτιμούσαμε αν μπορούσες να μας αποστείλεις την επιβεβαίωση πληρωμής, ώστε να ενημερώσουμε άμεσα τον λογαριασμό σου.</p>
  <p>Για οποιαδήποτε απορία ή βοήθεια, η ομάδα του Συνδέσμου είναι πάντα στη διάθεσή σου.</p>
  <p>Καλή επιτυχία και ευχόμαστε σύντομα να σε δούμε στο Theatre of Dreams!</p>
  ${clubEmailClosingHtml()}
</div>`
}

export async function sendTicketDepositPaymentReminderEmail(options: {
  to: string
  depositAmountEur: number
  ticketSlotCount: number
}): Promise<void> {
  const text = buildText(options.depositAmountEur, options.ticketSlotCount)
  const html = buildHtml(options.depositAmountEur, options.ticketSlotCount)
  await sendEmail(options.to, SUBJECT, text, html)
}
