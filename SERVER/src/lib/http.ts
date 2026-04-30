import type { PaginatedResponse } from '../domain.js'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function paginate<T>(items: T[], page = 1, limit = 20): PaginatedResponse<T> {
  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.max(1, Number(limit) || 20)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / safeLimit))
  const start = (safePage - 1) * safeLimit
  return {
    data: items.slice(start, start + safeLimit),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  }
}

export function nowIso() {
  return new Date().toISOString()
}
