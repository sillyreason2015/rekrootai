import type { Role } from './domain.js'

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string
        role: Role
        email: string
      }
    }
  }
}

export {}
