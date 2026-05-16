import { Router, type Response } from 'express'
import argon2 from 'argon2'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import multer from 'multer'
import { UserModel } from '../models/User.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { CompanyModel } from '../models/Company.model.js'
import { OAuthIdentityModel } from '../models/OAuthIdentity.model.js'
import { requireAuth, signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { env } from '../config/env.js'
import { storeRefreshToken, getUserIdFromRefreshToken, rotateRefreshToken, deleteRefreshToken, storeOtp, verifyAndConsumeOtp } from '../lib/redis.js'
import { sendOtpEmail } from '../lib/mail.js'
import { avatarKey, uploadBlob, presignedDownloadUrl } from '../lib/blob.js'
import type { Role } from '../domain.js'

export const authRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } })

const cookieOpts = {
  httpOnly: true,
  sameSite: env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
  secure: env.NODE_ENV === 'production',
  path: '/',
}

function formatUser(user: Record<string, unknown>) {
  const { password: _pw, avatarDataUrl, ...rest } = user as Record<string, unknown> & {
    password?: unknown
    avatarDataUrl?: unknown
  }
  return {
    ...rest,
    avatarPreviewUrl: typeof avatarDataUrl === 'string' ? avatarDataUrl : undefined,
  }
}

function buildClientRedirect(path = '/login') {
  const origin = env.CORS_ORIGINS[0] ?? 'http://localhost:3000'
  return new URL(path, origin)
}

function buildProviderCallbackRedirect(path: string, provider: 'google' | 'microsoft', status: 'linked' | 'unlinked' | 'error', message?: string) {
  const redirectUrl = buildClientRedirect(path)
  redirectUrl.searchParams.set('provider', provider)
  redirectUrl.searchParams.set('providerStatus', status)
  if (message) redirectUrl.searchParams.set('providerMessage', message)
  return redirectUrl
}

async function issueAuthResponse(res: Response, user: { _id: string; role: Role; email: string }) {
  const payload = { sub: String(user._id), role: user.role as Role, email: user.email }
  const accessToken = signAccessToken(payload)
  const refreshToken = signRefreshToken(payload)
  await storeRefreshToken(refreshToken, String(user._id))
  res.cookie('refreshToken', refreshToken, cookieOpts)
  return accessToken
}

async function findOrProvisionOauthUser(profile: {
  email: string
  firstName: string
  lastName: string
  role: Role
}) {
  const existing = await UserModel.findOne({ email: profile.email.toLowerCase() })
  if (existing) return existing

  const randomPassword = crypto.randomBytes(24).toString('hex')
  const user = await UserModel.create({
    email: profile.email.toLowerCase(),
    password: await argon2.hash(randomPassword),
    firstName: profile.firstName,
    lastName: profile.lastName,
    role: profile.role,
    isVerified: true,
    onboardingComplete: false,
    permissions: profile.role === 'candidate'
      ? undefined
      : { canCreateJobs: false, canManageBilling: false, canManageTeam: false, canViewAllCandidates: false },
  })
  if (profile.role === 'candidate') {
    await CandidateModel.create({ user: user._id, skills: [], experience: [], education: [] })
  }
  return user
}

