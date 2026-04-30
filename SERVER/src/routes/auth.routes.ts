import { Router } from 'express'
import argon2 from 'argon2'
import { getUserByEmail, getUserById, createUser, ensureCandidateProfile, logAction } from '../data/store.js'
import { signAccessToken, generateRefreshToken, requireAuth } from '../lib/auth.js'
import { storeRefreshToken, getUserIdFromRefreshToken, rotateRefreshToken, deleteRefreshToken } from '../lib/redis.js'
import { HttpError } from '../lib/http.js'
import { env } from '../config/env.js'
import crypto from 'crypto'
import type { Response } from 'express'

export const authRouter = Router()

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

    const user = await getUserByEmail(email)
    if (!user) throw new HttpError(401, 'Invalid email or password')

    const valid = await argon2.verify(user.password, password)
    if (!valid) throw new HttpError(401, 'Invalid email or password')

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
    res.json({ ...safeUser, _id: String(user._id) })
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
    res.json({ ...safeUser, _id: String(user._id) })
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

// Stubs for email flows (wire up Nodemailer later)
authRouter.post('/verify-email', (_req, res) => res.json({ ok: true }))
authRouter.post('/forgot-password', (_req, res) => res.json({ ok: true }))
authRouter.post('/reset-password', (_req, res) => res.json({ ok: true }))

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
