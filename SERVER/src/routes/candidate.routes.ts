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
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { cvKey, presignedDownloadUrl, uploadBlob } from '../lib/blob.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

export const candidateRouter = Router()

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
    const updated = await CandidateModel.findByIdAndUpdate(candidate._id, req.body, { new: true }).lean()
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
    const cvParsed = { fileName, extracted: false, textPreview: 'Uploaded successfully. Parsing pipeline pending.' }
    await CandidateModel.findByIdAndUpdate(candidate._id, { cvUrl: key, cvParsed })
    await logAction({ actor: 'user', action: 'cv-upload', candidateId: String(candidate._id), mode: 'assist', payload: { fileName } })
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
    const [applicationsRaw, interviews] = await Promise.all([
      ApplicationModel.find({ candidate: candidateId }).sort({ createdAt: -1 }).lean(),
      InterviewModel.find({ candidate: candidateId }).sort({ scheduledAt: 1 }).lean(),
    ])
    const applications = applicationsRaw
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
      interviewsScheduled: interviews.length,
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
