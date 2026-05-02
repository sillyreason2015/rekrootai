import { Router } from 'express'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'

export const anonymizeRouter = Router()

function anonymizeText(input: string): string {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(\+?\d[\d\s\-()]{7,}\d)/g, '[redacted-phone]')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '[redacted-date]')
    .replace(/\b(male|female|man|woman|boy|girl)\b/gi, '[redacted-gender]')
}

anonymizeRouter.post('/preview', requireAuth, requireRole('candidate', 'recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const text = String((req.body as { text?: string }).text ?? '')
    if (!text.trim()) throw new HttpError(400, 'text is required')
    const maskedText = anonymizeText(text).slice(0, 20000)
    res.json({ ok: true, maskedText })
  } catch (err) { next(err) }
})
