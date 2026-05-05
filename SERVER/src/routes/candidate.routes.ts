import { Router } from 'express'
import multer from 'multer'
import { getCandidateByUserId, getUserById, ensureCandidateProfile, logAction } from '../data/store.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { UserModel } from '../models/User.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { AssessmentModel } from '../models/Assessment.model.js'
import { JobModel } from '../models/Job.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { cvKey, presignedDownloadUrl, uploadBlob } from '../lib/blob.js'
import { buildParsedCvData, mergeCandidateWithCv, inferSkillsFromCv } from '../lib/candidate-profile.js'
import { env } from '../config/env.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

export const candidateRouter = Router()
candidateRouter.use(requireAuth, requireRole('candidate', 'admin', 'super_admin'))

// ── GET /candidates/me ────────────────────────────────────────────────────────
candidateRouter.get('/me', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const userRaw = await getUserById(String(candidate.user))
    const safeUser = userRaw
      ? (({ password: _pw, ...u }) => u)(userRaw as Record<string, unknown> & { password?: unknown })
      : candidate.user
    res.json({ ...candidate, _id: String(candidate._id), user: safeUser })
  } catch (err) { next(err) }
})

// ── PATCH /candidates/me ──────────────────────────────────────────────────────
candidateRouter.patch('/me', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const ALLOWED = [
      'headline', 'skills', 'experience', 'education',
      'linkedIn', 'portfolio', 'location', 'availableFrom',
    ]
    const safeUpdate = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).filter(([k]) => ALLOWED.includes(k)),
    )
    const updated = await CandidateModel.findByIdAndUpdate(candidate._id, safeUpdate, { new: true }).lean()
    await logAction({ actor: 'user', action: 'candidate-profile-update', candidateId: String(candidate._id), mode: 'assist' })
    res.json({ ...updated, _id: String(updated!._id) })
  } catch (err) { next(err) }
})

// ── POST /candidates/me/cv ────────────────────────────────────────────────────
// Parses PDF/DOCX/TXT, saves to S3, then uses Gemini to extract structured
// profile data (headline, skills, experience, education). Falls back to
// keyword inference if Gemini is unavailable.
candidateRouter.post('/me/cv', upload.single('cv'), async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    if (!req.file) throw new HttpError(400, 'No file uploaded')

    const fileName = req.file.originalname
    const key = cvKey(req.user!._id, fileName)

    // 1. Upload raw file to S3
    await uploadBlob(key, req.file.buffer, req.file.mimetype || 'application/octet-stream')

    // 2. Extract raw text from file
    let rawText = ''
    const mime = req.file.mimetype ?? ''
    const name = fileName.toLowerCase()

    if (mime.startsWith('text/')) {
      rawText = req.file.buffer.toString('utf8').slice(0, 12000)
    } else if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      rawText = await extractPdfText(req.file.buffer)
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    ) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer: req.file.buffer })
      rawText = String(result?.value ?? '').slice(0, 12000)
    }

    // 3. Anonymise and build initial CV metadata
    const masked = rawText ? anonymizeText(rawText) : ''
    const cvParsed = buildParsedCvData(fileName, rawText, masked)
    const derivedProfile = mergeCandidateWithCv(candidate as Parameters<typeof mergeCandidateWithCv>[0], cvParsed)

    // 4. Save immediately so upload response is fast
    await CandidateModel.findByIdAndUpdate(candidate._id, { cvUrl: key, cvParsed, ...derivedProfile })
    await logAction({ actor: 'user', action: 'cv-upload', candidateId: String(candidate._id), mode: 'assist', payload: { fileName } })

    // 5. Fire-and-forget: Gemini-based structured enrichment (headline, richer exp/edu/skills)
    if (rawText) {
      enrichProfileWithGemini(String(candidate._id), rawText, derivedProfile).catch(() => {})
    }

    res.json({ cvUrl: key, parsed: cvParsed, message: 'CV uploaded. Profile will be updated shortly.' })
  } catch (err) { next(err) }
})

// ── POST /candidates/me/onboarding ───────────────────────────────────────────
candidateRouter.post('/me/onboarding', async (req, res, next) => {
  try {
    const candidate = await ensureCandidateProfile(req.user!._id)
    const ALLOWED = [
      'headline', 'skills', 'experience', 'education',
      'linkedIn', 'portfolio', 'location', 'availableFrom',
    ]
    const safeUpdate = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).filter(([k]) => ALLOWED.includes(k)),
    )
    await UserModel.findByIdAndUpdate(req.user!._id, { onboardingComplete: true })
    await CandidateModel.findByIdAndUpdate(candidate._id, safeUpdate)
    await logAction({ actor: 'user', action: 'candidate-onboarding-complete', candidateId: String(candidate._id), mode: 'assist' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /candidates/me/dashboard ─────────────────────────────────────────────
candidateRouter.get('/me/dashboard', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const [applications, interviews, assessments] = await Promise.all([
      ApplicationModel.find({ candidate: candidate._id }).populate('job', 'title department').lean(),
      InterviewModel.find({ candidate: String(candidate._id), status: 'scheduled' } as object).lean(),
      AssessmentModel.find({ candidate: String(candidate._id), status: 'pending' } as object).lean(),
    ])
    res.json({
      applications: applications.length,
      assessmentsPending: assessments.length,
      interviewsScheduled: interviews.length,
      recentApplications: applications.slice(0, 5),
    })
  } catch (err) { next(err) }
})

// ── GET /candidates/me/cv/download ───────────────────────────────────────────
candidateRouter.get('/me/cv/download', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate?.cvUrl) throw new HttpError(404, 'No CV on file')
    const url = await presignedDownloadUrl(candidate.cvUrl, 3600)
    res.json({ url, expiresIn: 3600 })
  } catch (err) { next(err) }
})

