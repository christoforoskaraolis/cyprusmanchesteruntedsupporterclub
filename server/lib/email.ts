import nodemailer from 'nodemailer'
import { env } from '../env.ts'

function smtpConfigured(): boolean {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.smtpFrom)
}

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  if (!smtpConfigured()) {
    throw new Error(
      '[server] SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.',
    )
  }

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  })

  await transporter.sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text,
    html,
  })
}
