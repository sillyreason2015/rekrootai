import { Router } from 'express'
import multer from 'multer'
import { db, getCandidateByUserId, getUserById, logAction } from '../data/mockStore.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, nowIso } from '../lib/http.js'

const upload = multer({ storage: multer.memoryStorage() })

export const candidateRouter = Router()

candidateRouter.use(requireAuth, requireRole('candidate', 'admin'))

candidateRouter.get('/me', (req, res, next) => {
  try {
    const candidate = req.user ? getCandidateByUserId(req.user._id) : null
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const user = getUserById(candidate.user)
    res.json({ ...candidate, user: user ?? candidate.user })
  } catch (error) {
    next(error)
  }
})

candidateRouter.patch('/me', (req, res, next) => {
  try {
    const candidate = req.user ? getCandidateByUserId(req.user._id) : null
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    Object.assign(candidate, req.body)
    logAction({ actor: 'user', action: 'candidate-profile-update', candidateId: candidate._id, mode: 'assist' })
    res.json(candidate)
  } catch (error) {
    next(error)
  }
})

candidateRouter.post('/me/cv', upload.single('cv'), (req, res, next) => {
  try {
    const candidate = req.user ? getCandidateByUserId(req.user._id) : null
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const fileName = req.file?.originalname ?? 'cv.pdf'
    candidate.cvUrl = `/uploads/${encodeURIComponent(fileName)}`
    candidate.cvParsed = {
      fileName,
      extracted: true,
      textPreview: 'Parsed CV content placeholder from scaffold server',
    }
    logAction({ actor: 'user', action: 'cv-upload', candidateId: candidate._id, mode: 'assist', payload: { fileName } })
    res.json({ cvUrl: candidate.cvUrl, parsed: candidate.cvParsed })
  } catch (error) {
    next(error)
  }
})

candidateRouter.post('/me/onboarding', (req, res, next) => {
  try {
    const user = req.user ? getUserById(req.user._id) : null
    const candidate = req.user ? getCandidateByUserId(req.user._id) : null
    if (!user || !candidate) throw new HttpError(404, 'Candidate profile not found')
    user.onboardingComplete = true
    Object.assign(candidate, req.body)
    logAction({ actor: 'user', action: 'candidate-onboarding-complete', candidateId: candidate._id, mode: 'assist' })
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

candidateRouter.get('/me/dashboard', (req, res, next) => {
  try {
    const candidate = req.user ? getCandidateByUserId(req.user._id) : null
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    const applications = db.applications.filter((application) => application.candidate === candidate._id)
    const assessmentsPending = applications.filter((application) => application.status === 'assessment_sent').length
    const interviewsScheduled = db.interviews.filter((interview) => interview.candidate === candidate._id).length
    res.json({
      applications: applications.length,
      assessmentsPending,
      interviewsScheduled,
      recentApplications: applications.slice(0, 5),
    })
  } catch (error) {
    next(error)
  }
})

candidateRouter.get('/me/cv/download', (_req, res) => {
  res.json({ url: '/uploads/mock-cv-download.pdf', expiresAt: nowIso() })
})

candidateRouter.delete('/me', (req, res, next) => {
  try {
    const candidate = req.user ? getCandidateByUserId(req.user._id) : null
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    logAction({ actor: 'user', action: 'candidate-delete', candidateId: candidate._id, mode: 'assist' })
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})
