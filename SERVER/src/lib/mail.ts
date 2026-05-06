import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

function makeTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  })
}

const transport = makeTransport()

export async function sendOtpEmail(to: string, otp: string, firstName: string): Promise<void> {
  if (!transport) {
    console.warn(`[mail] SMTP not configured — OTP for ${to}: ${otp}`)
    return
  }
  await transport.sendMail({
    from: `"RekrootAI" <${env.EMAIL_FROM ?? env.SMTP_USER}>`,
    to,
    subject: `${otp} is your RekrootAI verification code`,
    text: `Hi ${firstName},\n\nYour verification code is: ${otp}\n\nIt expires in 10 minutes.\n\nIf you didn't create an account, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a">Verify your email</h2>
        <p style="margin:0 0 24px;color:#475569">Hi ${firstName}, enter this code to activate your account:</p>
        <div style="font-size:40px;font-weight:700;letter-spacing:10px;text-align:center;padding:28px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;color:#0f172a">
          ${otp}
        </div>
        <p style="color:#94a3b8;font-size:13px;margin:0">Expires in <strong>10 minutes</strong>. Didn't sign up? You can safely ignore this.</p>
      </div>
    `,
  })
}

export async function sendInviteEmail(to: string, inviteUrl: string, inviterName?: string): Promise<void> {
  if (!transport) {
    console.warn(`[mail] SMTP not configured - invite for ${to}: ${inviteUrl}`)
    return
  }
  const inviter = inviterName?.trim() || 'A RekrootAI admin'
  await transport.sendMail({
    from: `"RekrootAI" <${env.EMAIL_FROM ?? env.SMTP_USER}>`,
    to,
    subject: 'You have been invited to join a RekrootAI workspace',
    text: `Hello,\n\n${inviter} invited you to join their RekrootAI hiring workspace.\n\nAccept invite: ${inviteUrl}\n\nIf you were not expecting this, you can ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 8px;color:#0f172a">Workspace Invitation</h2>
        <p style="color:#334155">${inviter} invited you to join their RekrootAI hiring workspace.</p>
        <a href="${inviteUrl}" style="display:inline-block;margin:12px 0;padding:10px 16px;background:#8B3A1E;color:white;text-decoration:none;border-radius:8px">Accept Invitation</a>
        <p style="color:#64748b;font-size:13px">If the button does not work, copy this link:<br/>${inviteUrl}</p>
      </div>
    `,
  })
}
