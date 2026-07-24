import {
  clubEmailClosingHtml,
  clubEmailClosingHtmlEn,
  clubEmailClosingText,
  clubEmailClosingTextEn,
} from './clubEmailSignature.ts'
import { sendEmail } from './email.ts'

const SUBJECT =
  '✅ Η Συνδρομή σας έχει ενεργοποιηθεί – Καλώς ήρθατε στο Manchester United Supporters Club Cyprus! ✅ Your Membership Has Been Activated – Welcome to the Manchester United Supporters Club Cyprus!'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildText(firstName: string, mycmuscUrl: string): string {
  return `Αγαπητέ/ή ${firstName},
Με χαρά σας ενημερώνουμε ότι η συνδρομή σας έχει ενεργοποιηθεί με επιτυχία! 🔴⚫
Καλωσορίσατε στην οικογένεια του Manchester United Supporters Club Cyprus! Ως ενεργό μέλος, μπορείτε πλέον να συμμετέχετε στις δραστηριότητες και εκδηλώσεις του Συλλόγου, να λαμβάνετε ενημερώσεις και να απολαμβάνετε τα προνόμια των μελών.

ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ
Για να είστε επιλέξιμοι για εισιτήρια αγώνων, θα πρέπει να διαθέτετε και έγκυρη επίσημη συνδρομή One United της Manchester United.
Αν έχετε ήδη ενεργή συνδρομή One United, δεν απαιτείται καμία ενέργεια. Διαφορετικά, μπορείτε να δημιουργήσετε ή να ανανεώσετε τη συνδρομή σας μέσω του πιο κάτω συνδέσμου:
${mycmuscUrl}

ΠΑΡΑΛΑΒΗ ΔΩΡΟΥ ΜΕΛΟΥΣ
Για να παραλάβετε το δώρο μέλους σας, επικοινωνήστε με τον Αντιπρόσωπο της Επαρχίας σας και κανονίστε μαζί του την παραλαβή

* Λευκωσία – Άκης Νικολάου: 99908117
* Λεμεσός – Θαλής Αλεξάνδρου: 99531691
* Λάρνακα & Αμμόχωστος – Γρηγόρης Γρηγορίου: 99293992
* Πάφος – Μιχάλης & Γιώργος Χαραλάμπους: 99427778

Ανυπομονούμε να σας δούμε στις επόμενες εκδηλώσεις μας!

${clubEmailClosingText()}

---

Dear ${firstName},
We are pleased to inform you that your membership has been successfully activated! 🔴⚫
Welcome to the Manchester United Supporters Club Cyprus family! As an active member, you can now participate in club activities and events, receive updates and enjoy member benefits.

MATCH TICKETS
To be eligible for match tickets, you must also hold a valid official One United Manchester United membership.
If you already have an active One United membership, no further action is required. Otherwise, you can create or renew your membership using the link below:
${mycmuscUrl}

MEMBERSHIP GIFT COLLECTION
To collect your membership gift, please contact the representative for your District and arrange the collection directly with them.

* Nicosia – Akis Nikolaou: 99908117
* Limassol – Thalis Alexandrou: 99531691
* Larnaca & Famagusta – Grigoris Gregoriou: 99293992
* Paphos – Michalis & Giorgos Charalambous: 99427778

We look forward to seeing you at our upcoming events!

${clubEmailClosingTextEn()}`
}

function buildHtml(firstName: string, mycmuscUrl: string): string {
  const safeName = escapeHtml(firstName)
  const safeUrl = escapeHtml(mycmuscUrl)
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητέ/ή <strong>${safeName}</strong>,</p>
  <p>Με χαρά σας ενημερώνουμε ότι η συνδρομή σας έχει ενεργοποιηθεί με επιτυχία! 🔴⚫</p>
  <p>Καλωσορίσατε στην οικογένεια του Manchester United Supporters Club Cyprus! Ως ενεργό μέλος, μπορείτε πλέον να συμμετέχετε στις δραστηριότητες και εκδηλώσεις του Συλλόγου, να λαμβάνετε ενημερώσεις και να απολαμβάνετε τα προνόμια των μελών.</p>
  <p><strong>ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ</strong><br>
  Για να είστε επιλέξιμοι για εισιτήρια αγώνων, θα πρέπει να διαθέτετε και έγκυρη επίσημη συνδρομή One United της Manchester United.<br>
  Αν έχετε ήδη ενεργή συνδρομή One United, δεν απαιτείται καμία ενέργεια. Διαφορετικά, μπορείτε να δημιουργήσετε ή να ανανεώσετε τη συνδρομή σας μέσω του πιο κάτω συνδέσμου:<br>
  <a href="${safeUrl}">${safeUrl}</a></p>
  <p><strong>ΠΑΡΑΛΑΒΗ ΔΩΡΟΥ ΜΕΛΟΥΣ</strong><br>
  Για να παραλάβετε το δώρο μέλους σας, επικοινωνήστε με τον Αντιπρόσωπο της Επαρχίας σας και κανονίστε μαζί του την παραλαβή</p>
  <ul>
    <li>Λευκωσία – Άκης Νικολάου: 99908117</li>
    <li>Λεμεσός – Θαλής Αλεξάνδρου: 99531691</li>
    <li>Λάρνακα &amp; Αμμόχωστος – Γρηγόρης Γρηγορίου: 99293992</li>
    <li>Πάφος – Μιχάλης &amp; Γιώργος Χαραλάμπους: 99427778</li>
  </ul>
  <p>Ανυπομονούμε να σας δούμε στις επόμενες εκδηλώσεις μας!</p>
  ${clubEmailClosingHtml()}
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
  <p>Dear <strong>${safeName}</strong>,</p>
  <p>We are pleased to inform you that your membership has been successfully activated! 🔴⚫</p>
  <p>Welcome to the Manchester United Supporters Club Cyprus family! As an active member, you can now participate in club activities and events, receive updates and enjoy member benefits.</p>
  <p><strong>MATCH TICKETS</strong><br>
  To be eligible for match tickets, you must also hold a valid official One United Manchester United membership.<br>
  If you already have an active One United membership, no further action is required. Otherwise, you can create or renew your membership using the link below:<br>
  <a href="${safeUrl}">${safeUrl}</a></p>
  <p><strong>MEMBERSHIP GIFT COLLECTION</strong><br>
  To collect your membership gift, please contact the representative for your District and arrange the collection directly with them.</p>
  <ul>
    <li>Nicosia – Akis Nikolaou: 99908117</li>
    <li>Limassol – Thalis Alexandrou: 99531691</li>
    <li>Larnaca &amp; Famagusta – Grigoris Gregoriou: 99293992</li>
    <li>Paphos – Michalis &amp; Giorgos Charalambous: 99427778</li>
  </ul>
  <p>We look forward to seeing you at our upcoming events!</p>
  ${clubEmailClosingHtmlEn()}
</div>`
}

export async function sendMembershipActivationEmail(options: {
  to: string
  firstName: string
  mycmuscUrl: string
}): Promise<void> {
  const firstName = options.firstName.trim() || 'Member'
  const text = buildText(firstName, options.mycmuscUrl)
  const html = buildHtml(firstName, options.mycmuscUrl)
  await sendEmail(options.to, SUBJECT, text, html)
}
