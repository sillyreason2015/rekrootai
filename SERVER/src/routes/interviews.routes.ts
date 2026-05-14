import { Router } from 'express'
import multer from 'multer'
import { InterviewModel } from '../models/Interview.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { InterviewArtifactModel } from '../models/InterviewArtifact.model.js'
import { JobModel } from '../models/Job.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { logAction } from '../data/store.js'
import { notify } from '../lib/notify.js'
import { env } from '../config/env.js'
import { ensureInterviewAccess, mergeTranscriptEntries, reconcileInterviewState, type PersistedTranscriptLine } from '../lib/interview-automation.js'
import { enqueueInterviewAnalysis } from '../lib/interview-analysis-queue.js'
import { presignedDownloadUrl, uploadBlob } from '../lib/blob.js'
import { computeCompositeScore } from '../lib/scoring.js'
import { sendEmail } from '../lib/email.js'
import { UserModel } from '../models/User.model.js'

export const interviewsRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } })

async function notifyCandidate(candidateId: string, data: { type: string; title: string; body: string; link?: string }) {
  const candidate = await CandidateModel.findById(candidateId, { user: 1 }).lean()
  if (!candidate?.user) return
  notify(String(candidate.user), data)
}

async function emailInterviewCandidate(candidateId: string, input: { subject: string; text: string; html?: string }) {
  const candidate = await CandidateModel.findById(candidateId, { user: 1 }).lean()
  if (!candidate?.user) return false
  const user = await UserModel.findById(String(candidate.user), { email: 1 }).lean()
  if (!user?.email) return false
  try {
    await sendEmail({ to: user.email, subject: input.subject, text: input.text, html: input.html })
    return true
  } catch (err) {
    console.error('[interview-email] Failed to send candidate email:', err)
    return false
  }
}

function buildSpeakerSegments(lines: PersistedTranscriptLine[]) {
  const sorted = [...lines].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const segments: Array<{
    speaker: 'candidate' | 'recruiter'
    startedAt: string
    endedAt: string
    text: string
    lineCount: number
  }> = []

  for (const line of sorted) {
    const prev = segments[segments.length - 1]
    if (prev && prev.speaker === line.speaker) {
      prev.endedAt = line.timestamp
      prev.text = `${prev.text} ${line.text}`.trim()
      prev.lineCount += 1
      continue
    }
    segments.push({
      speaker: line.speaker,
      startedAt: line.timestamp,
      endedAt: line.timestamp,
      text: line.text,
      lineCount: 1,
    })
  }
  return segments
}

// ── GET /interviews/mine ──────────────────────────────────────────────────────
interviewsRouter.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const candidate = await CandidateModel.findOne({ user: req.user!._id }).lean()
    const filter = candidate
      ? { $or: [{ candidate: String(candidate._id) }, { recruiter: req.user!._id }] }
      : { recruiter: req.user!._id }
    const interviews = await InterviewModel.find(filter as object)
      .populate('job', 'title department').sort({ scheduledAt: 1 }).lean()
    const reconciled = await Promise.all(interviews.map((item) => reconcileInterviewState(String(item._id))))
    res.json(reconciled.filter(Boolean))
  } catch (err) { next(err) }
})

// ── GET /interviews/:id ───────────────────────────────────────────────────────
interviewsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const base = await ensureInterviewAccess(String(req.params.id), String(req.user!._id), String(req.user!.role))
    if (!base) throw new HttpError(404, 'Interview not found')
    await reconcileInterviewState(String(base._id))
    const interview = await InterviewModel.findById(base._id)
      .populate('job', 'title department').lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    res.json({ ...interview, _id: String(interview._id) })
  } catch (err) { next(err) }
})

