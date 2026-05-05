import { Router } from 'express'
import { InterviewModel } from '../models/Interview.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { logAction } from '../data/store.js'
import { notify } from '../lib/notify.js'

export const interviewsRouter = Router()

// ── GET /interviews/mine ──────────────────────────────────────────────────────
interviewsRouter.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const candidate = await CandidateModel.findOne({ user: req.user!._id }).lean()
    const filter = candidate
      ? { $or: [{ candidate: String(candidate._id) }, { recruiter: req.user!._id }] }
      : { recruiter: req.user!._id }
    const interviews = await InterviewModel.find(filter as object)
      .populate('job', 'title department').sort({ scheduledAt: 1 }).lean()
    res.json(interviews)
  } catch (err) { next(err) }
})

// ── GET /interviews/:id ───────────────────────────────────────────────────────
interviewsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const interview = await InterviewModel.findById(req.params.id)
      .populate('job', 'title department').lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    res.json({ ...interview, _id: String(interview._id) })
  } catch (err) { next(err) }
})

// ── POST /interviews — schedule ───────────────────────────────────────────────
interviewsRouter.post('/', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { applicationId, scheduledAt, durationMin } = req.body as { applicationId?: string; scheduledAt?: string; durationMin?: number }
    const application = applicationId ? await ApplicationModel.findById(applicationId).lean() : null
    if (!application) throw new HttpError(404, 'Application not found')
    const interview = await InterviewModel.create({
      application: application._id,
      job: application.job,
      candidate: application.candidate,
      recruiter: req.user!._id,
      scheduledAt: scheduledAt ?? new Date().toISOString(),
      durationMin: durationMin ?? 45,
      status: 'scheduled',
      transcript: [],
      rubric: [],
    })
    await ApplicationModel.findByIdAndUpdate(application._id, { stage: 'interview', status: 'interview_scheduled' })
    await logAction({ actor: 'user', action: 'interview-scheduled', candidateId: String(application.candidate), jobId: String(application.job), mode: 'assist' })
    notify(String(application.candidate), { type: 'info', title: 'Interview Scheduled', body: `Your interview has been scheduled for ${scheduledAt ?? 'soon'}.` })
    res.status(201).json({ ...interview.toObject(), _id: String(interview._id) })
  } catch (err) { next(err) }
})

// ── GET /interviews/:id/token ─────────────────────────────────────────────────
interviewsRouter.get('/:id/token', requireAuth, async (req, res, next) => {
  try {
    const interview = await InterviewModel.findById(req.params.id).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    const roomName = `room-${String(interview._id)}`
    res.json({ token: roomName, roomName })
  } catch (err) { next(err) }
})

// ── POST /interviews/:id/rubric ───────────────────────────────────────────────
interviewsRouter.post('/:id/rubric', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const interview = await InterviewModel.findByIdAndUpdate(
      req.params.id, { rubric: req.body.rubric ?? [] }, { new: true }
    ).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── POST /interviews/:id/complete ─────────────────────────────────────────────
interviewsRouter.post('/:id/complete', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const body = req.body as { score?: number }
    if (body.score === undefined) throw new HttpError(400, 'score is required to complete an interview')
    const score = Math.min(100, Math.max(0, Number(body.score)))
    const interview = await InterviewModel.findByIdAndUpdate(
      req.params.id, { status: 'completed', score }, { new: true }
    ).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    await ApplicationModel.findByIdAndUpdate(interview.application, {
      stage: 'decision', status: 'decision_made', 'scores.interview': score,
    })
    await logAction({ actor: 'ai', action: 'interview-completed', candidateId: String(interview.candidate), jobId: String(interview.job), mode: 'assist', payload: { avgScore: score } })
    res.json({ ...interview, _id: String(interview._id) })
  } catch (err) { next(err) }
})

// ── GET /interviews/:id/artifacts ─────────────────────────────────────────────
interviewsRouter.get('/:id/artifacts', requireAuth, async (req, res, next) => {
  try {
    const interview = await InterviewModel.findById(req.params.id).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    res.json({ transcriptUrl: null, recordingUrl: null })
  } catch (err) { next(err) }
})

// ── POST /interviews/:id/missed-recovery-request ──────────────────────────────
interviewsRouter.post('/:id/missed-recovery-request', requireAuth, requireRole('candidate', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { reason, proposedAt } = req.body as { reason?: string; proposedAt?: string }
    const interview = await InterviewModel.findById(req.params.id).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    await ApplicationModel.findByIdAndUpdate(interview.application, {
      interviewMissed: true,
      'missedInterviewRecovery.status': 'pending',
      'missedInterviewRecovery.reason': reason,
      'missedInterviewRecovery.proposedAt': proposedAt,
      'missedInterviewRecovery.requestedAt': new Date().toISOString(),
    })
    await logAction({ actor: 'user', action: 'missed-interview-recovery-requested', candidateId: String(interview.candidate), jobId: String(interview.job), mode: 'assist' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})