async function fetchOauthProfile(args: {
  code?: string
  state?: string
  stateCookie?: string
  provider: 'google' | 'microsoft'
}) {
  if (!args.code || !args.state || !args.stateCookie || args.state !== args.stateCookie) {
    throw new HttpError(400, 'Invalid OAuth state')
  }

  if (args.provider === 'google') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
      throw new HttpError(501, 'Google OAuth is not configured on this deployment yet.')
    }
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: args.code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) throw new HttpError(502, 'Google token exchange failed')
    const tokenData = await tokenRes.json() as { access_token?: string }
    if (!tokenData.access_token) throw new HttpError(502, 'Google token exchange failed')
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { authorization: `Bearer ${tokenData.access_token}` },
    })
    if (!profileRes.ok) throw new HttpError(502, 'Google user profile fetch failed')
    const profile = await profileRes.json() as {
      sub?: string
      email?: string
      given_name?: string
      family_name?: string
      name?: string
    }
    const email = profile.email?.toLowerCase()
    if (!email) throw new HttpError(422, 'Google account did not provide an email')
    const fallbackNames = (profile.name ?? '').split(' ').filter(Boolean)
    return {
      provider: 'google' as const,
      providerUserId: profile.sub ?? email,
      email,
      firstName: profile.given_name ?? fallbackNames[0] ?? 'User',
      lastName: profile.family_name ?? fallbackNames.slice(1).join(' ') ?? 'Account',
    }
  }

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET || !env.MICROSOFT_CALLBACK_URL) {
    throw new HttpError(501, 'Microsoft OAuth is not configured on this deployment yet.')
  }
  const tenant = env.MICROSOFT_TENANT_ID || 'common'
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: args.code,
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      redirect_uri: env.MICROSOFT_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) throw new HttpError(502, 'Microsoft token exchange failed')
  const tokenData = await tokenRes.json() as { access_token?: string }
  if (!tokenData.access_token) throw new HttpError(502, 'Microsoft token exchange failed')
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,givenName,surname,displayName', {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  })
  if (!profileRes.ok) throw new HttpError(502, 'Microsoft user profile fetch failed')
  const profile = await profileRes.json() as {
    id?: string
    mail?: string
    userPrincipalName?: string
    givenName?: string
    surname?: string
    displayName?: string
  }
  const email = (profile.mail ?? profile.userPrincipalName)?.toLowerCase()
  if (!email) throw new HttpError(422, 'Microsoft account did not provide an email')
  const fallbackNames = (profile.displayName ?? '').split(' ').filter(Boolean)
  return {
    provider: 'microsoft' as const,
    providerUserId: profile.id ?? email,
    email,
    firstName: profile.givenName ?? fallbackNames[0] ?? 'User',
    lastName: profile.surname ?? fallbackNames.slice(1).join(' ') ?? 'Account',
  }
}

async function linkOauthIdentity(userId: string, profile: {
  provider: 'google' | 'microsoft'
  providerUserId: string
  email: string
}) {
  const existing = await OAuthIdentityModel.findOne({
    provider: profile.provider,
    providerUserId: profile.providerUserId,
  }).lean()
  if (existing && String(existing.user) !== String(userId)) {
    throw new HttpError(409, 'This provider account is already linked to another user.')
  }

  await Promise.all([
    OAuthIdentityModel.findOneAndUpdate(
      { provider: profile.provider, providerUserId: profile.providerUserId },
      { $set: { user: userId, email: profile.email } },
      { upsert: true, new: true },
    ),
    UserModel.findByIdAndUpdate(userId, { $addToSet: { oauthProviders: profile.provider } }),
  ])
}

