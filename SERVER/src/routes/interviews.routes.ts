import { Router } from 'express'
import { db, getApplicationById, getInterviewById, logAction } from '../data/mockStore.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, nowIso } from '../lib/http.js'

export const interviewsRouter = Router()

interviewsRouter.get('/mine', requireAuth, (req, res) => {
  const interviews = db.interviews.filter((interview) => interview.candidate === req.user?._id || interview.recruiter === req.user?._id)
  res.json(interviews)
})

interviewsRouter.get('/:id', requireAuth, (req, res, next) => {
  try {
    const interview = getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    res.json(interview)
  } catch (error) {
    next(error)
  }
})

interviewsRouter.post('/', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const { applicationId, scheduledAt, durationMin } = req.body as { applicationId?: string; scheduledAt?: string; durationMin?: number }
    const application = applicationId ? getApplicationById(applicationId) : null
    if (!application) throw new HttpError(404, 'Application not found')
    const interview = {
      _id: `interview-${db.interviews.length + 1}`,
      application: application._id,
      job: application.job,
      candidate: application.candidate,
      recruiter: req.user?._id ?? 'mock-recruiter',
      scheduledAt: scheduledAt ?? nowIso(),
      durationMin: durationMin ?? 45,
      roomToken: `room-${db.interviews.length + 1}`,
      transcript: [],
      rubric: [],
      status: 'scheduled' as const,
    }
    db.interviews.unshift(interview)
    application.status = 'interview_scheduled'
    application.stage = 'interview'
    logAction({ actor: 'user', action: 'interview-schedule', candidateId: application.candidate, jobId: application.job, mode: 'assist' })
    res.status(201).json(interview)
  } catch (error) {
    next(error)
  }
})

interviewsRouter.get('/:id/token', requireAuth, (req, res, next) => {
  try {
    const interview = getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    res.json({ token: interview.roomToken ?? `room-${interview._id}`, roomName: interview.roomToken ?? `room-${interview._id}` })
  } catch (error) {
    next(error)
  }
})

interviewsRouter.post('/:id/rubric', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const interview = getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    interview.rubric = req.body.rubric ?? []
    logAction({ actor: 'user', action: 'interview-rubric', candidateId: interview.candidate, jobId: interview.job, mode: 'assist' })
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

interviewsRouter.post('/:id/complete', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const interview = getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    interview.status = 'completed'
    interview.score = Math.round(70 + Math.random() * 20)
    const application = getApplicationById(interview.application)
    if (application) {
      application.status = 'decision_made'
      application.stage = 'decision'
      application.scores.interview = interview.score
    }
    logAction({ actor: 'ai', action: 'interview-complete', candidateId: interview.candidate, jobId: interview.job, mode: 'assist' })
    res.json(interview)
  } catch (error) {
    next(error)
  }
})

interviewsRouter.get('/:id/artifacts', requireAuth, (req, res, next) => {
  try {
    const interview = getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    res.json({
      transcriptUrl: `/artifacts/${interview._id}/transcript`,
      recordingUrl: `/artifacts/${interview._id}/recording`,
    })
  } catch (error) {
    next(error)
  }
})
