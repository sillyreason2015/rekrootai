import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env.js'
import { UserModel } from '../models/User.model.js'
import { HttpError } from './http.js'
import type { Role } from '../domain.js'

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'] })
}

export function verifyAccessToken(token: string): { sub: string } {
  return jwt.verify(token, env.JWT_SECRET) as { sub: string }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex')
}

// ---------------------------------------------------------------------------
// requireAuth middleware
// ---------------------------------------------------------------------------

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Missing or invalid authorization header')

    const token = header.slice(7)
    const payload = verifyAccessToken(token)
    const user = await UserModel.findById(payload.sub).lean()
    if (!user) throw new HttpError(401, 'User not found')
    req.user = { _id: String(user._id), role: user.role as Role, email: user.email }
    next()
  } catch (err) {
    if (err instanceof HttpError) return next(err)
    // JWT errors (TokenExpiredError, JsonWebTokenError, etc.)
    next(new HttpError(401, 'Unauthorized'))
  }
}

// ---------------------------------------------------------------------------
// requireRole middleware
// ---------------------------------------------------------------------------

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new HttpError(401, 'Unauthorized'))
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Forbidden'))
    next()
  }
}
