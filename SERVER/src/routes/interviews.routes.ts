import { Router } from 'express'
import { getApplicationById, getInterviewById, logAction } from '../data/store.js'
import { InterviewModel } from '../models/Interview.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, nowIso } from '../lib/http.js'
import { AccessToken } from 'livekit-server-sdk'
import { env } from '../config/env.js'

export const interviewsRouter = Router()

// GET /interviews/mine
interviewsRouter.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const interviews = await InterviewModel.find({
      $or: [{ candidate: req.user!._id }, { recruiter: req.user!._id }],
    }).lean()
    res.json(interviews.map((i) => ({ ...i, _id: String(i._id) })))
  } catch (err) {
    next(err)
  }
})

// GET /interviews/:id
interviewsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const interview = await getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    res.json({ ...interview, _id: String(interview._id) })
  } catch (err) {
    next(err)
  }
})

// POST /interviews
interviewsRouter.post('/', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { applicationId, scheduledAt, durationMin } = req.body as {
      applicationId?: string
      scheduledAt?: string
      durationMin?: number
    }
    const application = applicationId ? await getApplicationById(applicationId) : null
    if (!application) throw new HttpError(404, 'Application not found')

    const interview = await InterviewModel.create({
      application: String(application._id),
      job: application.job,
      candidate: application.candidate,
      recruiter: req.user!._id,
      scheduledAt: scheduledAt ?? nowIso(),
      durationMin: durationMin ?? 45,
      roomToken: `room-${Date.now()}`,
      transcript: [],
      rubric: [],
      status: 'scheduled',
    })

    // Update application stage
    await ApplicationModel.findByIdAndUpdate(application._id, {
      status: 'interview_scheduled',
      stage: 'interview',
    })

    await logAction({ actor: 'user', action: 'interview-schedule', candidateId: String(application.candidate), jobId: String(application.job), mode: 'assist' })
    res.status(201).json({ ...interview.toJSON(), _id: String(interview._id) })
  } catch (err) {
    next(err)
  }
})

// GET /interviews/:id/token
interviewsRouter.get('/:id/token', requireAuth, async (req, res, next) => {
  try {
    const interview = await getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    const roomName = interview.roomToken ?? `room-${interview._id}`

    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new HttpError(500, 'LiveKit credentials are not configured')
    }

    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: req.user!._id,
      name: req.user!.email,
      ttl: '15m',
    })
    at.addGrant({ roomJoin: true, room: roomName })
    const token = await at.toJwt()

    res.json({ token, roomName, wsUrl: env.LIVEKIT_HOST ?? null })
  } catch (err) {
    next(err)
  }
})

// POST /interviews/:id/rubric
interviewsRouter.post('/:id/rubric', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const interview = await InterviewModel.findByIdAndUpdate(
      String(req.params.id),
      { rubric: req.body.rubric ?? [] },
      { new: true },
    ).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    await logAction({ actor: 'user', action: 'interview-rubric', candidateId: String(interview.candidate), jobId: String(interview.job), mode: 'assist' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /interviews/:id/complete
interviewsRouter.post('/:id/complete', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const score = Math.round(70 + Math.random() * 20)
    const interview = await InterviewModel.findByIdAndUpdate(
      String(req.params.id),
      { status: 'completed', score },
      { new: true },
    ).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')

    await ApplicationModel.findByIdAndUpdate(interview.application, {
      status: 'decision_made',
      stage: 'decision',
      'scores.interview': score,
    })

    await logAction({ actor: 'ai', action: 'interview-complete', candidateId: String(interview.candidate), jobId: String(interview.job), mode: 'assist' })
    res.json({ ...interview, _id: String(interview._id) })
  } catch (err) {
    next(err)
  }
})

// GET /interviews/:id/artifacts
interviewsRouter.get('/:id/artifacts', requireAuth, async (req, res, next) => {
  try {
    const interview = await getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    res.json({
      transcriptUrl: `/artifacts/${interview._id}/transcript`,
      recordingUrl: `/artifacts/${interview._id}/recording`,
    })
  } catch (err) {
    next(err)
  }
})
