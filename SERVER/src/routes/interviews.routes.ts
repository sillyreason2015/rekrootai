import { Router } from 'express'
import { getApplicationById, getInterviewById, logAction } from '../data/store.js'
import { InterviewModel } from '../models/Interview.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, nowIso } from '../lib/http.js'
import { AccessToken } from 'livekit-server-sdk'
import { env } from '../config/env.js'
import { AiOutputModel } from '../models/AiOutput.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { notify } from '../lib/notify.js'
import { UserModel } from '../models/User.model.js'
import { sendEmail } from '../lib/email.js'

export const interviewsRouter = Router()

async function handleInterviewNoShow(interviewId: string) {
  const interview = await InterviewModel.findById(interviewId).lean()
  if (!interview) return null
  if (interview.status === 'completed' || interview.status === 'cancelled') return interview
  const start = new Date(interview.scheduledAt).getTime()
  const end = start + Number(interview.durationMin ?? 45) * 60_000
  if (Date.now() <= end) return interview

  const score = 0
  const updatedInterview = await InterviewModel.findByIdAndUpdate(
    interviewId,
    { status: 'completed', score },
    { new: true },
  ).lean()
  if (!updatedInterview) return null

  const app = await ApplicationModel.findByIdAndUpdate(updatedInterview.application, {
    status: 'decision_made',
    stage: 'decision',
    'scores.interview': score,
  }, { new: true }).lean()

  if (app) {
    const resume = Number(app.scores?.resume ?? 0)
    const assess = Number(app.scores?.assessment ?? 0)
    const penalty = Number(app.scores?.penalty ?? 0)
    const finalScore = (0.3 * resume) + (0.3 * assess) + (0.1 * penalty) + (0.3 * score)
    await ApplicationModel.findByIdAndUpdate(String(app._id), { 'scores.final': finalScore, decision: 'reject', stage: 'rejected', interviewMissed: true })
    await AiOutputModel.create({
      application: String(app._id),
      type: 'explanation',
      input: { stage: 'interview_no_show', score: 0 },
      output: {
        stage: 'rejected',
        explanation: 'The interview window elapsed without candidate attendance. The interview score was recorded as 0 and the application moved to final decision workflow.',
        topFeatures: [{ name: 'interview_attendance', value: -1 }],
      },
      modelVersion: 'interview-no-show-v1',
    })
    const candidate = await CandidateModel.findById(app.candidate).lean()
    if (candidate?.user) {
      const candidateUser = await UserModel.findById(String(candidate.user)).lean()
      notify(String(candidate.user), {
        type: 'interview_missed',
        title: 'Interview missed',
        body: 'You did not join before the interview window ended. The interview score was recorded as 0.',
        link: `/candidate/explanation/${String(app._id)}`,
      })
      if (candidateUser?.email) {
        await sendEmail({
          to: candidateUser.email,
          subject: 'Interview window elapsed',
          text: 'You did not join your scheduled interview before the time window elapsed. The interview score was recorded as 0. Check your dashboard for details.',
        })
      }
    }
  }

  await logAction({
    actor: 'ai',
    action: 'interview-no-show',
    candidateId: String(interview.candidate),
    jobId: String(interview.job),
    mode: 'assist',
    payload: { interviewId, score: 0 },
  })
  return updatedInterview
}

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
    const interview = await handleInterviewNoShow(String(req.params.id)) ?? await getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    const isCandidate = String(interview.candidate) === String(req.user!._id)
    const isRecruiter = String(interview.recruiter) === String(req.user!._id)
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin'
    if (!isCandidate && !isRecruiter && !isAdmin) throw new HttpError(403, 'Forbidden')
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
    if (String(application.stage) !== 'interview') {
      throw new HttpError(400, 'Interview can only be scheduled after assessment and fairness stages are completed')
    }

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

interviewsRouter.post('/:id/reschedule', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { scheduledAt, durationMin, reason } = req.body as { scheduledAt?: string; durationMin?: number; reason?: string }
    if (!scheduledAt) throw new HttpError(400, 'scheduledAt is required')
    const interview = await InterviewModel.findByIdAndUpdate(
      String(req.params.id),
      {
        scheduledAt,
        durationMin: Number(durationMin ?? 45),
        status: 'scheduled',
      },
      { new: true },
    ).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    const candidate = await CandidateModel.findById(interview.candidate).lean()
    if (candidate?.user) {
      const candidateUser = await UserModel.findById(String(candidate.user)).lean()
      notify(String(candidate.user), {
        type: 'interview_rescheduled',
        title: 'Interview rescheduled',
        body: `Your interview has been moved to ${new Date(scheduledAt).toLocaleString()}.`,
        link: '/candidate/applications',
      })
      if (candidateUser?.email) {
        await sendEmail({
          to: candidateUser.email,
          subject: 'Interview rescheduled',
          text: `Your interview has been rescheduled to ${new Date(scheduledAt).toLocaleString()}.${reason ? ` Reason: ${reason}` : ''}`,
        })
      }
    }
    await logAction({
      actor: 'user',
      action: 'interview-reschedule',
      candidateId: String(interview.candidate),
      jobId: String(interview.job),
      mode: 'assist',
      payload: { scheduledAt, durationMin, reason },
    })
    res.json({ ...interview, _id: String(interview._id) })
  } catch (err) {
    next(err)
  }
})