// ── POST /interviews — schedule ───────────────────────────────────────────────
interviewsRouter.post('/', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { applicationId, scheduledAt, durationMin, mode } = req.body as {
      applicationId?: string; scheduledAt?: string; durationMin?: number; mode?: 'veto' | 'assist' | 'override'
    }
    const application = applicationId ? await ApplicationModel.findById(applicationId).lean() : null
    if (!application) throw new HttpError(404, 'Application not found')
    if (!['assessment', 'interview'].includes(application.stage)) {
      throw new HttpError(409, 'Interviews can only be scheduled after assessment review')
    }
    const interview = await InterviewModel.create({
      application: application._id,
      job: application.job,
      candidate: application.candidate,
      recruiter: req.user!._id,
      scheduledAt: scheduledAt ?? new Date().toISOString(),
      durationMin: durationMin ?? 45,
      collaborationMode: mode ?? 'assist',
      status: 'scheduled',
      transcript: [],
      rubric: [],
    })
    await ApplicationModel.findByIdAndUpdate(application._id, { stage: 'interview', status: 'interview_scheduled' })
    await logAction({ actor: 'user', action: 'interview-scheduled', candidateId: String(application.candidate), jobId: String(application.job), mode: mode ?? 'assist' })
    await notifyCandidate(String(application.candidate), { type: 'info', title: 'Interview Scheduled', body: `Your interview has been scheduled for ${scheduledAt ?? 'soon'}.`, link: '/candidate/applications' })
    const job = await InterviewModel.populate(interview, { path: 'job', select: 'title' })
    await emailInterviewCandidate(String(application.candidate), {
      subject: `[${(job.job as { title?: string } | undefined)?.title ?? 'Your application'}] Interview scheduled`,
      text: `Your interview has been scheduled for ${scheduledAt ?? 'soon'}.\n\nPlease log in to your AIRS portal to view the details and join at the scheduled time.`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><p>Your interview has been scheduled for <strong>${scheduledAt ?? 'soon'}</strong>.</p><p>Please log in to your AIRS portal to view the details and join at the scheduled time.</p></div>`,
    })
    res.status(201).json({ ...interview.toObject(), _id: String(interview._id) })
  } catch (err) { next(err) }
})

// ── GET /interviews/:id/token ─────────────────────────────────────────────────
interviewsRouter.get('/:id/token', requireAuth, async (req, res, next) => {
  try {
    const interview = await ensureInterviewAccess(String(req.params.id), String(req.user!._id), String(req.user!.role))
    if (!interview) throw new HttpError(404, 'Interview not found')
    const fresh = await reconcileInterviewState(String(interview._id))
    if (fresh?.status === 'cancelled') throw new HttpError(409, 'Interview session has expired')
    const roomName = `room-${String(interview._id)}`
    const wsUrl = env.LIVEKIT_HOST
    let token = roomName

    if (env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET && wsUrl) {
      const { AccessToken } = await import('livekit-server-sdk')
      const participantIdentity = `${req.user!.role}-${req.user!._id}`
      const participantName = req.user!.email ?? participantIdentity
      const accessToken = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity: participantIdentity,
        name: participantName,
        ttl: '2h',
      })
      accessToken.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })
      token = await accessToken.toJwt()
    }

    res.json({ token, roomName, wsUrl })
  } catch (err) { next(err) }
})

interviewsRouter.post('/:id/transcript', requireAuth, async (req, res, next) => {
  try {
    const accessInterview = await ensureInterviewAccess(String(req.params.id), String(req.user!._id), String(req.user!.role))
    if (!accessInterview) throw new HttpError(404, 'Interview not found')
    const current = await InterviewModel.findById(accessInterview._id).lean()
    if (!current) throw new HttpError(404, 'Interview not found')
    const transcript = Array.isArray((req.body as { transcript?: unknown[] }).transcript)
      ? ((req.body as { transcript: Array<{ speaker?: string; text?: string; timestamp?: string }> }).transcript
        .filter((line) => line.text?.trim() && (line.speaker === 'candidate' || line.speaker === 'recruiter'))
        .map((line) => ({
          speaker: line.speaker as 'candidate' | 'recruiter',
          text: String(line.text).trim(),
          timestamp: line.timestamp ?? new Date().toISOString(),
        })))
      : []
    const speakers = [...new Set(transcript.map((line) => line.speaker))]
    let mergedTranscript = Array.isArray(current.transcript) ? [...current.transcript] as PersistedTranscriptLine[] : []
    for (const speaker of speakers) {
      const speakerEntries = transcript.filter((line) => line.speaker === speaker)
      mergedTranscript = mergeTranscriptEntries(mergedTranscript, speakerEntries, speaker)
    }
    const speakerSegments = buildSpeakerSegments(mergedTranscript)
    await Promise.all([
      InterviewModel.findByIdAndUpdate(accessInterview._id, { transcript: mergedTranscript }),
      InterviewArtifactModel.findOneAndUpdate(
        { interview: String(accessInterview._id), kind: 'transcript' },
        {
          $set: {
            application: String(current.application),
            job: String(current.job),
            candidate: String(current.candidate),
            status: 'completed',
            uploadedBy: String(req.user!._id),
            completedAt: new Date().toISOString(),
            metadata: { entryCount: mergedTranscript.length, speakerSegments },
          },
          $setOnInsert: { startedAt: new Date().toISOString() },
        },
        { upsert: true, new: true }
      ),
    ])
    res.json({ ok: true, count: mergedTranscript.length })
  } catch (err) { next(err) }
})

interviewsRouter.post('/:id/proctoring-event', requireAuth, async (req, res, next) => {
  try {
    const interview = await ensureInterviewAccess(String(req.params.id), String(req.user!._id), String(req.user!.role))
    if (!interview) throw new HttpError(404, 'Interview not found')
    const body = req.body as { type?: 'tab_switch' | 'window_blur' | 'camera_off' | 'mic_off' | 'other'; reason?: string }
    const candidate = await CandidateModel.findOne({ user: req.user!._id }, { _id: 1 }).lean()
    const actor = candidate && String(candidate._id) === String(interview.candidate) ? 'candidate' : 'recruiter'
    const event = {
      actor,
      type: body.type ?? 'other',
      reason: String(body.reason ?? 'Proctoring event detected'),
      at: new Date().toISOString(),
    }
    await InterviewModel.findByIdAndUpdate(interview._id, {
      $push: { proctoringEvents: event },
    })
    res.json({ ok: true, event })
  } catch (err) { next(err) }
})

interviewsRouter.post('/:id/artifacts/recording', requireAuth, upload.single('recording'), async (req, res, next) => {
  try {
    const interview = await ensureInterviewAccess(String(req.params.id), String(req.user!._id), String(req.user!.role))
    if (!interview) throw new HttpError(404, 'Interview not found')
    if (!req.file) throw new HttpError(400, 'No recording file uploaded')

    let storageKey: string | undefined
    try {
      storageKey = `interviews/${String(interview._id)}/recordings/${Date.now()}-${req.file.originalname}`
      await uploadBlob(storageKey, req.file.buffer, req.file.mimetype || 'application/octet-stream')
    } catch {
      storageKey = undefined
    }

    const artifact = await InterviewArtifactModel.create({
      interview: String(interview._id),
      application: String(interview.application),
      job: String(interview.job),
      candidate: String(interview.candidate),
      kind: 'recording',
      status: storageKey ? 'uploaded' : 'failed',
      storageKey,
      mimeType: req.file.mimetype || 'application/octet-stream',
      sizeBytes: req.file.size,
      uploadedBy: String(req.user!._id),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      metadata: { originalName: req.file.originalname },
    })

    res.status(storageKey ? 201 : 503).json({ ...artifact.toJSON(), _id: String(artifact._id), uploaded: Boolean(storageKey) })
  } catch (err) { next(err) }
})

// ── POST /interviews/:id/rubric ───────────────────────────────────────────────
interviewsRouter.post('/:id/rubric', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const current = await InterviewModel.findById(req.params.id).lean()
    if (!current) throw new HttpError(404, 'Interview not found')
    if (!['admin', 'super_admin'].includes(req.user!.role) && String(current.recruiter) !== String(req.user!._id)) {
      throw new HttpError(403, 'Forbidden')
    }
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
    const current = await InterviewModel.findById(req.params.id).lean()
    if (!current) throw new HttpError(404, 'Interview not found')
    if (!['admin', 'super_admin'].includes(req.user!.role) && String(current.recruiter) !== String(req.user!._id)) {
      throw new HttpError(403, 'Forbidden')
    }
    if (current.status === 'completed' || current.status === 'cancelled') throw new HttpError(409, 'This interview can no longer be completed')
    const body = req.body as {
      score?: number
      mode?: 'veto' | 'assist' | 'override'
      aiRecommendation?: 'advance' | 'hold' | 'reject'
    }
    const rubric = Array.isArray(current.rubric) ? current.rubric : []
    const rubricScore = rubric.length
      ? Math.round((rubric.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / (rubric.length * 5)) * 100)
      : 0
    const requestedScore = body.score ?? rubricScore
    const score = Math.min(100, Math.max(0, Number(requestedScore ?? 0)))
    const aiRecommendation = body.aiRecommendation ?? current.aiRecommendation
    const interview = await InterviewModel.findByIdAndUpdate(
      req.params.id,
      {
        status: 'completed',
        score,
        collaborationMode: body.mode ?? current.collaborationMode ?? 'assist',
        aiRecommendation,
        aiAnalysisStatus: 'pending',
      },
      { new: true }
    ).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    const application = await ApplicationModel.findById(interview.application, { scores: 1 }).lean()
    const currentScores = application?.scores ?? {}
    const finalScore = computeCompositeScore({
      resume: currentScores.resume,
      assessment: currentScores.assessment,
      penalty: currentScores.penalty,
      interview: score,
    }, 'decision')
    await ApplicationModel.findByIdAndUpdate(interview.application, {
      stage: 'decision', status: 'decision_made', 'scores.interview': score, 'scores.final': finalScore,
    })
    await logAction({
      actor: 'ai',
      action: 'interview-completed',
      candidateId: String(interview.candidate),
      jobId: String(interview.job),
      mode: interview.collaborationMode ?? 'assist',
      payload: { avgScore: score, aiRecommendation: interview.aiRecommendation ?? null },
    })
    await notifyCandidate(String(interview.candidate), {
      type: 'interview_completed',
      title: 'Interview completed',
      body: 'Your interview has been reviewed and your application is now in final decision review.',
      link: '/candidate/applications',
    })
    const job = await JobModel.findById(String(interview.job), { title: 1 }).lean()
    await emailInterviewCandidate(String(interview.candidate), {
      subject: `[${job?.title ?? 'Your application'}] Interview completed`,
      text: `Your interview for ${job?.title ?? 'this role'} has been completed and your application is now in final review.`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><p>Your interview for <strong>${job?.title ?? 'this role'}</strong> has been completed.</p><p>Your application is now in final review.</p></div>`,
    })
    await enqueueInterviewAnalysis(String(interview._id))
    res.json({ ...interview, _id: String(interview._id) })
  } catch (err) { next(err) }
})