async function handleOauthCallback(args: {
  code?: string
  state?: string
  stateCookie?: string
  provider: 'google' | 'microsoft'
}) {
  const profile = await fetchOauthProfile(args)
  const identity = await OAuthIdentityModel.findOne({
    provider: profile.provider,
    providerUserId: profile.providerUserId,
  }).lean()
  if (identity?.user) {
    const linkedUser = await UserModel.findById(String(identity.user))
    if (linkedUser) return linkedUser
  }

  const existing = await UserModel.findOne({ email: profile.email.toLowerCase() })
  if (existing) {
    if (existing.role !== 'candidate') {
      throw new HttpError(409, 'This email belongs to a recruiter/admin account. Sign in first and link the provider from your account.')
    }
    await linkOauthIdentity(String(existing._id), profile)
    return existing
  }

  const user = await findOrProvisionOauthUser({
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    role: 'candidate',
  })
  await linkOauthIdentity(String(user._id), profile)
  return user
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
    const userRole = role === 'recruiter' ? 'admin' : role
    const user = await UserModel.create({
      email,
      password: hashed,
      firstName,
      lastName,
      role: userRole,
      permissions: userRole === 'admin'
        ? { canCreateJobs: true, canManageBilling: true, canManageTeam: true, canViewAllCandidates: true }
        : undefined,
      availabilityStatus: userRole === 'candidate' ? undefined : 'available',
    })

    // Auto-create candidate profile
    if (role === 'candidate') {
      await CandidateModel.create({ user: user._id, skills: [], experience: [], education: [] })
    }

    // Generate and send verification OTP
    // If email fails: auto-verify the user so they are never blocked
    let emailSent = false
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      await storeOtp(String(user._id), otp)
      console.log(`[auth] OTP for ${user.email}: ${otp}`)
      await sendOtpEmail(user.email, otp, user.firstName)
      emailSent = true
    } catch (mailErr) {
      console.error('[auth] Email failed — auto-verifying user:', mailErr)
      await UserModel.findByIdAndUpdate(user._id, { isVerified: true })
    }

    // Reload user to get latest isVerified value
    const freshUser = await UserModel.findById(user._id).lean()

    const payload = { sub: String(user._id), role: user.role as Role, email: user.email }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    await storeRefreshToken(refreshToken, String(user._id))
    res.cookie('refreshToken', refreshToken, cookieOpts)

    const safeUser = formatUser((freshUser ?? user.toObject()) as Record<string, unknown>)
    res.status(201).json({ accessToken, user: { ...safeUser, _id: String(user._id), emailSent } })
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

    const safeUser = formatUser(user.toObject() as Record<string, unknown>)
    res.json({ accessToken, user: { ...safeUser, _id: String(user._id) } })
  } catch (err) { next(err) }
})

// ── GET /auth/me ──────────────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user!._id, { password: 0 }).lean()
    if (!user) throw new HttpError(404, 'User not found')
    res.json({ ...formatUser(user as unknown as Record<string, unknown>), _id: String(user._id) })
  } catch (err) { next(err) }
})

authRouter.get('/provider-status', (_req, res) => {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL)
  const microsoftEnabled = Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_CALLBACK_URL)
  res.json({ googleEnabled, microsoftEnabled })
})

authRouter.get('/linked-providers', requireAuth, async (req, res, next) => {
  try {
    const identities = await OAuthIdentityModel.find({ user: req.user!._id }, { provider: 1, email: 1 }).lean()
    res.json({ providers: identities.map((item) => ({ provider: item.provider, email: item.email })) })
  } catch (err) { next(err) }
})

authRouter.delete('/linked-providers/:provider', requireAuth, async (req, res, next) => {
  try {
    const provider = req.params.provider as 'google' | 'microsoft'
    if (!['google', 'microsoft'].includes(provider)) throw new HttpError(400, 'Unsupported provider')

    const identity = await OAuthIdentityModel.findOneAndDelete({
      user: req.user!._id,
      provider,
    }).lean()
    if (!identity) throw new HttpError(404, 'Provider link not found')

    await UserModel.findByIdAndUpdate(req.user!._id, { $pull: { oauthProviders: provider } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

authRouter.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { firstName, lastName, email, availabilityStatus } = req.body as {
      firstName?: string; lastName?: string; email?: string; availabilityStatus?: 'available' | 'busy'
    }
    if (!firstName || !lastName || !email) throw new HttpError(400, 'firstName, lastName and email are required')

    const existing = await UserModel.findOne({
      email: email.toLowerCase(),
      _id: { $ne: req.user!._id },
    }).lean()
    if (existing) throw new HttpError(409, 'Email already registered')

    const user = await UserModel.findByIdAndUpdate(
      req.user!._id,
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        ...(availabilityStatus ? { availabilityStatus } : {}),
      },
      { new: true, projection: { password: 0 } },
    ).lean()
    if (!user) throw new HttpError(404, 'User not found')

    res.json({ ...formatUser(user as unknown as Record<string, unknown>), _id: String(user._id) })
  } catch (err) { next(err) }
})

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string }
    if (!currentPassword || !newPassword) throw new HttpError(400, 'currentPassword and newPassword are required')

    const user = await UserModel.findById(req.user!._id)
    if (!user) throw new HttpError(404, 'User not found')

    const valid = await argon2.verify(user.password, currentPassword)
    if (!valid) throw new HttpError(400, 'Current password is incorrect')

    user.password = await argon2.hash(newPassword)
    await user.save()

    const token: string | undefined = req.cookies?.refreshToken
    if (token) await deleteRefreshToken(token)
    res.clearCookie('refreshToken', cookieOpts)
    res.json({ ok: true, message: 'Password updated successfully. Please sign in again.' })
  } catch (err) { next(err) }
})

