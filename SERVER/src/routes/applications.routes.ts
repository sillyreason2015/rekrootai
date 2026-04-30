import { Router } from 'express'
import { db, getApplicationById, getCandidateByUserId, getJobById, logAction } from '../data/mockStore.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, nowIso, paginate } from '../lib/http.js'

export const applicationsRouter = Router()

applicationsRouter.post('/', requireAuth, requireRole('candidate', 'admin'), (req, res, next) => {
  try {
    const { jobId } = req.body as { jobId?: string }
    const candidate = req.user ? getCandidateByUserId(req.user._id) : null
    const job = jobId ? getJobById(jobId) : null
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    if (!job) throw new HttpError(404, 'Job not found')
    const application = {
      _id: `app-${db.applications.length + 1}`,
      job: job._id,
      candidate: candidate._id,
      status: 'pending' as const,
      scores: { resume: 0, assessment: 0, penalty: 0, interview: 0, final: 0 },
      stage: 'applied' as const,
      createdAt: nowIso(),
    }
    db.applications.unshift(application)
    logAction({ actor: 'user', action: 'application-create', candidateId: candidate._id, jobId: job._id, mode: 'assist' })
    res.status(201).json(application)
  } catch (error) {
    next(error)
  }
})

applicationsRouter.get('/mine', requireAuth, requireRole('candidate', 'admin'), (req, res) => {
  const candidate = req.user ? getCandidateByUserId(req.user._id) : null
  const applications = candidate ? db.applications.filter((application) => application.candidate === candidate._id) : []
  res.json(applications)
})

applicationsRouter.get('/:id', requireAuth, (req, res, next) => {
  try {
    const application = getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    res.json(application)
  } catch (error) {
    next(error)
  }
})

applicationsRouter.get('/job/:jobId', requireAuth, requireRole('recruiter', 'admin'), (req, res) => {
  const page = Number(req.query.page ?? 1)
  const limit = Number(req.query.limit ?? 10)
  const stage = String(req.query.stage ?? '')
  const applications = db.applications.filter((application) => application.job === req.params.jobId && (!stage || application.stage === stage))
  res.json(paginate(applications, page, limit))
})

applicationsRouter.post('/:id/shortlist', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const application = getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    application.status = 'shortlisted'
    application.stage = 'screening'
    logAction({ actor: 'user', action: 'application-shortlist', candidateId: application.candidate, jobId: application.job, mode: 'assist' })
    res.json(application)
  } catch (error) {
    next(error)
  }
})

applicationsRouter.post('/:id/reject', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const application = getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    application.status = 'rejected'
    application.stage = 'rejected'
    application.recruiterNotes = (req.body as { reason?: string }).reason
    logAction({ actor: 'user', action: 'application-reject', candidateId: application.candidate, jobId: application.job, mode: 'assist' })
    res.json(application)
  } catch (error) {
    next(error)
  }
})

applicationsRouter.post('/:id/decision', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const application = getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    const { decision, notes } = req.body as { decision?: 'hire' | 'reject' | 'hold'; notes?: string }
    application.decision = decision
    application.recruiterNotes = notes
    application.decisionBy = req.user?._id
    application.decisionAt = nowIso()
    application.status = 'decision_made'
    application.stage = decision === 'hire' ? 'decision' : 'rejected'
    logAction({ actor: 'user', action: 'application-decision', candidateId: application.candidate, jobId: application.job, mode: 'assist' })
    res.json(application)
  } catch (error) {
    next(error)
  }
})

applicationsRouter.get('/:id/explanation', requireAuth, (req, res, next) => {
  try {
    const application = getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    const s = application.scores
    // Normalise 0–1 stored values to 0–100 for client display
    const toPercent = (v: number) => Math.round((v > 1 ? v : v * 100) * 10) / 10
    res.json({
      scores: {
        resumeScore: toPercent(s.resume ?? 0),
        assessmentScore: toPercent(s.assessment ?? 0),
        penaltyApplied: toPercent(s.penalty ?? 0),
        interviewScore: toPercent(s.interview ?? 0),
        finalScore: toPercent(s.final ?? 0),
        weights: { w1: 0.3, w2: 0.3, w3: 0.1, w4: 0.3 },
        explanation: 'Your resume strongly matched the required skills. Assessment performance was above the role threshold. Interview rubric scores indicate strong communication and technical knowledge.',
        shapValues: {
          react_typescript: 0.18,
          years_experience: 0.12,
          assessment_score: 0.09,
          communication: 0.08,
          education_match: 0.05,
          location_match: 0.03,
          cv_completeness: 0.02,
        },
      },
    })
  } catch (error) {
    next(error)
  }
})

applicationsRouter.post('/:id/correspondence/send', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const application = getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    logAction({ actor: 'user', action: 'correspondence-send', candidateId: application.candidate, jobId: application.job, mode: 'assist', payload: req.body as Record<string, unknown> })
    res.json({ ok: true, message: 'Correspondence queued' })
  } catch (error) {
    next(error)
  }
})
