import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP is not configured')
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const transporter = getTransporter()
  await transporter.sendMail({
    from: env.EMAIL_FROM ?? env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
}
