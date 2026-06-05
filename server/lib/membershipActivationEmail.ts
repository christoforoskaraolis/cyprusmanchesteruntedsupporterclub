import { sendEmail } from './email.ts'

const SUBJECT =
  '✅ Η Συνδρομή σας Έχει Ενεργοποιηθεί – Καλωσορίσατε στο Manchester United Cyprus Supporters Club/✅ Your Membership Has Been Activated – Welcome to Manchester United Cyprus Supporters Club'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildText(firstName: string, mycmuscUrl: string): string {
  return `Αγαπητέ/ή ${firstName},
Με ιδιαίτερη χαρά σας ενημερώνουμε ότι η συνδρομή σας έχει ενεργοποιηθεί επιτυχώς! 🔴⚫
Σας καλωσορίζουμε στην οικογένεια του Manchester United Cyprus Supporters Club.
Ως ενεργό μέλος, έχετε πλέον τη δυνατότητα να:

Συμμετέχετε στις δραστηριότητες και εκδηλώσεις του συνδέσμου
Λαμβάνετε ενημερώσεις για αγώνες και συγκεντρώσεις
Επικοινωνείτε και να συνδέεστε με άλλους φιλάθλους της Manchester United
Απολαμβάνετε αποκλειστικά προνόμια μελών (όπου εφαρμόζεται)

Παραλαβή Δώρου Μέλους:
Για την παραλαβή του δώρου σας, παρακαλούμε επικοινωνήστε με έναν από τους πιο κάτω εκπροσώπους, ανάλογα με την επαρχία διαμονής σας:

Επαρχία Λευκωσίας – Άκης Νικολάου (κιν. 99908117)
Επαρχία Λεμεσού – Θαλής Αλεξάνδρου (κιν. 99531691)
Επαρχία Λάρνακας & Αμμοχώστου – Γρηγόρης Γρηγορίου (κιν. 99293992)
Επαρχία Πάφου – Γιάννης Νικολαΐδης (κιν. 99552069)

Σημαντική Ενημέρωση:
Για να έχετε δικαίωμα υποβολής αίτησης και ανανέωσης εισιτηρίων αγώνων, είναι απαραίτητο να διαθέτετε επίσης ισχύουσα επίσημη συνδρομή της Manchester United.
Εάν έχετε ήδη ανανεώσει την επίσημη συνδρομή σας, συμπεριλαμβανομένου του πακέτου Αγγλίας One United, παρακαλούμε αγνοήστε το πιο κάτω και δεν χρειάζεται να προχωρήσετε μέσω του συνδέσμου.
Σε αντίθετη περίπτωση, παρακαλούμε επισκεφθείτε τον παρακάτω σύνδεσμο για να δημιουργήσετε ή να ανανεώσετε την επίσημη συνδρομή σας:
${mycmuscUrl}
Ανυπομονούμε να σας δούμε στις επερχόμενες εκδηλώσεις μας!
Με εκτίμηση, MUCS CLUB

---

Dear ${firstName},
We are pleased to inform you that your membership has been successfully activated! 🔴⚫
Welcome to the Manchester United Cyprus Supporters Club family.
As an active member, you can now:

Participate in club activities and events
Receive updates about matches and gatherings
Connect with fellow Manchester United supporters
Enjoy exclusive member benefits (where applicable)

Membership Gift Collection:
To collect your membership gift, please contact one of the representatives below based on your district of residence:

Nicosia District – Akis Nikolaou (mobile: 99908117)
Limassol District – Thalis Alexandrou (mobile: 99531691)
Larnaca & Famagusta Districts – Grigoris Gregoriou (mobile: 99293992)
Paphos District – Giannis Nikolaides (mobile: 99552069)

Important Notice:
To be eligible for match ticket applications and renewals, you must also hold a valid official Manchester United membership.
If you have already renewed your official membership, including the UK One United package, please disregard the below and no further action is required.
Otherwise, please visit the link below to create or renew your official membership:
${mycmuscUrl}
We look forward to seeing you at our upcoming events!
Best regards, MUCS CLUB`
}