// GET /interviews/:id/token
interviewsRouter.get('/:id/token', requireAuth, async (req, res, next) => {
  try {
    const interview = await handleInterviewNoShow(String(req.params.id)) ?? await getInterviewById(String(req.params.id))
    if (!interview) throw new HttpError(404, 'Interview not found')
    const isCandidate = String(interview.candidate) === String(req.user!._id)
    const isRecruiter = String(interview.recruiter) === String(req.user!._id)
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin'
    if (!isCandidate && !isRecruiter && !isAdmin) throw new HttpError(403, 'Forbidden')
    const app = await getApplicationById(String(interview.application))
    if (!app) throw new HttpError(404, 'Application not found')
    if (Number(interview.score ?? 1) === 0 && String(interview.status) === 'completed') {
      throw new HttpError(410, 'Interview window elapsed. You did not join on time and the score was recorded as 0.')
    }
    if (String(app.stage) !== 'interview' && String(interview.status) !== 'completed') {
      throw new HttpError(400, 'Interview room is only available during interview stage')
    }
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
    const existing = await InterviewModel.findById(String(req.params.id)).lean()
    if (!existing) throw new HttpError(404, 'Interview not found')
    const rubric = Array.isArray(existing.rubric) ? existing.rubric : []
    const numericScores = rubric
      .map((item) => Number((item as { score?: number }).score))
      .filter((n) => Number.isFinite(n) && n >= 0)
    const score = numericScores.length
      ? Math.round(numericScores.reduce((sum, n) => sum + n, 0) / numericScores.length)
      : 0

    const interview = await InterviewModel.findByIdAndUpdate(
      String(req.params.id),
      { status: 'completed', score },
      { new: true },
    ).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')

    const app = await ApplicationModel.findByIdAndUpdate(interview.application, {
      status: 'decision_made',
      stage: 'decision',
      'scores.interview': score,
    }, { new: true }).lean()

    if (app) {
      const resume = Number(app.scores?.resume ?? 0)
      const assess = Number(app.scores?.assessment ?? 0)
      const penalty = Number(app.scores?.penalty ?? 0)
      const interviewScore = Number(score)
      const finalScore = (0.3 * resume) + (0.3 * assess) + (0.1 * penalty) + (0.3 * interviewScore)

      await ApplicationModel.findByIdAndUpdate(String(app._id), { 'scores.final': finalScore })
      await AiOutputModel.create({
        application: String(app._id),
        type: 'explanation',
        input: { stage: 'interview_complete', scores: { resume, assess, penalty, interviewScore, finalScore } },
        output: {
          stage: 'decision',
          explanation: `Interview completed with score ${interviewScore}%. Your current composite score is ${finalScore.toFixed(1)}%. The recruiter will now make a final decision with full AI and human review context.`,
          topFeatures: [
            { name: 'interview_score', value: +(interviewScore / 100).toFixed(2) },
            { name: 'assessment_score', value: +(assess / 100).toFixed(2) },
            { name: 'resume_score', value: +(resume / 100).toFixed(2) },
          ],
        },
        modelVersion: 'interview-summary-v1',
      })

      const candidate = await CandidateModel.findById(app.candidate).lean()
      if (candidate?.user) {
        notify(String(candidate.user), {
          type: 'interview_completed',
          title: 'Interview completed — AI summary ready',
          body: `Your interview has been scored at ${interviewScore}%. You can now view your updated AI explanation while recruiter final review is in progress.`,
          link: `/candidate/explanation/${String(app._id)}`,
        })
      }

      notify(String(interview.recruiter), {
        type: 'interview_scored',
        title: 'Interview scoring completed',
        body: `Candidate interview scored ${interviewScore}%. Proceed to final decision with updated AI explanation.`,
        link: '/recruiter/final-selection',
      })
    }

    await logAction({ actor: 'ai', action: 'interview-complete', candidateId: String(interview.candidate), jobId: String(interview.job), mode: 'assist' })
    res.json({ ...interview, _id: String(interview._id) })
  } catch (err) {
    next(err)
  }
})

// POST /interviews/:id/missed-recovery-request — candidate requests a reschedule after missing
interviewsRouter.post('/:id/missed-recovery-request', requireAuth, requireRole('candidate'), async (req, res, next) => {
  try {
    const { reason, proposedAt } = req.body as { reason?: string; proposedAt?: string }
    if (!reason?.trim()) throw new HttpError(400, 'reason is required')

    const interview = await InterviewModel.findById(String(req.params.id)).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')

    const app = await ApplicationModel.findById(String(interview.application)).lean()
    if (!app) throw new HttpError(404, 'Application not found')

    // Store the recovery request on the application
    await ApplicationModel.findByIdAndUpdate(String(app._id), {
      'missedInterviewRecovery.requestedAt': new Date().toISOString(),
      'missedInterviewRecovery.reason': reason.trim(),
      'missedInterviewRecovery.proposedAt': proposedAt ?? null,
      'missedInterviewRecovery.status': 'pending',
    })

    await logAction({
      actor: 'user',
      action: 'missed-interview-recovery-requested',
      candidateId: String(app.candidate),
      jobId: String(app.job),
      mode: 'assist',
      payload: { reason: reason.trim() },
    })

    res.json({ ok: true, message: 'Recovery request submitted. The recruiter will review your request.' })
  } catch (err) { next(err) }
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