authRouter.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'No file uploaded')

    let blobKey: string | undefined
    let previewUrl: string | undefined

    try {
      blobKey = avatarKey(req.user!._id, req.file.originalname)
      await uploadBlob(blobKey, req.file.buffer, req.file.mimetype || 'application/octet-stream')
      previewUrl = await presignedDownloadUrl(blobKey, 86400 * 7)
    } catch {
      // Blob storage may be unavailable locally; keep a small data URL preview
      previewUrl = `data:${req.file.mimetype || 'application/octet-stream'};base64,${req.file.buffer.toString('base64')}`
    }

    await UserModel.findByIdAndUpdate(req.user!._id, {
      avatarUrl: blobKey,
      avatarDataUrl: previewUrl,
    })

    res.json({ ok: true, avatarUrl: blobKey ?? previewUrl, previewUrl })
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

authRouter.get('/google', (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    return res.status(501).json({ message: 'Google OAuth is not configured on this deployment yet.' })
  }
  const state = crypto.randomUUID()
  res.cookie('oauth_state_google', state, { ...cookieOpts, maxAge: 10 * 60 * 1000 })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.GOOGLE_CALLBACK_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return res.redirect(url.toString())
})

authRouter.get('/link/google', requireAuth, (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    return res.status(501).json({ message: 'Google OAuth is not configured on this deployment yet.' })
  }
  const state = crypto.randomUUID()
  res.cookie('oauth_link_state_google', `${state}:${String(_req.user!._id)}`, { ...cookieOpts, maxAge: 10 * 60 * 1000 })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.GOOGLE_CALLBACK_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return res.redirect(url.toString())
})

authRouter.get('/microsoft', (_req, res) => {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET || !env.MICROSOFT_CALLBACK_URL) {
    return res.status(501).json({ message: 'Microsoft OAuth is not configured on this deployment yet.' })
  }
  const state = crypto.randomUUID()
  res.cookie('oauth_state_microsoft', state, { ...cookieOpts, maxAge: 10 * 60 * 1000 })
  const tenant = env.MICROSOFT_TENANT_ID || 'common'
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', env.MICROSOFT_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.MICROSOFT_CALLBACK_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile email User.Read')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return res.redirect(url.toString())
})

authRouter.get('/link/microsoft', requireAuth, (_req, res) => {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET || !env.MICROSOFT_CALLBACK_URL) {
    return res.status(501).json({ message: 'Microsoft OAuth is not configured on this deployment yet.' })
  }
  const state = crypto.randomUUID()
  res.cookie('oauth_link_state_microsoft', `${state}:${String(_req.user!._id)}`, { ...cookieOpts, maxAge: 10 * 60 * 1000 })
  const tenant = env.MICROSOFT_TENANT_ID || 'common'
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', env.MICROSOFT_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.MICROSOFT_CALLBACK_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile email User.Read')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return res.redirect(url.toString())
})

