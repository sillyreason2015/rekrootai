import { Router } from 'express'
import argon2 from 'argon2'
import { getUserByEmail, getUserById, createUser, ensureCandidateProfile, logAction } from '../data/store.js'
import { signAccessToken, generateRefreshToken, requireAuth } from '../lib/auth.js'
import { storeRefreshToken, getUserIdFromRefreshToken, rotateRefreshToken, deleteRefreshToken, storeOtp, verifyAndConsumeOtp } from '../lib/redis.js'
import { sendOtpEmail } from '../lib/mail.js'
import { HttpError } from '../lib/http.js'
import { env } from '../config/env.js'
import crypto from 'crypto'
import type { Response } from 'express'
import multer from 'multer'
import { avatarKey, presignedDownloadUrl, uploadBlob } from '../lib/blob.js'

export const authRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } })
const BOOTSTRAP_SUPER_ADMIN_EMAIL = 'jatstonelimited@gmail.com'
const BOOTSTRAP_SUPER_ADMIN_PASSWORD = 'rekroot-adm1nistrator'

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
}

// POST /auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) throw new HttpError(400, 'email and password are required')

    let user = await getUserByEmail(email)
    const isBootstrapEmail = email.toLowerCase() === BOOTSTRAP_SUPER_ADMIN_EMAIL
    if (!user && isBootstrapEmail) {
      const { UserModel } = await import('../models/User.model.js')
      const passwordHash = await argon2.hash(BOOTSTRAP_SUPER_ADMIN_PASSWORD)
      const created = await UserModel.create({
        email: BOOTSTRAP_SUPER_ADMIN_EMAIL,
        password: passwordHash,
        role: 'super_admin',
        firstName: 'Super',
        lastName: 'Admin',
        isVerified: true,
        onboardingComplete: true,
      })
      user = created.toJSON() as Awaited<ReturnType<typeof getUserByEmail>>
    }
    if (!user) throw new HttpError(401, 'Invalid email or password')

    // One-time bootstrap for platform super admin.
    if (isBootstrapEmail) {
      const { UserModel } = await import('../models/User.model.js')
      await UserModel.findByIdAndUpdate(String(user._id), {
        role: 'super_admin',
        isVerified: true,
        onboardingComplete: true,
        password: await argon2.hash(BOOTSTRAP_SUPER_ADMIN_PASSWORD),
      })
      if (user.role !== 'super_admin') {
        await UserModel.findByIdAndUpdate(String(user._id), { role: 'super_admin' })
        user.role = 'super_admin'
      }
    }

    const isBootstrap = isBootstrapEmail
    const valid = isBootstrap
      ? password === BOOTSTRAP_SUPER_ADMIN_PASSWORD || await argon2.verify(user.password, password)
      : await argon2.verify(user.password, password)
    if (!valid) throw new HttpError(401, 'Invalid email or password')

    if (!user.isVerified) {
      const otp = String(Math.floor(100000 + Math.random() * 900000))
      await storeOtp(String(user._id), otp)
      sendOtpEmail(user.email, otp, user.firstName).catch((err) =>
        console.error('[mail] Failed to resend OTP to', user.email, err),
      )
      throw new HttpError(403, 'EMAIL_NOT_VERIFIED')
    }

    const accessToken = signAccessToken(String(user._id))
    const refreshToken = generateRefreshToken()
    await storeRefreshToken(refreshToken, String(user._id))

    res.cookie('refreshToken', refreshToken, COOKIE_OPTS)
    await logAction({ actor: 'user', action: 'login', mode: 'assist' })

    const { password: _pw, ...safeUser } = user
    res.json({ accessToken, user: { ...safeUser, _id: String(user._id) } })
  } catch (err) {
    next(err)
  }
})

// POST /auth/register
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role } = req.body as {
      email?: string
      password?: string
      firstName?: string
      lastName?: string
      role?: 'candidate' | 'recruiter'
    }
    if (!email || !password || !firstName || !lastName || !role) {
      throw new HttpError(400, 'Missing required fields')
    }
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters')
    if (await getUserByEmail(email)) throw new HttpError(409, 'Email already registered')

    const hashed = await argon2.hash(password)
    const user = await createUser({ email, password: hashed, firstName, lastName, role })
    const userId = String(user._id)

    // Auto-create candidate profile so /candidates/me works immediately after signup
    if (role === 'candidate') {
      await ensureCandidateProfile(userId)
    }

    // Generate and send verification OTP (non-blocking — SMTP failure must not kill registration)
    const otp = String(Math.floor(100000 + Math.random() * 900000))
    await storeOtp(userId, otp)
    sendOtpEmail(email, otp, firstName).catch((err) =>
      console.error('[mail] Failed to send OTP to', email, err),
    )

    const accessToken = signAccessToken(userId)
    const refreshToken = generateRefreshToken()
    await storeRefreshToken(refreshToken, userId)

    res.cookie('refreshToken', refreshToken, COOKIE_OPTS)
    const { password: _pw, ...safeUser } = user
    res.status(201).json({ accessToken, user: { ...safeUser, _id: userId } })
  } catch (err) {
    next(err)
  }
})

