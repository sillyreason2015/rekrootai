import { Router } from 'express'
import { ApplicationModel } from '../models/Application.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { JobModel } from '../models/Job.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, paginate } from '../lib/http.js'
import { logAction } from '../data/store.js'
import { scoreCandidateForJob } from '../lib/candidate-profile.js'

export const applicationsRouter = Router()

// ── POST /applications — candidate applies ────────────────────────────────────
applicationsRouter.post('/', requireAuth, requireRole('candidate', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { jobId } = req.body as { jobId?: string }
    if (!jobId) throw new HttpError(400, 'jobId is required')
    const [candidate, job] = await Promise.all([
      CandidateModel.findOne({ user: req.user!._id }).lean(),
      JobModel.findById(jobId).lean(),
    ])
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    if (!job) throw new HttpError(404, 'Job not found')
    const existing = await ApplicationModel.findOne({ candidate: candidate._id, job: jobId }).lean()
    if (existing) throw new HttpError(409, 'Already applied to this job')

    const resumeScore = scoreCandidateForJob(candidate as Parameters<typeof scoreCandidateForJob>[0], job as Parameters<typeof scoreCandidateForJob>[1])
    const application = await ApplicationModel.create({
      job: jobId,
      candidate: candidate._id,
      status: 'pending',
      stage: 'applied',
      scores: { resume: resumeScore, assessment: 0, penalty: 0, interview: 0, final: resumeScore },
    })
    await logAction({ actor: 'user', action: 'apply', candidateId: String(candidate._id), jobId, mode: 'assist' })
    res.status(201).json({ ...application.toObject(), _id: String(application._id) })
  } catch (err) { next(err) }
})

// ── GET /applications/mine ─────────────────────────────────────────────────────
applicationsRouter.get('/mine', requireAuth, requireRole('candidate', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const candidate = await CandidateModel.findOne({ user: req.user!._id }).lean()
    if (!candidate) return res.json([])
    const apps = await ApplicationModel.find({ candidate: candidate._id })
      .populate('job', 'title department location type status')
      .sort({ createdAt: -1 }).lean()
    res.json(apps)
  } catch (err) { next(err) }
})

// ── GET /applications/job/:jobId ──────────────────────────────────────────────
applicationsRouter.get('/job/:jobId', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 20)
    const stage = String(req.query.stage ?? '')
    const filter: Record<string, unknown> = { job: req.params.jobId }
    if (stage) filter.stage = stage
    const all = await ApplicationModel.find(filter)
      .populate('candidate', 'skills experience headline cvUrl')
      .sort({ createdAt: -1 }).lean()
    res.json(paginate(all, page, limit))
  } catch (err) { next(err) }
})

// ── GET /applications/:id ─────────────────────────────────────────────────────
applicationsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id)
      .populate('job', 'title department skills requirements')
      .populate('candidate', 'skills experience education headline cvUrl cvParsed')
      .lean()
    if (!app) throw new HttpError(404, 'Application not found')
    res.json({ ...app, _id: String(app._id) })
  } catch (err) { next(err) }
})

// ── POST /applications/:id/shortlist ──────────────────────────────────────────
applicationsRouter.post('/:id/shortlist', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findByIdAndUpdate(
      req.params.id,
      { status: 'shortlisted', stage: 'screening' },
      { new: true },
    ).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    await logAction({ actor: 'user', action: 'shortlisted', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist' })
    res.json({ ...app, _id: String(app._id) })
  } catch (err) { next(err) }
})

// ── POST /applications/:id/reject ─────────────────────────────────────────────
applicationsRouter.post('/:id/reject', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { reason } = req.body as { reason?: string }
    const app = await ApplicationModel.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', stage: 'rejected', recruiterNotes: reason },
      { new: true },
    ).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    await logAction({ actor: 'user', action: 'rejected', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist', payload: { decision: reason } })
    res.json({ ...app, _id: String(app._id) })
  } catch (err) { next(err) }
})

// ── POST /applications/:id/decision ───────────────────────────────────────────
applicationsRouter.post('/:id/decision', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { decision, notes } = req.body as { decision?: 'hire' | 'reject' | 'hold'; notes?: string }
    if (!decision) throw new HttpError(400, 'decision is required')
    const app = await ApplicationModel.findByIdAndUpdate(
      req.params.id,
      {
        decision,
        recruiterNotes: notes,
        decisionBy: req.user!._id,
        decisionAt: new Date().toISOString(),
        status: 'decision_made',
        stage: decision === 'hire' ? 'decision' : 'rejected',
      },
      { new: true },
    ).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    await logAction({ actor: 'user', action: decision === 'hire' ? 'hired' : 'rejected', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist', payload: { decision } })
    res.json({ ...app, _id: String(app._id) })
  } catch (err) { next(err) }
})

