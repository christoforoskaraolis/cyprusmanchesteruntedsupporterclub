import {
  clubEmailClosingHtml,
  clubEmailClosingHtmlEn,
  clubEmailClosingText,
  clubEmailClosingTextEn,
} from './clubEmailSignature.ts'
import { sendEmail } from './email.ts'

const SUBJECT =
  '✅ Η Συνδρομή σας έχει ενεργοποιηθεί – Καλώς ήρθατε στο Manchester United Cyprus Supporters Club! ✅ Your Membership Has Been Activated – Welcome to the Manchester United Cyprus Supporters Club!'

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
Καλωσορίσατε στην οικογένεια. Ως ενεργό μέλος, μπορείτε πλέον να:

Συμμετέχετε σε δραστηριότητες και εκδηλώσεις του συλλόγου
Λαμβάνετε ενημερώσεις για αγώνες και συγκεντρώσεις
Συνδέεστε με άλλους φίλους της Manchester United
Απολαμβάνετε αποκλειστικά προνόμια μελών (όπου ισχύει)

ΕΠΟΜΕΝΑ ΒΗΜΑΤΑ:
Για να είστε επιλέξιμοι για εισιτήρια αγώνων, θα πρέπει επίσης να διαθέτετε έγκυρη επίσημη συνδρομή One United της Manchester United.
Εάν έχετε ήδη ανανεώσει τη συνδρομή σας One United, παρακαλούμε αγνοήστε τα παρακάτω και δεν απαιτείται καμία περαιτέρω ενέργεια.
Σε αντίθετη περίπτωση, παρακαλούμε δημιουργήστε ή ανανεώστε τη συνδρομή σας άμεσα, επισκεπτόμενοι τον πιο κάτω σύνδεσμο:
${mycmuscUrl}

Παραλαβή Δώρου Μέλους:
Σας προσκαλούμε να παρευρεθείτε στην Ετήσια Γενική Συνέλευση που διοργανώνουμε τον Ιούλιο για την έναρξη της νέας σεζόν! Εκεί θα μπορείτε να παραλάβετε και το δώρο μέλους σας.
Εναλλακτικά, μετά τη Γενική Συνέλευση, μπορείτε να επικοινωνήσετε με έναν από τους πιο κάτω εκπροσώπους ανάλογα με την επαρχία διαμονής σας:

Επαρχία Λευκωσίας – Άκης Νικολάου (τηλ.: 99908117)
Επαρχία Λεμεσού – Θαλής Αλεξάνδρου (τηλ.: 99531691)
Επαρχίες Λάρνακας & Αμμοχώστου – Γρηγόρης Γρηγορίου (τηλ.: 99293992)
Επαρχία Πάφου – Μιχάλης & Γιώργος Χαραλάμπους (τηλ.: 99427778)

Ανυπομονούμε να σας δούμε στις επόμενες εκδηλώσεις μας!

${clubEmailClosingText()}

---

Dear ${firstName},
We are pleased to inform you that your membership has been successfully activated! 🔴⚫
Welcome to the family. As an active member, you can now:

Participate in club activities and events
Receive updates about matches and gatherings
Connect with fellow Manchester United supporters
Enjoy exclusive member benefits (where applicable)

NEXT STEPS:
To be eligible for match tickets, you must also hold a valid official One United Manchester United membership.

If you have already renewed your One United Manchester United membership, please disregard the below and no further action is required.
Otherwise, please create or renew your membership immediately by visiting the link below:
${mycmuscUrl}

Membership Gift Collection:
Please join us at the Annual General Meeting we are hosting in July to kick-start the new season! At the meeting, you can also collect your membership gift!

Alternatively, after the Annual General Meeting, please contact one of the representatives below based on the District in which you reside:

Nicosia District – Akis Nikolaou (mobile: 99908117)
Limassol District – Thalis Alexandrou (mobile: 99531691)
Larnaca & Famagusta Districts – Grigoris Gregoriou (mobile: 99293992)
Paphos District – Michalis & Giorgos Charalambous (mobile: 99427778)

We look forward to seeing you at our upcoming events!