authRouter.get('/google/callback', async (req, res, next) => {
  try {
    const linkRaw = typeof req.cookies?.oauth_link_state_google === 'string' ? req.cookies.oauth_link_state_google : ''
    const [linkStateCookie, linkUserId] = linkRaw.split(':')
    if (linkStateCookie && linkUserId) {
      const profile = await fetchOauthProfile({
        provider: 'google',
        code: typeof req.query.code === 'string' ? req.query.code : undefined,
        state: typeof req.query.state === 'string' ? req.query.state : undefined,
        stateCookie: linkStateCookie,
      })
      await linkOauthIdentity(linkUserId, profile)
      res.clearCookie('oauth_link_state_google', cookieOpts)
      return res.redirect(buildProviderCallbackRedirect('/settings', 'google', 'linked').toString())
    }
    const user = await handleOauthCallback({
      provider: 'google',
      code: typeof req.query.code === 'string' ? req.query.code : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
      stateCookie: req.cookies?.oauth_state_google,
    })
    res.clearCookie('oauth_state_google', cookieOpts)
    const accessToken = await issueAuthResponse(res, { _id: String(user._id), role: user.role as Role, email: user.email })
    const redirectUrl = buildClientRedirect('/login')
    redirectUrl.searchParams.set('accessToken', accessToken)
    res.redirect(redirectUrl.toString())
  } catch (err) {
    if (req.cookies?.oauth_link_state_google) {
      res.clearCookie('oauth_link_state_google', cookieOpts)
      const message = err instanceof Error ? err.message : 'Failed to link Google account.'
      return res.redirect(buildProviderCallbackRedirect('/settings', 'google', 'error', message).toString())
    }
    next(err)
  }
})

authRouter.get('/microsoft/callback', async (req, res, next) => {
  try {
    const linkRaw = typeof req.cookies?.oauth_link_state_microsoft === 'string' ? req.cookies.oauth_link_state_microsoft : ''
    const [linkStateCookie, linkUserId] = linkRaw.split(':')
    if (linkStateCookie && linkUserId) {
      const profile = await fetchOauthProfile({
        provider: 'microsoft',
        code: typeof req.query.code === 'string' ? req.query.code : undefined,
        state: typeof req.query.state === 'string' ? req.query.state : undefined,
        stateCookie: linkStateCookie,
      })
      await linkOauthIdentity(linkUserId, profile)
      res.clearCookie('oauth_link_state_microsoft', cookieOpts)
      return res.redirect(buildProviderCallbackRedirect('/settings', 'microsoft', 'linked').toString())
    }
    const user = await handleOauthCallback({
      provider: 'microsoft',
      code: typeof req.query.code === 'string' ? req.query.code : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
      stateCookie: req.cookies?.oauth_state_microsoft,
    })
    res.clearCookie('oauth_state_microsoft', cookieOpts)
    const accessToken = await issueAuthResponse(res, { _id: String(user._id), role: user.role as Role, email: user.email })
    const redirectUrl = buildClientRedirect('/login')
    redirectUrl.searchParams.set('accessToken', accessToken)
    res.redirect(redirectUrl.toString())
  } catch (err) {
    if (req.cookies?.oauth_link_state_microsoft) {
      res.clearCookie('oauth_link_state_microsoft', cookieOpts)
      const message = err instanceof Error ? err.message : 'Failed to link Microsoft account.'
      return res.redirect(buildProviderCallbackRedirect('/settings', 'microsoft', 'error', message).toString())
    }
    next(err)
  }
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
    if (mongoose.connection.readyState !== 1) {
      return res.json({ ok: true, message: 'If that email exists, a reset code has been sent.' })
    }
    const user = await UserModel.findOne({ email: email.toLowerCase() }).lean()
    // Always respond OK to prevent email enumeration
    if (user) {
      try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString()
        await storeOtp(String(user._id), otp)
        await sendOtpEmail(user.email, otp, user.firstName)
      } catch (mailErr) {
        console.error('[auth] forgot-password email failed:', mailErr)
      }
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
      res.json({ ok: true, message: 'Verification code sent' })
    } catch (mailErr) {
      console.error('[auth] SMTP failed on resend — auto-verifying:', mailErr)
      // Email can't reach the user — verify them so they're not permanently blocked
      await UserModel.findByIdAndUpdate(user._id, { isVerified: true })
      res.json({ ok: true, message: 'Email unavailable — account verified automatically. Please log in.' })
    }
  } catch (err) { next(err) }
})