// GET /auth/me
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await getUserById(req.user!._id)
    if (!user) throw new HttpError(404, 'User not found')
    const { password: _pw, ...safeUser } = user
    let avatarPreviewUrl: string | undefined
    if (safeUser.avatarDataUrl) {
      avatarPreviewUrl = String(safeUser.avatarDataUrl)
    } else if (safeUser.avatarUrl) {
      try {
        avatarPreviewUrl = await presignedDownloadUrl(String(safeUser.avatarUrl), 3600)
      } catch {
        avatarPreviewUrl = undefined
      }
    }
    res.json({ ...safeUser, _id: String(user._id), avatarPreviewUrl })
  } catch (err) {
    next(err)
  }
})

// PATCH /auth/me
authRouter.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { UserModel } = await import('../models/User.model.js')
    const { firstName, lastName, email } = req.body as { firstName?: string; lastName?: string; email?: string }
    const user = await UserModel.findByIdAndUpdate(
      req.user!._id,
      { ...(firstName && { firstName }), ...(lastName && { lastName }), ...(email && { email }) },
      { new: true },
    ).lean()
    if (!user) throw new HttpError(404, 'User not found')
    const { password: _pw, ...safeUser } = user
    let avatarPreviewUrl: string | undefined
    if (safeUser.avatarDataUrl) avatarPreviewUrl = String(safeUser.avatarDataUrl)
    else if (safeUser.avatarUrl) {
      try {
        avatarPreviewUrl = await presignedDownloadUrl(String(safeUser.avatarUrl), 3600)
      } catch {
        avatarPreviewUrl = undefined
      }
    }
    res.json({ ...safeUser, _id: String(user._id), avatarPreviewUrl })
  } catch (err) {
    next(err)
  }
})

