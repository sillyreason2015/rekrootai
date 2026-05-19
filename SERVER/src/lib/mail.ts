import { MailerSend, EmailParams, Sender, Recipient, Attachment } from 'mailersend'
import { env } from '../config/env.js'

const FROM_EMAIL = 'noreply@test-r83ql3p3dvxgzw1j.mlsender.net'
const FROM_NAME = 'RekrootAI'

function getClient() {
  if (!env.MAILERSEND_API_KEY) throw new Error('Email service is not configured — MAILERSEND_API_KEY is missing')
  return new MailerSend({ apiKey: env.MAILERSEND_API_KEY })
}

async function send(to: string, subject: string, text: string, html?: string, attachments?: Array<{ content: string; filename: string; disposition?: string }>) {
  const mailer = getClient()
  const params = new EmailParams()
    .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
    .setTo([new Recipient(to)])
    .setSubject(subject)
    .setText(text)
  if (html) params.setHtml(html)
  if (attachments?.length) {
    params.setAttachments(attachments.map((a) => new Attachment(a.content, a.filename, (a.disposition ?? 'attachment') as 'inline' | 'attachment')))
  }
  await mailer.email.send(params)
}

export async function verifySmtpConnection(): Promise<boolean> {
  if (!env.MAILERSEND_API_KEY) {
    console.error('[mail] MAILERSEND_API_KEY is not set — email sending will fail')
    return false
  }
  console.log('[mail] MailerSend configured ✓')
  return true
}

export async function sendOtpEmail(to: string, otp: string, firstName: string): Promise<void> {
  await send(
    to,
    `${otp} is your RekrootAI verification code`,
    `Hi ${firstName},\n\nYour verification code is: ${otp}\n\nIt expires in 10 minutes.\n\nIf you didn't create an account, ignore this email.`,
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a">Verify your email</h2>
        <p style="margin:0 0 24px;color:#475569">Hi ${firstName}, enter this code to activate your account:</p>
        <div style="font-size:40px;font-weight:700;letter-spacing:10px;text-align:center;padding:28px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;color:#0f172a">
          ${otp}
        </div>
        <p style="color:#94a3b8;font-size:13px;margin:0">Expires in <strong>10 minutes</strong>. Didn't sign up? You can safely ignore this.</p>
      </div>
    `,
  )
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string; attachments?: Array<{ content: string; filename: string; disposition?: string }> }): Promise<void> {
  await send(input.to, input.subject, input.text, input.html, input.attachments)
}

export async function sendInviteEmail(to: string, inviteUrl: string, inviterName?: string): Promise<void> {
  const inviter = inviterName?.trim() || 'A RekrootAI admin'
  await send(
    to,
    'You have been invited to join a RekrootAI workspace',
    `Hello,\n\n${inviter} invited you to join their RekrootAI hiring workspace.\n\nAccept invite: ${inviteUrl}\n\nIf you were not expecting this, you can ignore this email.`,
    `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 8px;color:#0f172a">Workspace Invitation</h2>
        <p style="color:#334155">${inviter} invited you to join their RekrootAI hiring workspace.</p>
        <a href="${inviteUrl}" style="display:inline-block;margin:12px 0;padding:10px 16px;background:#8B3A1E;color:white;text-decoration:none;border-radius:8px">Accept Invitation</a>
        <p style="color:#64748b;font-size:13px">If the button does not work, copy this link:<br/>${inviteUrl}</p>
      </div>
    `,
  )
}
