/**
 * Platform settings cache + enforcement middleware.
 * Settings are fetched from DB at most once every 30 seconds so we
 * never hit Mongo on every request.
 */
import type { Request, Response, NextFunction } from 'express'

interface PlatformSettings {
  maintenance: boolean
  maintenanceMsg: string
  aiAssist: boolean
  fairnessGate: boolean
  shapExplain: boolean
  candidateExplain: boolean
  geminiGen: boolean
  gdprMode: boolean
  auditImmutable: boolean
  proctoring: boolean
  retentionDays: number
}

const CACHE_TTL_MS = 30_000
let cache: PlatformSettings | null = null
let cacheAt = 0

export async function getSettings(): Promise<PlatformSettings> {
  const now = Date.now()
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache
  try {
    const { SystemSettingsModel } = await import('../models/SystemSettings.model.js')
    const doc = await SystemSettingsModel.findOne().lean()
    cache = {
      maintenance: Boolean(doc?.maintenance),
      maintenanceMsg: String(doc?.maintenanceMsg ?? 'The platform is undergoing scheduled maintenance.'),
      aiAssist: doc?.aiAssist !== false,
      fairnessGate: doc?.fairnessGate !== false,
      shapExplain: doc?.shapExplain !== false,
      candidateExplain: doc?.candidateExplain !== false,
      geminiGen: doc?.geminiGen !== false,
      gdprMode: doc?.gdprMode !== false,
      auditImmutable: doc?.auditImmutable !== false,
      proctoring: doc?.proctoring !== false,
      retentionDays: Number(doc?.retentionDays ?? 730),
    }
    cacheAt = now
  } catch {
    // If DB fails return safe defaults so the app doesn't break
    cache = cache ?? {
      maintenance: false, maintenanceMsg: '', aiAssist: true, fairnessGate: true,
      shapExplain: true, candidateExplain: true, geminiGen: true, gdprMode: true,
      auditImmutable: true, proctoring: true, retentionDays: 730,
    }
  }
  return cache!
}

/** Call this after a PUT /super/settings so the cache is invalidated immediately */
export function invalidateSettingsCache() { cacheAt = 0 }

/**
 * Middleware: blocks all non-super-admin API requests when maintenance mode is on.
 * Auth routes and the health endpoint are always allowed through.
 */
export async function maintenanceGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getSettings()
    if (!settings.maintenance) return next()
    // Always allow: health check, auth routes, super-admin routes
    if (
      req.path === '/health' ||
      req.path.startsWith('/auth/') ||
      req.path.startsWith('/admin/super/')
    ) return next()
    // Allow super_admins through regardless
    const user = (req as Request & { user?: { role?: string } }).user
    if (user?.role === 'super_admin') return next()
    res.status(503).json({ message: settings.maintenanceMsg || 'Platform is under maintenance.' })
  } catch {
    next()
  }
}