// ── GET /interviews/:id/artifacts ─────────────────────────────────────────────
interviewsRouter.get('/:id/artifacts', requireAuth, async (req, res, next) => {
  try {
    const interview = await ensureInterviewAccess(String(req.params.id), String(req.user!._id), String(req.user!.role))
    if (!interview) throw new HttpError(404, 'Interview not found')
    const fresh = await reconcileInterviewState(String(interview._id))
    const activeInterview = fresh ?? interview
    const hasTranscript = Array.isArray(activeInterview.transcript) && activeInterview.transcript.length > 0
    const artifacts = await InterviewArtifactModel.find({ interview: String(activeInterview._id) }).sort({ createdAt: -1 }).lean()
    const serializedArtifacts = await Promise.all(artifacts.map(async (artifact) => ({
      ...artifact,
      _id: String(artifact._id),
      downloadUrl: artifact.storageKey ? await presignedDownloadUrl(artifact.storageKey, 3600).catch(() => null) : null,
    })))
    res.json({
      transcriptUrl: null,
      recordingUrl: serializedArtifacts.find((artifact) => artifact.kind === 'recording')?.downloadUrl ?? null,
      transcript: hasTranscript ? activeInterview.transcript : [],
      rubric: activeInterview.rubric ?? [],
      score: activeInterview.score ?? null,
      aiAnalysis: activeInterview.aiAnalysis ?? null,
      aiAnalysisStatus: activeInterview.aiAnalysisStatus ?? 'idle',
      hasTranscript,
      artifacts: serializedArtifacts,
    })
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

// ── POST /interviews/:id/reschedule ───────────────────────────────────────────
interviewsRouter.post('/:id/reschedule', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const current = await InterviewModel.findById(req.params.id).lean()
    if (!current) throw new HttpError(404, 'Interview not found')
    if (!['admin', 'super_admin'].includes(req.user!.role) && String(current.recruiter) !== String(req.user!._id)) {
      throw new HttpError(403, 'Forbidden')
    }
    const { scheduledAt, durationMin } = req.body as { scheduledAt?: string; durationMin?: number }
    const interview = await InterviewModel.findByIdAndUpdate(
      req.params.id,
      { scheduledAt, durationMin, status: 'scheduled' },
      { new: true }
    ).lean()
    if (!interview) throw new HttpError(404, 'Interview not found')
    await notifyCandidate(String(interview.candidate), { type: 'info', title: 'Interview Rescheduled', body: `Your interview has been rescheduled to ${scheduledAt}.`, link: '/candidate/applications' })
    const job = await JobModel.findById(String(interview.job), { title: 1 }).lean()
    await emailInterviewCandidate(String(interview.candidate), {
      subject: `[${job?.title ?? 'Your application'}] Interview rescheduled`,
      text: `Your interview for ${job?.title ?? 'this role'} has been rescheduled to ${scheduledAt}. Please log in to your AIRS portal to review the updated details.`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><p>Your interview for <strong>${job?.title ?? 'this role'}</strong> has been rescheduled to <strong>${scheduledAt}</strong>.</p><p>Please log in to your AIRS portal to review the updated details.</p></div>`,
    })
    res.json({ ...interview, _id: String(interview._id) })
  } catch (err) { next(err) }
})