// POST /auth/onboarding
// Completes recruiter onboarding by upserting the recruiter's company record and
// marking the user as onboarded in one request.
authRouter.post('/onboarding', requireAuth, async (req, res, next) => {
  try {
    if (!['recruiter', 'admin', 'super_admin'].includes(req.user!.role)) {
      throw new HttpError(403, 'Forbidden')
    }

    const {
      legalName,
      companyName,
      teamName,
      assignmentMode,
      assignAvailableOnly,
      website,
      hqCountry,
      jobTitle,
      phone,
      registrationNumber,
      taxId,
      businessEmail,
      industry,
      companySize,
      mission,
      vision,
      values,
      description,
      tone,
    } = req.body as Record<string, unknown>

    if (
      typeof legalName !== 'string' || legalName.trim().length < 2 ||
      typeof companyName !== 'string' || companyName.trim().length < 2 ||
      (teamName !== undefined && typeof teamName !== 'string') ||
      (assignmentMode !== undefined && !['round_robin', 'manual'].includes(String(assignmentMode))) ||
      (assignAvailableOnly !== undefined && typeof assignAvailableOnly !== 'boolean') ||
      typeof hqCountry !== 'string' || hqCountry.trim().length < 2 ||
      typeof jobTitle !== 'string' || jobTitle.trim().length < 2 ||
      typeof registrationNumber !== 'string' || registrationNumber.trim().length < 5 ||
      typeof businessEmail !== 'string' || !businessEmail.includes('@')
    ) {
      throw new HttpError(400, 'Missing required onboarding fields')
    }

    const cleanCompanyName = companyName.trim()
    const cleanTeamName = typeof teamName === 'string' && teamName.trim() ? teamName.trim() : cleanCompanyName
    const safeValues = Array.isArray(values)
      ? values.map((value) => String(value).trim()).filter(Boolean).slice(0, 20)
      : []

    const companyUpdate = {
      name: cleanCompanyName,
      teamName: cleanTeamName,
      assignmentMode: assignmentMode === 'manual' ? 'manual' : 'round_robin',
      assignAvailableOnly: Boolean(assignAvailableOnly),
      legalName: legalName.trim(),
      industry: typeof industry === 'string' && industry.trim() ? industry.trim() : 'Other',
      size: typeof companySize === 'string' && companySize.trim() ? companySize.trim() : '1-10',
      hqCountry: hqCountry.trim(),
      website: typeof website === 'string' && website.trim() ? website.trim() : undefined,
      description: typeof description === 'string' && description.trim() ? description.trim() : undefined,
      mission: typeof mission === 'string' && mission.trim() ? mission.trim() : undefined,
      vision: typeof vision === 'string' && vision.trim() ? vision.trim() : undefined,
      values: safeValues,
      registrationNumber: registrationNumber.trim(),
      taxId: typeof taxId === 'string' && taxId.trim() ? taxId.trim() : undefined,
      businessEmail: businessEmail.trim().toLowerCase(),
      createdBy: req.user!._id,
      tone: typeof tone === 'string' && tone.trim() ? tone.trim() : undefined,
    }

    const userUpdate = {
      companyName: cleanCompanyName,
      teamName: cleanTeamName,
      permissions: req.user!.role === 'admin' || req.user!.role === 'super_admin'
        ? { canCreateJobs: true, canManageBilling: true, canManageTeam: true, canViewAllCandidates: true }
        : { canCreateJobs: false, canManageBilling: false, canManageTeam: false, canViewAllCandidates: false },
      phone: typeof phone === 'string' && phone.trim() ? phone.trim() : undefined,
      onboardingComplete: true,
    }

    const [company] = await Promise.all([
      CompanyModel.findOneAndUpdate(
        {
          $or: [
            { createdBy: req.user!._id },
            { name: cleanCompanyName },
            { legalName: legalName.trim() },
          ],
        },
        { $set: companyUpdate, $setOnInsert: { createdBy: req.user!._id } },
        { upsert: true, new: true },
      ).lean(),
      UserModel.findByIdAndUpdate(req.user!._id, userUpdate),
    ])

    res.json({ ok: true, company: company ? { ...company, _id: String(company._id) } : null })
  } catch (err) { next(err) }
})
