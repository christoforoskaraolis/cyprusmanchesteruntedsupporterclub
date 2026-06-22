import { clubEmailClosingHtml, clubEmailClosingText } from './clubEmailSignature.ts'
import { sendEmail } from './email.ts'

const SUBJECT = 'Eπίσημη συνδρομή (Official Membership) στη Manchester United'

function buildText(): string {
  return `Αγαπητό Μέλος,

Με χαρά σας ενημερώνουμε ότι η επίσημη συνδρομή σας (Official Membership) στη Manchester United για τη σεζόν 2026/27 έχει ενεργοποιηθεί με επιτυχία.

Με την ενεργοποίηση της Official Membership σας, και εφόσον η συνδρομή σας στο Cyprus Manchester United Supporters Club είναι επίσης ενεργή, έχετε πλέον τη δυνατότητα να υποβάλλετε αιτήματα για εισιτήρια αγώνων της Manchester United στο Old Trafford μέσω του Συνδέσμου μας, σύμφωνα με τις διαδικασίες και τις προθεσμίες που ανακοινώνονται κατά τη διάρκεια της σεζόν.

Σας προτρέπουμε επίσης να παρακολουθείτε τα μέσα κοινωνικής δικτύωσης και τα κανάλια επικοινωνίας του Συνδέσμου, ώστε να ενημερώνεστε για αιτήσεις εισιτηρίων, εκδηλώσεις, συναντήσεις μελών, οργανωμένες εκδρομές και άλλες αποκλειστικές δραστηριότητες για τα μέλη μας.

Σας ευχαριστούμε για τη στήριξη και την εμπιστοσύνη σας στο Cyprus Manchester United Supporters Club και σας ευχόμαστε μία συναρπαστική ποδοσφαιρική χρονιά γεμάτη μοναδικές εμπειρίες στο Theatre of Dreams.

${clubEmailClosingText()}`
}

function buildHtml(): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητό Μέλος,</p>
  <p>Με χαρά σας ενημερώνουμε ότι η επίσημη συνδρομή σας (Official Membership) στη Manchester United για τη σεζόν 2026/27 έχει ενεργοποιηθεί με επιτυχία.</p>
  <p>Με την ενεργοποίηση της Official Membership σας, και εφόσον η συνδρομή σας στο Cyprus Manchester United Supporters Club είναι επίσης ενεργή, έχετε πλέον τη δυνατότητα να υποβάλλετε αιτήματα για εισιτήρια αγώνων της Manchester United στο Old Trafford μέσω του Συνδέσμου μας, σύμφωνα με τις διαδικασίες και τις προθεσμίες που ανακοινώνονται κατά τη διάρκεια της σεζόν.</p>
  <p>Σας προτρέπουμε επίσης να παρακολουθείτε τα μέσα κοινωνικής δικτύωσης και τα κανάλια επικοινωνίας του Συνδέσμου, ώστε να ενημερώνεστε για αιτήσεις εισιτηρίων, εκδηλώσεις, συναντήσεις μελών, οργανωμένες εκδρομές και άλλες αποκλειστικές δραστηριότητες για τα μέλη μας.</p>
  <p>Σας ευχαριστούμε για τη στήριξη και την εμπιστοσύνη σας στο Cyprus Manchester United Supporters Club και σας ευχόμαστε μία συναρπαστική ποδοσφαιρική χρονιά γεμάτη μοναδικές εμπειρίες στο Theatre of Dreams.</p>
  ${clubEmailClosingHtml()}
</div>`
}

export async function sendMembershipPurchasedMembershipEmail(options: { to: string }): Promise<void> {
  const text = buildText()
  const html = buildHtml()
  await sendEmail(options.to, SUBJECT, text, html)
}
