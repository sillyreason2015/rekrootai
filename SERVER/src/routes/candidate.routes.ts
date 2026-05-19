import { Router } from 'express'
import multer from 'multer'
import { getCandidateByUserId, getUserById, ensureCandidateProfile, logAction } from '../data/store.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { UserModel } from '../models/User.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { AssessmentModel } from '../models/Assessment.model.js'
import { JobModel } from '../models/Job.model.js'
import { ProtectedAttributeModel } from '../models/ProtectedAttribute.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { cvKey, presignedDownloadUrl, uploadBlob } from '../lib/blob.js'
import { buildParsedCvData, mergeCandidateWithCv, extractStructuredProfileFromCv, scoreCandidateForJob } from '../lib/candidate-profile.js'
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
    const keywordProfile = mergeCandidateWithCv(candidate as Parameters<typeof mergeCandidateWithCv>[0], cvParsed)

    // 4. Run Gemini-based structured enrichment synchronously so the response has accurate data
    let enriched = keywordProfile as { skills: string[]; experience: unknown[]; education: unknown[]; headline?: string }
    if (rawText) {
      try {
        const geminiResult = await extractStructuredProfileFromCv(rawText)
        enriched = {
          skills: geminiResult.skills.length ? geminiResult.skills : keywordProfile.skills,
          experience: geminiResult.experience.length ? geminiResult.experience : keywordProfile.experience,
          education: geminiResult.education.length ? geminiResult.education : keywordProfile.education,
          headline: geminiResult.headline || undefined,
        }
      } catch {
        // fall through — use keyword-inferred data
      }
    }

    const profileUpdate: Record<string, unknown> = { cvUrl: key, cvParsed, ...enriched }
    if (!enriched.headline) delete profileUpdate.headline
    await CandidateModel.findByIdAndUpdate(candidate._id, profileUpdate)
    await logAction({ actor: 'user', action: 'cv-upload', candidateId: String(candidate._id), mode: 'assist', payload: { fileName } })

    // 5. Recalculate resume scores on all active applications using the updated profile
    const updatedCandidate = await CandidateModel.findById(candidate._id).lean()
    if (updatedCandidate) {
      const activeApps = await ApplicationModel.find({
        candidate: candidate._id,
        stage: { $nin: ['rejected', 'offered', 'decision'] },
      }).populate('job', 'title department skills requirements').lean()

      await Promise.all(activeApps.map(async (app) => {
        const job = app.job as unknown as Parameters<typeof scoreCandidateForJob>[1] | null
        if (!job || typeof job === 'string') return
        const newScore = scoreCandidateForJob(updatedCandidate as Parameters<typeof scoreCandidateForJob>[0], job)
        await ApplicationModel.findByIdAndUpdate(app._id, { 'scores.resume': newScore })
      }))
    }

    res.json({ cvUrl: key, parsed: cvParsed, enriched, message: 'CV uploaded and profile updated.' })
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
    const body = req.body as { gender?: string; ageRange?: string; ethnicity?: string }
    await ProtectedAttributeModel.findOneAndUpdate(
      { candidate: String(candidate._id) },
      {
        candidate: String(candidate._id),
        gender: body.gender,
        ageRange: body.ageRange,
        ethnicity: body.ethnicity,
      },
      { upsert: true, new: true },
    )
    await logAction({ actor: 'user', action: 'candidate-onboarding-complete', candidateId: String(candidate._id), mode: 'assist' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /candidates/me/dashboard ─────────────────────────────────────────────
candidateRouter.get('/me/dashboard', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const [applicationsCount, interviewsCount, assessmentsCount, recentApplications] = await Promise.all([
      ApplicationModel.countDocuments({ candidate: candidate._id }),
      InterviewModel.countDocuments({ candidate: String(candidate._id), status: 'scheduled' } as object),
      AssessmentModel.countDocuments({ candidate: String(candidate._id), status: 'pending' } as object),
      ApplicationModel.find({ candidate: candidate._id })
        .populate('job', 'title department')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ])
    res.json({
      applications: applicationsCount,
      assessmentsPending: assessmentsCount,
      interviewsScheduled: interviewsCount,
      recentApplications,
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
 * Tier 1: Gemini native PDF reading (best — understands document structure)
 * Tier 2: pdfjs-dist (good — Mozilla's renderer, preserves layout)
 * Tier 3: pdf-parse (basic fallback)
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // Tier 1: Gemini
  if (env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const result = await model.generateContent([
        { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
        'Extract all text from this CV/resume. Preserve section headers (Experience, Education, Skills) on their own lines with content beneath. Output full text verbatim, no summarising.',
      ])
      const text = result.response.text().trim()
      if (text.length > 100) return text.slice(0, 12000)
    } catch { /* fall through */ }
  }

  // Tier 2: pdfjs-dist (accurate, structure-aware)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string) as any
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    const pdf = await loadingTask.promise
    const pages: string[] = []
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageText = content.items.map((item: any) => item.str ?? '').join(' ')
      pages.push(pageText)
    }
    const text = pages.join('\n').trim()
    if (text.length > 100) return text.slice(0, 12000)
  } catch { /* fall through */ }

  // Tier 3: pdf-parse (basic)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = ((await import('pdf-parse/lib/pdf-parse.js' as string)) as any).default as (buf: Buffer) => Promise<{ text?: string }>
    const parsed = await pdfParse(buffer)
    return String(parsed?.text ?? '').slice(0, 12000)
  } catch {
    return ''
  }
}


// ── GET /candidates/recommendations ──────────────────────────────────────────
candidateRouter.get('/recommendations', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) return res.json({ recommendations: [], matchNote: 'Complete your profile to get recommendations.' })
    const jobs = await JobModel.find({ status: 'published' }).sort({ createdAt: -1 }).limit(100).lean()
    const existingApps = await ApplicationModel.find({ candidate: candidate._id }, { job: 1 }).lean()
    const appliedIds = new Set(existingApps.map((a) => String(a.job)))
    const { scoreCandidateForJob, inferSkillsFromCv } = await import('../lib/candidate-profile.js')
    const cvText = String((candidate.cvParsed as Record<string, unknown> | undefined)?.maskedCV ?? '')
    const cvKeywords = cvText ? inferSkillsFromCv(cvText) : []
    const scored = jobs
      .filter((j) => !appliedIds.has(String(j._id)))
      .map((job) => {
        const score = scoreCandidateForJob(candidate as Parameters<typeof scoreCandidateForJob>[0], job as Parameters<typeof scoreCandidateForJob>[1])
        const matchedSkills = (candidate.skills ?? []).filter((s: string) => (job.skills ?? []).map((js: string) => js.toLowerCase()).includes(s.toLowerCase())).length
        return { ...job, _id: String(job._id), matchScore: score, matchedSkills, cvKeywordHits: cvKeywords.length, totalSkills: job.skills?.length ?? 0, reasons: score >= 60 ? ['Strong skill match'] : ['Expand your skills to improve match'], matchSources: { profileSkills: matchedSkills > 0, cvContent: cvKeywords.length > 0, experience: (candidate.experience?.length ?? 0) > 0 } }
      })
      .filter((j) => j.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10)
    res.json({ recommendations: scored, candidateSkillCount: candidate.skills?.length ?? 0, cvAnalysed: !!cvText, cvKeywordCount: cvKeywords.length, matchNote: scored.length ? `${scored.length} jobs match your profile` : 'Upload your CV and add skills to get personalised recommendations.' })
  } catch (err) { next(err) }
})
