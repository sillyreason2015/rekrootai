import { Router } from 'express'
import { db, createUser, getUserByEmail, getUserById, logAction } from '../data/mockStore.js'
import { issueMockTokens, requireAuth } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'

export const authRouter = Router()

authRouter.post('/login', (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    const user = email ? getUserByEmail(email) : null
    if (!user || user.password !== password) {
      throw new HttpError(401, 'Invalid email or password')
    }
    const tokens = issueMockTokens(user._id)
    db.refreshTokens.set(tokens.refreshToken, user._id)
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, sameSite: 'lax' })
    logAction({ actor: 'user', action: 'login', candidateId: user.role === 'candidate' ? user._id : undefined, mode: 'assist' })
    const { password: _pw, ...safeUser } = user
    res.json({ accessToken: tokens.accessToken, user: safeUser })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/register', (req, res, next) => {
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
    if (getUserByEmail(email)) {
      throw new HttpError(409, 'Email already exists')
    }
    const user = createUser({ email, password, firstName, lastName, role })
    const tokens = issueMockTokens(user._id)
    db.refreshTokens.set(tokens.refreshToken, user._id)
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, sameSite: 'lax' })
    const { password: _pw, ...safeUser } = user
    res.status(201).json({ accessToken: tokens.accessToken, user: safeUser })
  } catch (error) {
    next(error)
  }
})

authRouter.get('/me', requireAuth, (req, res) => {
  const user = req.user ? getUserById(req.user._id) : null
  if (!user) throw new HttpError(404, 'User not found')
  const { password: _pw, ...safeUser } = user
  res.json(safeUser)
})

authRouter.patch('/me', requireAuth, (req, res) => {
  const user = req.user ? getUserById(req.user._id) : null
  if (!user) throw new HttpError(404, 'User not found')
  const { firstName, lastName, email } = req.body as { firstName?: string; lastName?: string; email?: string }
  if (firstName) user.firstName = firstName
  if (lastName) user.lastName = lastName
  if (email) user.email = email
  const { password: _pw, ...safeUser } = user
  res.json(safeUser)
})

authRouter.post('/change-password', requireAuth, (req, res, next) => {
  try {
    const user = req.user ? getUserById(req.user._id) : null
    if (!user) throw new HttpError(404, 'User not found')
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string }
    if (user.password !== currentPassword) throw new HttpError(401, 'Current password is incorrect')
    user.password = newPassword ?? user.password
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/refresh', (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken as string | undefined
    if (!refreshToken) {
      throw new HttpError(401, 'Missing refresh token')
    }
    const userId = db.refreshTokens.get(refreshToken)
    const user = userId ? getUserById(userId) : null
    if (!user) {
      throw new HttpError(401, 'Invalid refresh token')
    }
    const tokens = issueMockTokens(user._id)
    db.refreshTokens.set(tokens.refreshToken, user._id)
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, sameSite: 'lax' })
    res.json({ accessToken: tokens.accessToken })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/logout', requireAuth, (_req, res) => {
  res.clearCookie('refreshToken')
  res.status(204).send()
})

authRouter.post('/verify-email', (_req, res) => res.json({ ok: true }))
authRouter.post('/forgot-password', (_req, res) => res.json({ ok: true }))
authRouter.post('/reset-password', (_req, res) => res.json({ ok: true }))
