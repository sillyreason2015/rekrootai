import { Router } from 'express'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { anonymizeText } from '../lib/anonymize.js'

export const anonymizeRouter = Router()

anonymizeRouter.post('/preview', requireAuth, requireRole('candidate', 'recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const text = String((req.body as { text?: string }).text ?? '')
    if (!text.trim()) throw new HttpError(400, 'text is required')
    const maskedText = anonymizeText(text).slice(0, 20000)
    res.json({ ok: true, maskedText })
  } catch (err) { next(err) }
})