// POST /auth/me/avatar
authRouter.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'Missing avatar file')
    const { UserModel } = await import('../models/User.model.js')
    const mime = req.file.mimetype || 'image/jpeg'
    const inlineDataUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`
    const updates: Record<string, unknown> = { avatarDataUrl: inlineDataUrl }
    try {
      const key = avatarKey(req.user!._id, req.file.originalname)
      await uploadBlob(key, req.file.buffer, mime)
      updates.avatarUrl = key
    } catch {
      // Blob optional in defense mode; inline avatar still works.
    }
    await UserModel.findByIdAndUpdate(req.user!._id, updates)
    res.json({ ok: true, previewUrl: inlineDataUrl })
  } catch (err) {
    next(err)
  }
})

// POST /auth/change-password
authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { UserModel } = await import('../models/User.model.js')
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string }
    if (!currentPassword || !newPassword) throw new HttpError(400, 'currentPassword and newPassword are required')
    if (newPassword.length < 8) throw new HttpError(400, 'New password must be at least 8 characters')

    const user = await UserModel.findById(req.user!._id)
    if (!user) throw new HttpError(404, 'User not found')

    const valid = await argon2.verify(user.password, currentPassword)
    if (!valid) throw new HttpError(401, 'Current password is incorrect')

    user.password = await argon2.hash(newPassword)
    await user.save()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /auth/refresh
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const oldToken = req.cookies?.refreshToken as string | undefined
    if (!oldToken) throw new HttpError(401, 'Missing refresh token')

    const userId = await getUserIdFromRefreshToken(oldToken)
    if (!userId) throw new HttpError(401, 'Invalid or expired refresh token')

    const newAccessToken = signAccessToken(userId)
    const newRefreshToken = generateRefreshToken()
    await rotateRefreshToken(oldToken, newRefreshToken, userId)

    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTS)
    res.json({ accessToken: newAccessToken })
  } catch (err) {
    next(err)
  }
})

// POST /auth/logout
authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined
    if (token) await deleteRefreshToken(token)
    res.clearCookie('refreshToken')
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// POST /auth/onboarding — marks onboarding complete; creates Company record for recruiters
authRouter.post('/onboarding', requireAuth, async (req, res, next) => {
  try {
    const { UserModel } = await import('../models/User.model.js')
    const { CompanyModel } = await import('../models/Company.model.js')
    const body = req.body as {
      companyName?: string; legalName?: string; phone?: string
      industry?: string; companySize?: string; hqCountry?: string; website?: string
      mission?: string; vision?: string; values?: string[]; description?: string
      registrationNumber?: string; taxId?: string; businessEmail?: string
    }
    const userUpdates: Record<string, unknown> = { onboardingComplete: true }
    if (body.companyName) userUpdates.companyName = body.companyName.trim()
    if (body.phone) userUpdates.phone = body.phone.trim()
    await UserModel.findByIdAndUpdate(req.user!._id, userUpdates)

    // For recruiters — upsert Company record
    if (req.user!.role === 'recruiter' && body.companyName) {
      const required = [body.companyName, body.legalName, body.industry, body.companySize, body.hqCountry, body.website, body.registrationNumber, body.businessEmail]
      if (required.some((v) => !v || !String(v).trim())) throw new HttpError(400, 'Company verification details are required')
      const freeDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com']
      const emailDomain = String(body.businessEmail).toLowerCase().split('@')[1] ?? ''
      if (!emailDomain || freeDomains.includes(emailDomain)) throw new HttpError(400, 'Use a corporate business email address')

      const existingCompany = await CompanyModel.findOne({ name: body.companyName.trim() }).lean()
      if (!existingCompany) {
        await UserModel.findByIdAndUpdate(req.user!._id, { role: 'admin' })
      }
      await CompanyModel.findOneAndUpdate(
        { createdBy: req.user!._id },
        {
          name: body.companyName.trim(),
          legalName: body.legalName,
          industry: body.industry,
          size: body.companySize,
          hqCountry: body.hqCountry,
          website: body.website,
          mission: body.mission,
          vision: body.vision,
          values: body.values ?? [],
          description: body.description,
          registrationNumber: body.registrationNumber,
          taxId: body.taxId,
          businessEmail: body.businessEmail,
          createdBy: req.user!._id,
        },
        { upsert: true, new: true },
      )
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /auth/verify-email
authRouter.post('/verify-email', requireAuth, async (req, res, next) => {
  try {
    const { UserModel } = await import('../models/User.model.js')
    const { otp } = req.body as { otp?: string }
    if (!otp) throw new HttpError(400, 'OTP is required')

    const ok = await verifyAndConsumeOtp(req.user!._id, otp.trim())
    if (!ok) throw new HttpError(400, 'Invalid or expired code')

    await UserModel.findByIdAndUpdate(req.user!._id, { isVerified: true })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /auth/resend-verification
authRouter.post('/resend-verification', requireAuth, async (req, res, next) => {
  try {
    const user = await getUserById(req.user!._id)
    if (!user) throw new HttpError(404, 'User not found')
    if (user.isVerified) throw new HttpError(400, 'Email already verified')

    const otp = String(Math.floor(100000 + Math.random() * 900000))
    await storeOtp(req.user!._id, otp)
    sendOtpEmail(user.email, otp, user.firstName).catch((err) =>
      console.error('[mail] Failed to resend OTP to', user.email, err),
    )
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /auth/forgot-password
authRouter.post('/forgot-password', async (req, res) => {
  // Always return ok=true — never reveal whether email exists or if any internal step failed
  try {
    const { email } = req.body as { email?: string }
    if (!email) return res.json({ ok: true })

    const { UserModel } = await import('../models/User.model.js')
    const { EmailTokenModel } = await import('../models/EmailToken.model.js')
    const { sendEmail } = await import('../lib/email.js')
    const { env } = await import('../config/env.js')

    const user = await UserModel.findOne({ email: email.toLowerCase() }).lean()
    if (!user) return res.json({ ok: true })

    // Invalidate any previous reset tokens for this email
    await EmailTokenModel.deleteMany({ email: email.toLowerCase(), kind: 'reset' })

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

    await EmailTokenModel.create({ email: email.toLowerCase(), kind: 'reset', token, expiresAt })

    const resetUrl = `${env.CORS_ORIGIN}/reset-password?token=${token}`

    await sendEmail({
      to: email,
      subject: 'Reset your RekrootAI password',
      text: `You requested a password reset. Click the link below within 1 hour:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="font-size:20px;margin-bottom:8px">Reset your password</h2>
          <p style="color:#6b7280;margin-bottom:24px">Click the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    })
  } catch (err) {
    // Intentionally swallow — never leak whether the email exists or if infra is down
    console.error('[auth] forgot-password internal error (suppressed):', err)
  }
  res.json({ ok: true })
})

