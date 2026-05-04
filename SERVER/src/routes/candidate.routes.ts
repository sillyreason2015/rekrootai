import { Router } from 'express'
import multer from 'multer'
import { getCandidateByUserId, getUserById, ensureCandidateProfile, logAction } from '../data/store.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { UserModel } from '../models/User.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { AssessmentModel } from '../models/Assessment.model.js'
import { AiOutputModel } from '../models/AiOutput.model.js'
import { ProtectedAttributeModel } from '../models/ProtectedAttribute.model.js'
import { JobModel } from '../models/Job.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { cvKey, presignedDownloadUrl, uploadBlob } from '../lib/blob.js'
import { buildParsedCvData, mergeCandidateWithCv, extractStructuredProfileFromCv } from '../lib/candidate-profile.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

export const candidateRouter = Router()

function anonymizeText(input: string): string {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(\+?\d[\d\s\-()]{7,}\d)/g, '[redacted-phone]')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '[redacted-date]')
    .replace(/\b(male|female|man|woman|boy|girl)\b/gi, '[redacted-gender]')
}

candidateRouter.use(requireAuth, requireRole('candidate', 'admin'))

// GET /candidates/me
candidateRouter.get('/me', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const userRaw = await getUserById(String(candidate.user))
    const safeUser = userRaw ? (({ password: _pw, ...u }) => u)(userRaw) : candidate.user
    res.json({ ...candidate, _id: String(candidate._id), user: safeUser })
  } catch (err) {
    next(err)
  }
})

// PATCH /candidates/me
candidateRouter.patch('/me', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const ALLOWED = ['headline', 'skills', 'experience', 'education', 'linkedIn', 'portfolio', 'location', 'availableFrom']
    const safeUpdate = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).filter(([key]) => ALLOWED.includes(key)),
    )
    const updated = await CandidateModel.findByIdAndUpdate(candidate._id, safeUpdate, { new: true }).lean()
    await logAction({ actor: 'user', action: 'candidate-profile-update', candidateId: String(candidate._id), mode: 'assist' })
    res.json({ ...updated, _id: String(updated!._id) })
  } catch (err) {
    next(err)
  }
})

// POST /candidates/me/cv
candidateRouter.post('/me/cv', upload.single('cv'), async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    if (!req.file) throw new HttpError(400, 'Missing CV file')
    const fileName = req.file.originalname
    const key = cvKey(req.user!._id, fileName)
    await uploadBlob(key, req.file.buffer, req.file.mimetype || 'application/octet-stream')
    let rawText = ''
    if (req.file.mimetype?.startsWith('text/')) {
      rawText = req.file.buffer.toString('utf8').slice(0, 8000)
    } else if (req.file.mimetype === 'application/pdf') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = ((await import('pdf-parse/lib/pdf-parse.js' as string)) as any).default as (buf: Buffer) => Promise<{ text?: string }>
      const parsed = await pdfParse(req.file.buffer)
      rawText = String(parsed?.text ?? '').slice(0, 12000)
    } else if (
      req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      req.file.originalname.toLowerCase().endsWith('.docx')
    ) {
      const mammoth = await import('mammoth')
      const parsed = await mammoth.extractRawText({ buffer: req.file.buffer })
      rawText = String(parsed?.value ?? '').slice(0, 12000)
    }
    const masked = rawText ? anonymizeText(rawText) : ''
    const cvParsed = buildParsedCvData(fileName, rawText, masked)
    const derivedProfile = mergeCandidateWithCv(candidate, cvParsed)
    await CandidateModel.findByIdAndUpdate(candidate._id, { cvUrl: key, cvParsed, ...derivedProfile })
    await logAction({ actor: 'user', action: 'cv-upload', candidateId: String(candidate._id), mode: 'assist', payload: { fileName } })
    // Fire-and-forget: enrich profile with Gemini-structured extraction (headline, richer skills/exp/edu)
    if (rawText) {
      extractStructuredProfileFromCv(rawText).then((enriched) => {
        const update: Record<string, unknown> = {
          skills: enriched.skills.length ? enriched.skills : derivedProfile.skills,
          experience: enriched.experience.length ? enriched.experience : derivedProfile.experience,
          education: enriched.education.length ? enriched.education : derivedProfile.education,
        }
        if (enriched.headline) update.headline = enriched.headline
        return CandidateModel.findByIdAndUpdate(candidate._id, update)
      }).catch(() => { /* silent fail — sync parse already saved */ })
    }
    res.json({ cvUrl: key, parsed: cvParsed })
  } catch (err) {
    next(err)
  }
})

