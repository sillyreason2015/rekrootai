import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

const EMAIL_TIMEOUT_MS = 8000

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP is not configured')
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: EMAIL_TIMEOUT_MS,
    greetingTimeout: EMAIL_TIMEOUT_MS,
    socketTimeout: EMAIL_TIMEOUT_MS,
  })
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const transporter = getTransporter()
  await Promise.race([
    transporter.sendMail({
      from: env.EMAIL_FROM ?? env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Email send timed out after ${EMAIL_TIMEOUT_MS}ms`)), EMAIL_TIMEOUT_MS)
    }),
  ])
}
