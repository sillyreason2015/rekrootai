import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { HttpError } from './http.js'
import { env } from '../config/env.js'
import type { Role } from '../domain.js'

interface TokenPayload {
  sub: string
  role: Role
  email: string
}

function extractToken(req: Request): string {
  const header = req.header('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' ? (token ?? '') : ''
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRY } as jwt.SignOptions)
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_EXPIRY_DAYS}d`,
  } as jwt.SignOptions)
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload
  } catch {
    return null
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req)
  const payload = token ? verifyAccessToken(token) : null
  if (!payload) {
    next(new HttpError(401, 'Unauthorized'))
    return
  }
  req.user = { _id: payload.sub, role: payload.role, email: payload.email }
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) { next(new HttpError(401, 'Unauthorized')); return }
    if (!roles.includes(req.user.role)) { next(new HttpError(403, 'Forbidden')); return }
    next()
  }
}