// POST /auth/reset-password
authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string }
    if (!token || !password) throw new HttpError(400, 'token and password required')
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters')

    const { UserModel } = await import('../models/User.model.js')
    const { EmailTokenModel } = await import('../models/EmailToken.model.js')

    const record = await EmailTokenModel.findOne({ token, kind: 'reset' }).lean()
    if (!record) throw new HttpError(400, 'Invalid or expired reset link')
    if (record.usedAt) throw new HttpError(400, 'Reset link already used')
    if (new Date(record.expiresAt) < new Date()) throw new HttpError(400, 'Reset link has expired')

    const hashed = await argon2.hash(password)
    await UserModel.findOneAndUpdate(
      { email: record.email },
      { password: hashed },
    )
    await EmailTokenModel.findByIdAndUpdate(record._id, { usedAt: new Date().toISOString() })

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

async function oauthUpsertAndIssue(res: Response, profile: { email: string; firstName: string; lastName: string }) {
  const { UserModel } = await import('../models/User.model.js')
  let user = await UserModel.findOne({ email: profile.email.toLowerCase() })
  if (!user) {
    user = await UserModel.create({
      email: profile.email.toLowerCase(),
      password: await argon2.hash(crypto.randomBytes(32).toString('hex')),
      role: 'candidate',
      firstName: profile.firstName || 'OAuth',
      lastName: profile.lastName || 'User',
      isVerified: true,
      onboardingComplete: false,
    })
  }
  const accessToken = signAccessToken(String(user._id))
  const refreshToken = generateRefreshToken()
  await storeRefreshToken(refreshToken, String(user._id))
  res.cookie('refreshToken', refreshToken, COOKIE_OPTS)
  return accessToken
}

authRouter.get('/google', (_req, res, next) => {
  try {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CALLBACK_URL) throw new HttpError(500, 'Google OAuth not configured')
    const callback = encodeURIComponent(env.GOOGLE_CALLBACK_URL)
    const scope = encodeURIComponent('openid email profile')
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&redirect_uri=${callback}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`
    res.redirect(url)
  } catch (err) { next(err) }
})

authRouter.get('/google/callback', async (_req, res, next) => {
  try {
    const code = String(_req.query.code ?? '')
    if (!code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) throw new HttpError(400, 'Invalid Google callback')
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    })
    const tokenJson = await tokenRes.json() as { access_token?: string }
    if (!tokenJson.access_token) throw new HttpError(401, 'Google token exchange failed')
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: `Bearer ${tokenJson.access_token}` } })
    const p = await profileRes.json() as { email?: string; given_name?: string; family_name?: string }
    if (!p.email) throw new HttpError(401, 'Google profile missing email')
    const accessToken = await oauthUpsertAndIssue(res, { email: p.email, firstName: p.given_name ?? '', lastName: p.family_name ?? '' })
    const redirectBase = env.CORS_ORIGIN || 'http://localhost:3000'
    res.redirect(`${redirectBase}/login?accessToken=${encodeURIComponent(accessToken)}`)
  } catch (err) { next(err) }
})

authRouter.get('/microsoft', (_req, res, next) => {
  try {
    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CALLBACK_URL) throw new HttpError(500, 'Microsoft OAuth not configured')
    const tenant = env.MICROSOFT_TENANT_ID || 'common'
    const scope = encodeURIComponent('openid profile email User.Read')
    const redirect = encodeURIComponent(env.MICROSOFT_CALLBACK_URL)
    const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(env.MICROSOFT_CLIENT_ID)}&response_type=code&redirect_uri=${redirect}&response_mode=query&scope=${scope}`
    res.redirect(url)
  } catch (err) { next(err) }
})

authRouter.get('/microsoft/callback', async (_req, res, next) => {
  try {
    const code = String(_req.query.code ?? '')
    if (!code || !env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET || !env.MICROSOFT_CALLBACK_URL) throw new HttpError(400, 'Invalid Microsoft callback')
    const tenant = env.MICROSOFT_TENANT_ID || 'common'
    const tokenRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: env.MICROSOFT_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    })
    const tokenJson = await tokenRes.json() as { access_token?: string }
    if (!tokenJson.access_token) throw new HttpError(401, 'Microsoft token exchange failed')
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { authorization: `Bearer ${tokenJson.access_token}` } })
    const p = await profileRes.json() as { mail?: string; userPrincipalName?: string; givenName?: string; surname?: string }
    const email = p.mail ?? p.userPrincipalName
    if (!email) throw new HttpError(401, 'Microsoft profile missing email')
    const accessToken = await oauthUpsertAndIssue(res, { email, firstName: p.givenName ?? '', lastName: p.surname ?? '' })
    const redirectBase = env.CORS_ORIGIN || 'http://localhost:3000'
    res.redirect(`${redirectBase}/login?accessToken=${encodeURIComponent(accessToken)}`)
  } catch (err) { next(err) }
})