function buildHtml(firstName: string, mycmuscUrl: string): string {
  const safeName = escapeHtml(firstName)
  const safeUrl = escapeHtml(mycmuscUrl)
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
  <p>Αγαπητέ/ή <strong>${safeName}</strong>,</p>
  <p>Με ιδιαίτερη χαρά σας ενημερώνουμε ότι η συνδρομή σας έχει ενεργοποιηθεί επιτυχώς! 🔴⚫</p>
  <p>Σας καλωσορίζουμε στην οικογένεια του <strong>Manchester United Cyprus Supporters Club</strong>.</p>
  <p>Ως ενεργό μέλος, έχετε πλέον τη δυνατότητα να:</p>
  <ul>
    <li>Συμμετέχετε στις δραστηριότητες και εκδηλώσεις του συνδέσμου</li>
    <li>Λαμβάνετε ενημερώσεις για αγώνες και συγκεντρώσεις</li>
    <li>Επικοινωνείτε και να συνδέεστε με άλλους φιλάθλους της Manchester United</li>
    <li>Απολαμβάνετε αποκλειστικά προνόμια μελών (όπου εφαρμόζεται)</li>
  </ul>
  <p><strong>Παραλαβή Δώρου Μέλους:</strong><br>
  Για την παραλαβή του δώρου σας, παρακαλούμε επικοινωνήστε με έναν από τους πιο κάτω εκπροσώπους, ανάλογα με την επαρχία διαμονής σας:</p>
  <ul>
    <li>Επαρχία Λευκωσίας – Άκης Νικολάου (κιν. 99908117)</li>
    <li>Επαρχία Λεμεσού – Θαλής Αλεξάνδρου (κιν. 99531691)</li>
    <li>Επαρχία Λάρνακας &amp; Αμμοχώστου – Γρηγόρης Γρηγορίου (κιν. 99293992)</li>
    <li>Επαρχία Πάφου – Γιάννης Νικολαΐδης (κιν. 99552069)</li>
  </ul>
  <p><strong>Σημαντική Ενημέρωση:</strong><br>
  Για να έχετε δικαίωμα υποβολής αίτησης και ανανέωσης εισιτηρίων αγώνων, είναι απαραίτητο να διαθέτετε επίσης ισχύουσα επίσημη συνδρομή της Manchester United.<br>
  Εάν έχετε ήδη ανανεώσει την επίσημη συνδρομή σας, συμπεριλαμβανομένου του πακέτου Αγγλίας One United, παρακαλούμε αγνοήστε το πιο κάτω και δεν χρειάζεται να προχωρήσετε μέσω του συνδέσμου.<br>
  Σε αντίθετη περίπτωση, παρακαλούμε επισκεφθείτε τον παρακάτω σύνδεσμο για να δημιουργήσετε ή να ανανεώσετε την επίσημη συνδρομή σας:<br>
  <a href="${safeUrl}">${safeUrl}</a></p>
  <p>Ανυπομονούμε να σας δούμε στις επερχόμενες εκδηλώσεις μας!<br>
  Με εκτίμηση,<br><strong>MUCS CLUB</strong></p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
  <p>Dear <strong>${safeName}</strong>,</p>
  <p>We are pleased to inform you that your membership has been successfully activated! 🔴⚫</p>
  <p>Welcome to the <strong>Manchester United Cyprus Supporters Club</strong> family.</p>
  <p>As an active member, you can now:</p>
  <ul>
    <li>Participate in club activities and events</li>
    <li>Receive updates about matches and gatherings</li>
    <li>Connect with fellow Manchester United supporters</li>
    <li>Enjoy exclusive member benefits (where applicable)</li>
  </ul>
  <p><strong>Membership Gift Collection:</strong><br>
  To collect your membership gift, please contact one of the representatives below based on your district of residence:</p>
  <ul>
    <li>Nicosia District – Akis Nikolaou (mobile: 99908117)</li>
    <li>Limassol District – Thalis Alexandrou (mobile: 99531691)</li>
    <li>Larnaca &amp; Famagusta Districts – Grigoris Gregoriou (mobile: 99293992)</li>
    <li>Paphos District – Giannis Nikolaides (mobile: 99552069)</li>
  </ul>
  <p><strong>Important Notice:</strong><br>
  To be eligible for match ticket applications and renewals, you must also hold a valid official Manchester United membership.<br>
  If you have already renewed your official membership, including the UK One United package, please disregard the below and no further action is required.<br>
  Otherwise, please visit the link below to create or renew your official membership:<br>
  <a href="${safeUrl}">${safeUrl}</a></p>
  <p>We look forward to seeing you at our upcoming events!<br>
  Best regards,<br><strong>MUCS CLUB</strong></p>
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
