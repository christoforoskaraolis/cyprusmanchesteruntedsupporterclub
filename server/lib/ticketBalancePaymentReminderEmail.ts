import { sendEmail } from './email.ts'

const SUBJECT = 'Υπενθύμιση: Πληρωμή Υπολοίπου για το Εισιτήριό σου'

function formatAmountEur(amountEur: number): string {
  return amountEur.toFixed(2).replace(/\.00$/, '')
}

function formatPaymentDeadlineGreek(deadline: string | Date | null | undefined): string | null {
  if (deadline == null) return null
  const trimmed = deadline instanceof Date ? deadline.toISOString() : String(deadline).trim()
  if (!trimmed) return null

  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
  const iso = isoPrefix?.[1] ?? null
  if (!iso) {
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return trimmed
    return parsed.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const dt = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function buildText(options: {
  balanceRemainingAmountEur: number
  paymentDeadline: string | Date | null | undefined
}): string {
  const amount = formatAmountEur(options.balanceRemainingAmountEur)
  const deadline = formatPaymentDeadlineGreek(options.paymentDeadline)
  const deadlineLine = deadline ? `\nΚαταληκτική ημερομηνία: ${deadline}\n` : '\n'

  return `Αγαπητό Μέλος,

Επικοινωνούμε μαζί σου σχετικά με την αίτηση εισιτηρίου που έχεις υποβάλει μέσω του MY MUCY App.

Σε ενημερώνουμε ότι έχει πλέον έρθει η ώρα για την πληρωμή του υπολοίπου του εισιτηρίου σου, καθώς η προκαταβολή των €50 έχει ήδη καταβληθεί και η αίτησή σου έχει προχωρήσει στη διαδικασία κατανομής των εισιτηρίων.

⚠️ Σημαντικό: Παρακαλούμε όπως ολοκληρώσεις την πληρωμή του υπολοίπου μέχρι την αναγραφόμενη καταληκτική ημερομηνία. Η έγκαιρη εξόφληση είναι απαραίτητη για την ολοκλήρωση της διαδικασίας και την επιβεβαίωση του εισιτηρίου σου.

Ποσό Υπολοίπου: €${amount}
${deadlineLine}
Η πληρωμή μπορεί να πραγματοποιηθεί μέσω του MY MUCY App, σύμφωνα με τις οδηγίες που εμφανίζονται στον λογαριασμό σου.

Εάν έχεις ήδη πραγματοποιήσει την πληρωμή, παρακαλούμε αγνόησε το παρόν email. Σε περίπτωση που η πληρωμή δεν εμφανίζεται ακόμη στο σύστημά μας, θα εκτιμούσαμε αν μπορούσες να μας αποστείλεις την επιβεβαίωση πληρωμής, ώστε να ενημερώσουμε άμεσα τον λογαριασμό σου.

Για οποιαδήποτε απορία ή βοήθεια σχετικά με την πληρωμή, η ομάδα του Συνδέσμου είναι πάντα στη διάθεσή σου.

Σε ευχαριστούμε για τη συνεργασία και την έγκαιρη ανταπόκριση.

Ευχόμαστε σύντομα να σε δούμε στο Theatre of Dreams! 🔴⚪⚫

Με εκτίμηση,
Χαράλαμπος Λοΐζου
Γραμματέας
99489002

Cyprus Manchester United Supporters Club`
}

function buildHtml(options: {
  balanceRemainingAmountEur: number
  paymentDeadline: string | Date | null | undefined
}): string {
  const amount = formatAmountEur(options.balanceRemainingAmountEur)
  const deadline = formatPaymentDeadlineGreek(options.paymentDeadline)
  const deadlineHtml = deadline
    ? `<p><strong>Καταληκτική ημερομηνία:</strong> ${deadline}</p>`
    : ''

  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητό Μέλος,</p>
  <p>Επικοινωνούμε μαζί σου σχετικά με την αίτηση εισιτηρίου που έχεις υποβάλει μέσω του MY MUCY App.</p>
  <p>Σε ενημερώνουμε ότι έχει πλέον έρθει η ώρα για την πληρωμή του υπολοίπου του εισιτηρίου σου, καθώς η προκαταβολή των €50 έχει ήδη καταβληθεί και η αίτησή σου έχει προχωρήσει στη διαδικασία κατανομής των εισιτηρίων.</p>
  <p><strong>⚠️ Σημαντικό:</strong> Παρακαλούμε όπως ολοκληρώσεις την πληρωμή του υπολοίπου μέχρι την αναγραφόμενη καταληκτική ημερομηνία. Η έγκαιρη εξόφληση είναι απαραίτητη για την ολοκλήρωση της διαδικασίας και την επιβεβαίωση του εισιτηρίου σου.</p>
  <p><strong>Ποσό Υπολοίπου:</strong> €${amount}</p>
  ${deadlineHtml}
  <p>Η πληρωμή μπορεί να πραγματοποιηθεί μέσω του MY MUCY App, σύμφωνα με τις οδηγίες που εμφανίζονται στον λογαριασμό σου.</p>
  <p>Εάν έχεις ήδη πραγματοποιήσει την πληρωμή, παρακαλούμε αγνόησε το παρόν email. Σε περίπτωση που η πληρωμή δεν εμφανίζεται ακόμη στο σύστημά μας, θα εκτιμούσαμε αν μπορούσες να μας αποστείλεις την επιβεβαίωση πληρωμής, ώστε να ενημερώσουμε άμεσα τον λογαριασμό σου.</p>
  <p>Για οποιαδήποτε απορία ή βοήθεια σχετικά με την πληρωμή, η ομάδα του Συνδέσμου είναι πάντα στη διάθεσή σου.</p>
  <p>Σε ευχαριστούμε για τη συνεργασία και την έγκαιρη ανταπόκριση.</p>
  <p>Ευχόμαστε σύντομα να σε δούμε στο Theatre of Dreams! 🔴⚪⚫</p>
  <p>Με εκτίμηση,<br>
  Χαράλαμπος Λοΐζου<br>
  Γραμματέας<br>
  99489002</p>
  <p><strong>Cyprus Manchester United Supporters Club</strong></p>
</div>`
}

export async function sendTicketBalancePaymentReminderEmail(options: {
  to: string
  balanceRemainingAmountEur: number
  paymentDeadline?: string | Date | null
}): Promise<void> {
  const text = buildText(options)
  const html = buildHtml(options)
  await sendEmail(options.to, SUBJECT, text, html)
}