// POST /candidates/me/onboarding
candidateRouter.post('/me/onboarding', async (req, res, next) => {
  try {
    const user = await getUserById(req.user!._id)
    if (!user) throw new HttpError(404, 'User not found')
    let candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) {
      candidate = await ensureCandidateProfile(req.user!._id)
    }
    await Promise.all([
      UserModel.findByIdAndUpdate(user._id, { onboardingComplete: true }),
      CandidateModel.findByIdAndUpdate(candidate._id, req.body),
      ProtectedAttributeModel.findOneAndUpdate(
        { candidate: String(candidate._id) },
        {
          candidate: String(candidate._id),
          gender: (req.body as { gender?: string }).gender,
          ageRange: (req.body as { ageRange?: string }).ageRange,
          ethnicity: (req.body as { ethnicity?: string }).ethnicity,
        },
        { upsert: true, new: true },
      ),
    ])
    await logAction({ actor: 'user', action: 'candidate-onboarding-complete', candidateId: String(candidate._id), mode: 'assist' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// GET /candidates/me/dashboard
candidateRouter.get('/me/dashboard', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const candidateId = String(candidate._id)
    const [, interviewsRaw] = await Promise.all([
      ApplicationModel.find({ candidate: candidateId }).sort({ createdAt: -1 }).lean(),
      InterviewModel.find({ candidate: candidateId }).sort({ scheduledAt: 1 }).lean(),
    ])
    for (const iv of interviewsRaw) {
      if (iv.status === 'completed' || iv.status === 'cancelled') continue
      const start = new Date(iv.scheduledAt).getTime()
      const end = start + Number(iv.durationMin ?? 45) * 60_000
      if (Date.now() > end) {
        await InterviewModel.findByIdAndUpdate(String(iv._id), { status: 'completed', score: 0 })
        await ApplicationModel.findByIdAndUpdate(String(iv.application), {
          stage: 'rejected',
          status: 'rejected',
          decision: 'reject',
          decisionBy: 'ai',
        })
      }
    }
    const applications = await ApplicationModel.find({ candidate: candidateId }).sort({ createdAt: -1 }).lean()
    const interviews = await InterviewModel.find({ candidate: candidateId }).sort({ scheduledAt: 1 }).lean()
    const assessmentsPending = applications.filter((a) => a.stage === 'assessment').length
    // Populate job titles for recent applications
    const recent = applications.slice(0, 5)
    const jobIds = [...new Set(recent.map((a) => a.job))]
    const { JobModel } = await import('../models/Job.model.js')
    const jobs = await JobModel.find({ _id: { $in: jobIds } }).lean()
    const jobMap = Object.fromEntries(jobs.map((j) => [String(j._id), { ...j, _id: String(j._id) }]))
    const appIds = applications.map((a) => String(a._id))
    const assessments = await AssessmentModel.find({ application: { $in: appIds } }).lean()
    const assessmentMap = Object.fromEntries(assessments.map((a) => [String(a.application), a]))
    const interviewMap = Object.fromEntries(interviews.map((i) => [String(i.application), i]))

    const stagePriority: Record<string, number> = {
      assessment: 1,
      interview: 2,
      decision: 3,
      screening: 4,
      applied: 5,
      offered: 6,
      rejected: 7,
    }
    const orderedApps = [...applications].sort(
      (a, b) => (stagePriority[a.stage] ?? 99) - (stagePriority[b.stage] ?? 99),
    )

    let nextAction: Record<string, unknown> | null = null
    for (const app of orderedApps) {
      const appId = String(app._id)
      if (app.stage === 'assessment') {
        const as = assessmentMap[appId]
        nextAction = {
          type: 'assessment',
          label: 'Complete Assessment',
          href: `/candidate/assessment/${appId}`,
          dueAt: as?.expiresAt,
          jobTitle: (jobMap[app.job] as { title?: string } | undefined)?.title ?? 'Job',
        }
        break
      }
      if (app.stage === 'interview') {
        const iv = interviewMap[appId]
        if (!iv || iv.status === 'completed' || iv.status === 'cancelled') continue
        nextAction = {
          type: 'interview',
          label: 'Join Interview',
          href: iv ? `/candidate/interview/${String(iv._id)}` : '/candidate/applications',
          dueAt: iv?.scheduledAt,
          jobTitle: (jobMap[app.job] as { title?: string } | undefined)?.title ?? 'Job',
        }
        break
      }
    }

    res.json({
      applications: applications.length,
      assessmentsPending,
      interviewsScheduled: interviews.filter((i) => i.status === 'scheduled' && new Date(i.scheduledAt).getTime() >= Date.now()).length,
      nextAction,
      recentApplications: recent.map((a) => ({ ...a, _id: String(a._id), job: jobMap[a.job] ?? a.job })),
    })
  } catch (err) {
    next(err)
  }
})

// GET /candidates/me/cv/download
candidateRouter.get('/me/cv/download', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate?.cvUrl) throw new HttpError(404, 'No CV on file')
    const url = await presignedDownloadUrl(candidate.cvUrl, 3600)
    res.json({ url, expiresAt: new Date(Date.now() + 3600_000).toISOString() })
  } catch (err) {
    next(err)
  }
})