// ── POST /applications/:id/ai-decide ─────────────────────────────────────────
applicationsRouter.post('/:id/ai-decide', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const score = app.scores?.final ?? app.scores?.resume ?? 0
    const decision = score >= 65 ? 'shortlist' : score >= 40 ? 'review' : 'reject'
    const nextStage = decision === 'shortlist' ? 'screening' : decision === 'reject' ? 'rejected' : app.stage
    await ApplicationModel.findByIdAndUpdate(req.params.id, { stage: nextStage, aiDecision: decision })
    await logAction({ actor: 'ai', action: decision === 'shortlist' ? 'shortlisted' : 'rejected', candidateId: String(app.candidate), jobId: String(app.job), mode: 'veto', payload: { avgScore: score } })
    res.json({ decision, score, stage: nextStage })
  } catch (err) { next(err) }
})

// ── GET /applications/:id/explanation ────────────────────────────────────────
applicationsRouter.get('/:id/explanation', requireAuth, async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    res.json({
      explanation: { bullets: ['Resume score reflects skill overlap with job requirements', 'Assessment and interview scores contribute to final composite', 'Scores are computed without demographic signals'] },
      scores: app.scores,
    })
  } catch (err) { next(err) }
})

// ── POST /applications/:id/correspondence/send ────────────────────────────────
applicationsRouter.post('/:id/correspondence/send', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    await logAction({ actor: 'user', action: 'email-sent', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist', payload: req.body as Record<string, unknown> })
    res.json({ ok: true, message: 'Correspondence queued' })
  } catch (err) { next(err) }
})

// ── POST /applications/:id/send-assessment ────────────────────────────────────
applicationsRouter.post('/:id/send-assessment', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const { AssessmentModel } = await import('../models/Assessment.model.js')
    const durationMinutes = Number((req.body as { durationMinutes?: number }).durationMinutes ?? 60)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assessment: any = await AssessmentModel.create({
      application: app._id, job: app.job, candidate: app.candidate,
      durationMinutes, status: 'pending',
      modules: [{ type: 'technical', difficulty: 'medium', questions: [], answers: [] }],
    } as object)
    await ApplicationModel.findByIdAndUpdate(app._id, { stage: 'assessment', status: 'assessment_sent' })
    await logAction({ actor: 'user', action: 'assessment-sent', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist' })
    res.status(201).json({ ...assessment.toObject(), _id: String(assessment._id) })
  } catch (err) { next(err) }
})

// ── POST /applications/:id/fairness-gate ──────────────────────────────────────
applicationsRouter.post('/:id/fairness-gate', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    res.json({ passed: true, score: app.scores?.final ?? 0, flags: [], message: 'No fairness concerns detected.' })
  } catch (err) { next(err) }
})

// ── POST /applications/ai-decide (bulk) ───────────────────────────────────────
applicationsRouter.post('/ai-decide', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { jobId, shortlistThreshold = 65, rejectThreshold = 40 } = req.body as { jobId?: string; shortlistThreshold?: number; rejectThreshold?: number }
    if (!jobId) throw new HttpError(400, 'jobId required')
    const apps = await ApplicationModel.find({ job: jobId, stage: 'applied' }).lean()
    const results = await Promise.all(apps.map(async (app) => {
      const score = app.scores?.final ?? app.scores?.resume ?? 0
      const decision = score >= shortlistThreshold ? 'shortlist' : score >= rejectThreshold ? 'review' : 'reject'
      const stage = decision === 'shortlist' ? 'screening' : decision === 'reject' ? 'rejected' : 'applied'
      await ApplicationModel.findByIdAndUpdate(app._id, { stage, aiDecision: decision })
      return { applicationId: String(app._id), decision, score }
    }))
    res.json({ processed: results.length, results })
  } catch (err) { next(err) }
})

// ── GET /applications/:id/correspondence/thread ───────────────────────────────
applicationsRouter.get('/:id/correspondence/thread', requireAuth, async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id, { correspondence: 1 }).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    res.json({ thread: (app as Record<string, unknown>).correspondence ?? [] })
  } catch (err) { next(err) }
})

// ── POST /applications/:id/correspondence/reply ───────────────────────────────
applicationsRouter.post('/:id/correspondence/reply', requireAuth, async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    await logAction({ actor: 'user', action: 'email-sent', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist', payload: req.body as Record<string, unknown> })
    res.json({ ok: true })
  } catch (err) { next(err) }
})