${clubEmailClosingTextEn()}`
}

function buildHtml(firstName: string, mycmuscUrl: string): string {
  const safeName = escapeHtml(firstName)
  const safeUrl = escapeHtml(mycmuscUrl)
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητέ/ή <strong>${safeName}</strong>,</p>
  <p>Με χαρά σας ενημερώνουμε ότι η συνδρομή σας έχει ενεργοποιηθεί με επιτυχία! 🔴⚫</p>
  <p>Καλωσορίσατε στην οικογένεια. Ως ενεργό μέλος, μπορείτε πλέον να:</p>
  <ul>
    <li>Συμμετέχετε σε δραστηριότητες και εκδηλώσεις του συλλόγου</li>
    <li>Λαμβάνετε ενημερώσεις για αγώνες και συγκεντρώσεις</li>
    <li>Συνδέεστε με άλλους φίλους της Manchester United</li>
    <li>Απολαμβάνετε αποκλειστικά προνόμια μελών (όπου ισχύει)</li>
  </ul>
  <p><strong>ΕΠΟΜΕΝΑ ΒΗΜΑΤΑ:</strong><br>
  Για να είστε επιλέξιμοι για εισιτήρια αγώνων, θα πρέπει επίσης να διαθέτετε έγκυρη επίσημη συνδρομή One United της Manchester United.<br>
  Εάν έχετε ήδη ανανεώσει τη συνδρομή σας One United, παρακαλούμε αγνοήστε τα παρακάτω και δεν απαιτείται καμία περαιτέρω ενέργεια.<br>
  Σε αντίθετη περίπτωση, παρακαλούμε δημιουργήστε ή ανανεώστε τη συνδρομή σας άμεσα, επισκεπτόμενοι τον πιο κάτω σύνδεσμο:<br>
  <a href="${safeUrl}">${safeUrl}</a></p>
  <p><strong>Παραλαβή Δώρου Μέλους:</strong><br>
  Σας προσκαλούμε να παρευρεθείτε στην Ετήσια Γενική Συνέλευση που διοργανώνουμε τον Ιούλιο για την έναρξη της νέας σεζόν! Εκεί θα μπορείτε να παραλάβετε και το δώρο μέλους σας.<br>
  Εναλλακτικά, μετά τη Γενική Συνέλευση, μπορείτε να επικοινωνήσετε με έναν από τους πιο κάτω εκπροσώπους ανάλογα με την επαρχία διαμονής σας:</p>
  <ul>
    <li>Επαρχία Λευκωσίας – Άκης Νικολάου (τηλ.: 99908117)</li>
    <li>Επαρχία Λεμεσού – Θαλής Αλεξάνδρου (τηλ.: 99531691)</li>
    <li>Επαρχίες Λάρνακας &amp; Αμμοχώστου – Γρηγόρης Γρηγορίου (τηλ.: 99293992)</li>
    <li>Επαρχία Πάφου – Μιχάλης &amp; Γιώργος Χαραλάμπους (τηλ.: 99427778)</li>
  </ul>
  <p>Ανυπομονούμε να σας δούμε στις επόμενες εκδηλώσεις μας!</p>
  ${clubEmailClosingHtml()}
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
  <p>Dear <strong>${safeName}</strong>,</p>
  <p>We are pleased to inform you that your membership has been successfully activated! 🔴⚫</p>
  <p>Welcome to the family. As an active member, you can now:</p>
  <ul>
    <li>Participate in club activities and events</li>
    <li>Receive updates about matches and gatherings</li>
    <li>Connect with fellow Manchester United supporters</li>
    <li>Enjoy exclusive member benefits (where applicable)</li>
  </ul>
  <p><strong>NEXT STEPS:</strong><br>
  To be eligible for match tickets, you must also hold a valid official One United Manchester United membership.</p>
  <p>If you have already renewed your One United Manchester United membership, please disregard the below and no further action is required.<br>
  Otherwise, please create or renew your membership immediately by visiting the link below:<br>
  <a href="${safeUrl}">${safeUrl}</a></p>
  <p><strong>Membership Gift Collection:</strong><br>
  Please join us at the Annual General Meeting we are hosting in July to kick-start the new season! At the meeting, you can also collect your membership gift!</p>
  <p>Alternatively, after the Annual General Meeting, please contact one of the representatives below based on the District in which you reside:</p>
  <ul>
    <li>Nicosia District – Akis Nikolaou (mobile: 99908117)</li>
    <li>Limassol District – Thalis Alexandrou (mobile: 99531691)</li>
    <li>Larnaca &amp; Famagusta Districts – Grigoris Gregoriou (mobile: 99293992)</li>
    <li>Paphos District – Michalis &amp; Giorgos Charalambous (mobile: 99427778)</li>
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
