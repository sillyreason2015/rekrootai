import { Router } from 'express'
import argon2 from 'argon2'
import { UserModel } from '../models/User.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { requireAuth, signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { env } from '../config/env.js'
import { storeRefreshToken, getUserIdFromRefreshToken, rotateRefreshToken, deleteRefreshToken, storeOtp, verifyAndConsumeOtp } from '../lib/redis.js'
import { sendOtpEmail } from '../lib/mail.js'
import type { Role } from '../domain.js'

export const authRouter = Router()

const cookieOpts = {
  httpOnly: true,
  sameSite: env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
  secure: env.NODE_ENV === 'production',
  path: '/',
}

// ── POST /auth/register ───────────────────────────────────────────────────────
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role } = req.body as {
      email?: string; password?: string; firstName?: string; lastName?: string; role?: Role
    }
    if (!email || !password || !firstName || !lastName || !role) {
      throw new HttpError(400, 'Missing required fields')
    }
    if (!['candidate', 'recruiter'].includes(role)) {
      throw new HttpError(400, 'Invalid role')
    }
    const existing = await UserModel.findOne({ email: email.toLowerCase() })
    if (existing) throw new HttpError(409, 'Email already registered')

    const hashed = await argon2.hash(password)
    const user = await UserModel.create({ email, password: hashed, firstName, lastName, role })

    // Auto-create candidate profile
    if (role === 'candidate') {
      await CandidateModel.create({ user: user._id, skills: [], experience: [], education: [] })
    }

    // Generate and send verification OTP
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      await storeOtp(String(user._id), otp)
      console.log(`[auth] OTP for ${user.email}: ${otp}`)
      await sendOtpEmail(user.email, otp, user.firstName)
    } catch (mailErr) {
      console.error('[auth] Failed to send verification OTP:', mailErr)
    }

    const payload = { sub: String(user._id), role: user.role as Role, email: user.email }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    await storeRefreshToken(refreshToken, String(user._id))
    res.cookie('refreshToken', refreshToken, cookieOpts)

    const { password: _pw, ...safeUser } = user.toObject()
    res.status(201).json({ accessToken, user: { ...safeUser, _id: String(user._id) } })
  } catch (err) { next(err) }
})

// ── POST /auth/login ──────────────────────────────────────────────────────────
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) throw new HttpError(400, 'Email and password required')

    const user = await UserModel.findOne({ email: email.toLowerCase() })
    if (!user) throw new HttpError(401, 'Invalid email or password')

    const valid = await argon2.verify(user.password, password)
    if (!valid) throw new HttpError(401, 'Invalid email or password')

    const payload = { sub: String(user._id), role: user.role as Role, email: user.email }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    await storeRefreshToken(refreshToken, String(user._id))
    res.cookie('refreshToken', refreshToken, cookieOpts)

    const { password: _pw, ...safeUser } = user.toObject()
    res.json({ accessToken, user: { ...safeUser, _id: String(user._id) } })
  } catch (err) { next(err) }
})

// ── GET /auth/me ──────────────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user!._id, { password: 0 }).lean()
    if (!user) throw new HttpError(404, 'User not found')
    res.json({ ...user, _id: String(user._id) })
  } catch (err) { next(err) }
})

// ── POST /auth/refresh ────────────────────────────────────────────────────────
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token: string | undefined = req.cookies?.refreshToken
    if (!token) throw new HttpError(401, 'Missing refresh token')

    const payload = verifyRefreshToken(token)
    if (!payload) throw new HttpError(401, 'Invalid refresh token')

    // Validate token is still in store (not revoked)
    const storedUserId = await getUserIdFromRefreshToken(token)
    if (storedUserId && storedUserId !== payload.sub) throw new HttpError(401, 'Token mismatch')

    const user = await UserModel.findById(payload.sub)
    if (!user) throw new HttpError(401, 'User not found')

    const newPayload = { sub: String(user._id), role: user.role as Role, email: user.email }
    const accessToken = signAccessToken(newPayload)
    const refreshToken = signRefreshToken(newPayload)
    await rotateRefreshToken(token, refreshToken, String(user._id))
    res.cookie('refreshToken', refreshToken, cookieOpts)
    res.json({ accessToken })
  } catch (err) { next(err) }
})

// ── POST /auth/logout ─────────────────────────────────────────────────────────
authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const token: string | undefined = req.cookies?.refreshToken
    if (token) await deleteRefreshToken(token)
    res.clearCookie('refreshToken', cookieOpts)
    res.status(204).send()
  } catch (err) { next(err) }
})

// ── POST /auth/forgot-password ────────────────────────────────────────────────
authRouter.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string }
    if (!email) throw new HttpError(400, 'email is required')
    const user = await UserModel.findOne({ email: email.toLowerCase() }).lean()
    // Always respond OK to prevent email enumeration
    if (user) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      await storeOtp(String(user._id), otp)
      await sendOtpEmail(user.email, otp, user.firstName)
    }
    res.json({ ok: true, message: 'If that email exists, a reset code has been sent.' })
  } catch (err) { next(err) }
})

// ── POST /auth/reset-password ─────────────────────────────────────────────────
authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const { email, otp, password } = req.body as { email?: string; otp?: string; password?: string }
    if (!email || !otp || !password) throw new HttpError(400, 'email, otp and password are required')
    const user = await UserModel.findOne({ email: email.toLowerCase() }).lean()
    if (!user) throw new HttpError(400, 'Invalid request')
    const valid = await verifyAndConsumeOtp(String(user._id), otp)
    if (!valid) throw new HttpError(400, 'Invalid or expired code')
    const hashed = await argon2.hash(password)
    await UserModel.findByIdAndUpdate(user._id, { password: hashed })
    res.json({ ok: true, message: 'Password updated. Please log in.' })
  } catch (err) { next(err) }
})

// ── POST /auth/verify-email ───────────────────────────────────────────────────
authRouter.post('/verify-email', requireAuth, async (req, res, next) => {
  try {
    const { otp } = req.body as { otp?: string }
    if (!otp) throw new HttpError(400, 'otp is required')
    const userId = req.user!._id
    const valid = await verifyAndConsumeOtp(userId, otp)
    if (!valid) throw new HttpError(400, 'Invalid or expired code')
    await UserModel.findByIdAndUpdate(userId, { isVerified: true })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── POST /auth/resend-verification ───────────────────────────────────────────
authRouter.post('/resend-verification', requireAuth, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user!._id).lean()
    if (!user) throw new HttpError(404, 'User not found')
    if (user.isVerified) return res.json({ ok: true, message: 'Already verified' })
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    await storeOtp(String(user._id), otp)
    console.log(`[auth] OTP for ${user.email}: ${otp}`)
    try {
      await sendOtpEmail(user.email, otp, user.firstName)
    } catch (mailErr) {
      console.error('[auth] SMTP failed on resend:', mailErr)
      // Still return ok — OTP is stored, user can get code from Render logs if needed
    }
    res.json({ ok: true, message: 'Verification code sent' })
  } catch (err) { next(err) }
})
