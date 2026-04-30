import type { Request, Response, NextFunction } from 'express'
import { HttpError } from './http.js'
import { db } from '../data/mockStore.js'
import type { Role } from '../domain.js'

function extractToken(req: Request) {
  const header = req.header('authorization')
  if (!header) return ''
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' ? token ?? '' : ''
}

export function getUserFromToken(token: string) {
  if (!token.startsWith('mock-token:')) return null
  const userId = token.slice('mock-token:'.length)
  return db.users.find((user) => user._id === userId) ?? null
}

export function issueMockTokens(userId: string) {
  return {
    accessToken: `mock-token:${userId}`,
    refreshToken: `mock-refresh:${userId}`,
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req)
  const user = getUserFromToken(token)
  if (!user) {
    next(new HttpError(401, 'Unauthorized'))
    return
  }
  req.user = { _id: user._id, role: user.role, email: user.email }
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new HttpError(401, 'Unauthorized'))
      return
    }
    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, 'Forbidden'))
      return
    }
    next()
  }
}
