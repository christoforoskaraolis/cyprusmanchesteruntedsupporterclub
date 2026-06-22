export const CLUB_EMAIL_NAME = 'Cyprus Manchester United Supporters Club'

export function clubEmailSignatureText(): string {
  return `${CLUB_EMAIL_NAME}
Γραμματέας
Χαράλαμπος Λοΐζου
99489002
One United. One Family. One Club.`
}

export function clubEmailSignatureHtml(): string {
  return `<strong>${CLUB_EMAIL_NAME}</strong><br>
Γραμματέας<br>
Χαράλαμπος Λοΐζου<br>
99489002<br>
One United. One Family. One Club.`
}

export function clubEmailClosingText(): string {
  return `Με εκτίμηση,

${clubEmailSignatureText()}`
}

export function clubEmailClosingHtml(): string {
  return `<p>Με εκτίμηση,</p>
<p>${clubEmailSignatureHtml()}</p>`
}

export function clubEmailClosingTextEn(): string {
  return `Best regards,

${clubEmailSignatureText()}`
}

export function clubEmailClosingHtmlEn(): string {
  return `<p>Best regards,</p>
<p>${clubEmailSignatureHtml()}</p>`
}