// DELETE /candidates/me
candidateRouter.delete('/me', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const candidateId = String(candidate._id)
    const appIds = (await ApplicationModel.find({ candidate: candidateId }).select('_id').lean()).map((a) => String(a._id))

    await Promise.all([
      ProtectedAttributeModel.deleteOne({ candidate: candidateId }),
      AiOutputModel.deleteMany({ application: { $in: appIds } }),
      AssessmentModel.deleteMany({ application: { $in: appIds } }),
      InterviewModel.deleteMany({ application: { $in: appIds } }),
      ApplicationModel.deleteMany({ candidate: candidateId }),
      CandidateModel.deleteOne({ _id: candidateId }),
      UserModel.deleteOne({ _id: req.user!._id }),
    ])
    await logAction({ actor: 'user', action: 'candidate-delete', candidateId: String(candidate._id), mode: 'assist' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Extract skill-like tokens from raw CV text
function extractCvKeywords(text: string): string[] {
  if (!text) return []
  // Remove punctuation, split into words, keep 2-30 char tokens, lowercase
  const words = text.toLowerCase().replace(/[^a-z0-9#+.\s-]/g, ' ').split(/\s+/)
  // Common filler words to ignore
  const stop = new Set(['the','and','for','with','from','that','this','have','been','will','are','was','were','has','had','not','but','can','our','your','their','about','into','more','also','when','which','what','they','than','then','over','such','each','after','before','between'])
  return [...new Set(words.filter((w) => w.length >= 2 && w.length <= 30 && !stop.has(w)))]
}

// GET /candidates/recommendations — AI job recommendations for the logged-in candidate
candidateRouter.get('/recommendations', async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(String(req.user!._id))
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')

    // Build skill set: profile skills + keywords extracted from CV text
    const profileSkills = (candidate.skills ?? []).map((s: string) => s.toLowerCase())
    const cvText = String((candidate.cvParsed as Record<string, unknown> | undefined)?.maskedCV ?? '')
    const cvKeywords = extractCvKeywords(cvText)
    // Also extract titles/companies from experience for keyword boosting
    const expKeywords = (candidate.experience ?? []).flatMap((e: { title: string; company: string; description: string }) =>
      [e.title, e.company, e.description].join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3)
    )
    void new Set([...profileSkills, ...cvKeywords, ...expKeywords]) // combined token pool (reserved for future vector scoring)

    const appliedApps = await ApplicationModel.find({ candidate: String(candidate._id) }, { job: 1 }).lean()
    const appliedJobIds = appliedApps.map((a) => String(a.job))

    const jobs = await JobModel.find({ status: 'published', _id: { $nin: appliedJobIds } }).lean()

    const expYears = (candidate.experience ?? []).length

    const scored = jobs.map((j) => {
      const jobSkills = (j.skills ?? []).map((s: string) => s.toLowerCase())
      const jobTokens = new Set([
        ...jobSkills,
        ...j.title.toLowerCase().split(/\s+/),
        ...(j.description ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3),
        ...(j.requirements ?? []).join(' ').toLowerCase().split(/\s+/).filter((w) => w.length >= 3),
      ])

      // Exact profile skill matches (highest weight)
      const exactSkillMatches = profileSkills.filter((s) => jobSkills.includes(s))

      // CV keyword hits against job tokens
      const cvHits = cvKeywords.filter((kw) => jobTokens.has(kw))

      // Combined unique signal
      const combinedSignal = new Set([...exactSkillMatches, ...cvHits.slice(0, 20)])

      const matchPct = Math.round((combinedSignal.size / Math.max(jobSkills.length + 5, 1)) * 100)

      // Level alignment boost
      let levelBoost = 0
      if (j.level === 'graduate' && expYears <= 1) levelBoost = 10
      else if (j.level === 'entry' && expYears <= 3) levelBoost = 8
      else if (j.level === 'mid' && expYears >= 2 && expYears <= 6) levelBoost = 8
      else if (j.level === 'senior' && expYears >= 5) levelBoost = 10
      else if (j.level === 'lead' && expYears >= 7) levelBoost = 8
      else if (j.level === 'executive' && expYears >= 10) levelBoost = 8

      const score = Math.min(100, matchPct + levelBoost)

      const reasons: string[] = []
      if (exactSkillMatches.length > 0) reasons.push(`${exactSkillMatches.length} profile skill${exactSkillMatches.length > 1 ? 's' : ''} match`)
      if (cvHits.length > 0 && exactSkillMatches.length === 0) reasons.push(`${cvHits.length} keyword${cvHits.length > 1 ? 's' : ''} found in your CV`)
      if (cvHits.length > 0 && exactSkillMatches.length > 0) reasons.push(`CV content reinforces match`)
      if (levelBoost > 0) reasons.push(`level fits your experience`)
      if (j.remote === 'remote') reasons.push('fully remote')
      if (j.remote === 'hybrid') reasons.push('hybrid working')
      if (reasons.length === 0) reasons.push('open role in your field')

      return {
        _id: String(j._id),
        title: j.title,
        department: j.department,
        level: j.level,
        location: j.location,
        type: j.type,
        remote: j.remote,
        salaryCurrency: j.salaryCurrency,
        salaryMin: j.salaryMin,
        salaryMax: j.salaryMax,
        matchScore: score,
        matchedSkills: exactSkillMatches.length,
        cvKeywordHits: cvHits.length,
        totalSkills: jobSkills.length,
        reasons,
        matchSources: {
          profileSkills: exactSkillMatches.length > 0,
          cvContent: cvHits.length > 0,
          experience: expYears > 0,
        },
      }
    })

    const recommendations = scored
      .filter((j) => j.matchScore >= 15)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10)

    const hasCv = Boolean(cvText)
    res.json({
      recommendations,
      candidateSkillCount: profileSkills.length,
      cvAnalysed: hasCv,
      cvKeywordCount: cvKeywords.length,
      matchNote: hasCv
        ? 'Recommendations use your profile skills + CV content analysis'
        : 'Upload a CV to improve recommendation accuracy',
    })
  } catch (err) { next(err) }
})