// ── DELETE /candidates/me ─────────────────────────────────────────────────────
candidateRouter.delete('/me', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    await CandidateModel.findByIdAndDelete(candidate._id)
    await UserModel.findByIdAndDelete(req.user!._id)
    await logAction({ actor: 'user', action: 'candidate-delete', candidateId: String(candidate._id), mode: 'assist' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /candidates/me/jobs ───────────────────────────────────────────────────
// Returns published jobs the candidate hasn't applied to yet
candidateRouter.get('/me/jobs', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    const existingApps = candidate
      ? await ApplicationModel.find({ candidate: candidate._id }, { job: 1 }).lean()
      : []
    const appliedJobIds = existingApps.map((a) => String(a.job))
    const jobs = await JobModel.find({
      status: 'published',
      _id: { $nin: appliedJobIds },
    }).sort({ createdAt: -1 }).limit(50).lean()
    res.json(jobs)
  } catch (err) { next(err) }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function anonymizeText(input: string): string {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(\+?\d[\d\s\-()­]{7,}\d)/g, '[redacted-phone]')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '[redacted-date]')
    .replace(/\b(male|female|man|woman|he|she|his|her)\b/gi, '[redacted]')
}

/**
 * Extract text from a PDF buffer.
 * Uses Gemini's native PDF reading when available (far more accurate),
 * falls back to pdf-parse for offline/no-key scenarios.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // Try Gemini-native PDF extraction first — it understands document structure
  if (env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: buffer.toString('base64'),
          },
        },
        'Extract all text from this CV/resume document. Preserve the structure: output section headers (like Experience, Education, Skills) on their own lines, then the content beneath each. Do not summarize — output the full text verbatim.',
      ])
      const text = result.response.text().trim()
      if (text.length > 100) return text.slice(0, 12000)
    } catch {
      // fall through to pdf-parse
    }
  }

  // Fallback: pdf-parse (import from lib path to avoid test-file crash)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = ((await import('pdf-parse/lib/pdf-parse.js' as string)) as any).default as (buf: Buffer) => Promise<{ text?: string }>
    const parsed = await pdfParse(buffer)
    return String(parsed?.text ?? '').slice(0, 12000)
  } catch {
    return ''
  }
}

/**
 * Gemini-powered structured profile extraction.
 * Runs after the initial upload response so the user isn't kept waiting.
 */
async function enrichProfileWithGemini(
  candidateId: string,
  rawText: string,
  fallback: { skills: string[]; experience: unknown[]; education: unknown[] },
): Promise<void> {
  if (!env.GEMINI_API_KEY) return

  const prompt = `Extract structured profile data from this CV. Return ONLY valid JSON with these exact keys:
- "headline": string — 1-line professional headline e.g. "Senior Software Engineer · 5 yrs"
- "skills": string[] — up to 15 technical and soft skills, title-cased
- "experience": array of { title, company, startDate (YYYY-MM or ""), endDate (YYYY-MM or ""), current (bool), description (max 120 chars) }
- "education": array of { institution, degree, field, startDate (YYYY-MM or ""), endDate (YYYY-MM or ""), current (bool) }

CV text:
${rawText.slice(0, 4000)}

Respond ONLY with valid JSON. No markdown fences.`

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(text)

    const update: Record<string, unknown> = {
      skills: Array.isArray(parsed.skills) && parsed.skills.length
        ? parsed.skills.map(String).slice(0, 20)
        : (fallback.skills.length ? fallback.skills : inferSkillsFromCv(rawText)),
      experience: Array.isArray(parsed.experience) && parsed.experience.length
        ? parsed.experience.slice(0, 8)
        : fallback.experience,
      education: Array.isArray(parsed.education) && parsed.education.length
        ? parsed.education.slice(0, 5)
        : fallback.education,
    }
    if (typeof parsed.headline === 'string' && parsed.headline.trim()) {
      update.headline = parsed.headline.trim()
    }

    await CandidateModel.findByIdAndUpdate(candidateId, update)
  } catch {
    // Silent — initial sync data already saved
  }
}
