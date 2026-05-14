import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import type { Job } from '../domain.js'
import { ApplicationModel } from '../models/Application.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { JobModel } from '../models/Job.model.js'
import { UserModel } from '../models/User.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { CompanyModel } from '../models/Company.model.js'
import { QuestionBankModel } from '../models/QuestionBank.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { logAction } from '../data/store.js'
import { scoreCandidateForJob } from '../lib/candidate-profile.js'
import { notify } from '../lib/notify.js'
import { sendEmail } from '../lib/email.js'
import { computeJobBiasAudit } from '../lib/fairness.js'
import { generateQuestions } from '../lib/questionGen.js'

export const applicationsRouter = Router()

async function getCandidateUser(candidateId: string) {
  const candidate = await CandidateModel.findById(candidateId).lean()
  if (!candidate) return { candidate: null, user: null }
  const user = await UserModel.findById(String(candidate.user), { email: 1, firstName: 1, lastName: 1, companyName: 1, role: 1 }).lean()
  return { candidate, user }
}

async function notifyCandidate(candidateId: string, data: { type: string; title: string; body: string; link?: string }) {
  const { user } = await getCandidateUser(candidateId)
  if (!user?._id) return
  notify(String(user._id), data)
}

async function getRecruitersForApplication(application: { job: string }) {
  const job = await JobModel.findById(String(application.job), { company: 1, createdBy: 1 }).lean()
  if (!job) return []
  const company = await CompanyModel.findById(String(job.company), { name: 1, legalName: 1 }).lean()
  const companyNames = [company?.name, company?.legalName].filter(Boolean)
  return UserModel.find(
    {
      role: { $in: ['recruiter', 'admin', 'super_admin'] },
      $or: [
        { _id: String(job.createdBy) },
        ...(companyNames.length ? [{ companyName: { $in: companyNames } }] : []),
      ],
    },
    { _id: 1, firstName: 1, lastName: 1, email: 1 },
  ).lean()
}

const VALID_MODULE_TYPES = ['aptitude', 'technical', 'situational', 'personality', 'values'] as const

function getModuleQuestionCount(timeLimit?: number) {
  const minutes = Number(timeLimit ?? 20)
  return Math.max(3, Math.min(12, Math.round(minutes / 4)))
}

function normaliseDifficulty(moduleType: typeof VALID_MODULE_TYPES[number]) {
  if (moduleType === 'personality' || moduleType === 'values') return 'easy'
  if (moduleType === 'situational') return 'medium'
  return 'medium'
}

async function buildAssessmentModules(job: Pick<Job, 'company' | 'assessmentModules'>) {
  const company = await CompanyModel.findById(String(job?.company), { name: 1, legalName: 1 }).lean()
  const companyNames = [company?.name, company?.legalName].filter((value): value is string => Boolean(value?.trim()))

  const configuredModules: Array<{ type: string; timeLimit?: number; weight?: number }> = job?.assessmentModules?.length
    ? job.assessmentModules
    : [{ type: 'technical', timeLimit: 20, weight: 1 }]

  return Promise.all(configuredModules.map(async (module) => {
    const moduleType = VALID_MODULE_TYPES.includes(module.type as typeof VALID_MODULE_TYPES[number])
      ? module.type as typeof VALID_MODULE_TYPES[number]
      : 'technical'
    const difficulty = normaliseDifficulty(moduleType)
    const count = getModuleQuestionCount(module.timeLimit)

    const bankItems = await QuestionBankModel.find({
      category: moduleType,
      ...(companyNames.length ? { companyName: { $in: companyNames } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(count)
      .lean()

    const questions = bankItems.length
      ? bankItems.map((item) => ({
          _id: String(item._id),
          text: item.text,
          type: item.type,
          options: item.options,
          correctIndex: item.correctIndex,
          points: item.points,
        }))
      : generateQuestions(moduleType, difficulty, count, moduleType).map((question) => ({
          _id: randomUUID(),
          text: question.text,
          type: question.type,
          options: question.options,
          correctIndex: question.correctIndex,
          points: question.points,
        }))

    return {
      type: moduleType,
      questions,
      answers: [],
    }
  }))
}

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
    notify(String(candidate._id), {
      type: 'application_received',
      title: 'Application received',
      body: `Your application for ${job.title} has been received and is now pending review.`,
      link: '/candidate/applications',
    })
    res.status(201).json({ ...application.toObject(), _id: String(application._id) })
  } catch (err) { next(err) }
})

applicationsRouter.get('/mine', requireAuth, requireRole('candidate', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const candidate = await CandidateModel.findOne({ user: req.user!._id }).lean()
    if (!candidate) return res.json([])
    const apps = await ApplicationModel.find({ candidate: candidate._id })
      .populate('job', 'title department location type status')
      .sort({ createdAt: -1 }).lean()
    const interviews = await InterviewModel.find({ application: { $in: apps.map((app) => String(app._id)) } }, { application: 1, status: 1, scheduledAt: 1 }).lean()
    const interviewMap = Object.fromEntries(interviews.map((item) => [String(item.application), item]))
    res.json(apps.map((app) => ({
      ...app,
      interviewId: interviewMap[String(app._id)]?._id ? String(interviewMap[String(app._id)]._id) : undefined,
      interviewStatus: interviewMap[String(app._id)]?.status,
      interviewScheduledAt: interviewMap[String(app._id)]?.scheduledAt,
    })))
  } catch (err) { next(err) }
})

applicationsRouter.get('/job/:jobId', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1)
    const limit = Math.max(1, Number(req.query.limit ?? 20) || 20)
    const skip = (page - 1) * limit
    const stage = String(req.query.stage ?? '')
    const filter: Record<string, unknown> = { job: req.params.jobId }
    if (stage) filter.stage = stage
    const [apps, total] = await Promise.all([
      ApplicationModel.find(filter)
        .populate({ path: 'candidate', select: 'skills experience headline cvUrl user', populate: { path: 'user', select: 'firstName lastName email' } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ApplicationModel.countDocuments(filter),
    ])
    const interviews = await InterviewModel.find(
      { application: { $in: apps.map((app) => String(app._id)) } },
      { application: 1, status: 1, scheduledAt: 1, collaborationMode: 1 }
    ).lean()
    const interviewMap = Object.fromEntries(interviews.map((item) => [String(item.application), item]))
    const { AssessmentModel } = await import('../models/Assessment.model.js')
    const assessments = await AssessmentModel.find(
      { application: { $in: apps.map((app) => String(app._id)) } },
      { application: 1, status: 1, expiresAt: 1, createdAt: 1 }
    ).sort({ createdAt: -1 }).lean()
    const assessmentMap = new Map<string, (typeof assessments)[number]>()
    for (const assessment of assessments) {
      const key = String(assessment.application)
      if (!assessmentMap.has(key)) assessmentMap.set(key, assessment)
    }
    const enriched = apps.map((app) => ({
      ...app,
      interviewId: interviewMap[String(app._id)]?._id ? String(interviewMap[String(app._id)]._id) : undefined,
      interviewStatus: interviewMap[String(app._id)]?.status,
      interviewScheduledAt: interviewMap[String(app._id)]?.scheduledAt,
      interviewMode: interviewMap[String(app._id)]?.collaborationMode,
      assessmentStatus: assessmentMap.get(String(app._id))?.status ?? app.assessmentStatus,
      assessmentExpiresAt: assessmentMap.get(String(app._id))?.expiresAt ?? app.assessmentExpiresAt,
    }))
    res.json({ data: enriched, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) })
  } catch (err) { next(err) }
})

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

applicationsRouter.post('/:id/shortlist', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findByIdAndUpdate(req.params.id, { status: 'shortlisted', stage: 'screening' }, { new: true }).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    await logAction({ actor: 'user', action: 'shortlisted', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist' })
    await notifyCandidate(String(app.candidate), { type: 'shortlisted', title: 'Application progressed', body: 'A recruiter has started reviewing your application.', link: '/candidate/applications' })
    res.json({ ...app, _id: String(app._id) })
  } catch (err) { next(err) }
})

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
    await notifyCandidate(String(app.candidate), { type: 'fairness_rejected', title: 'Application closed', body: reason?.trim() || 'Your application was not progressed further for this role.', link: `/candidate/explanation/${String(app._id)}` })
    res.json({ ...app, _id: String(app._id) })
  } catch (err) { next(err) }
})

applicationsRouter.post('/:id/decision', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { decision, notes } = req.body as { decision?: 'hire' | 'reject' | 'hold'; notes?: string }
    if (!decision) throw new HttpError(400, 'decision is required')
    const linkedInterview = await InterviewModel.findOne({ application: req.params.id }, { collaborationMode: 1 }).sort({ createdAt: -1 }).lean()
    const mode = linkedInterview?.collaborationMode ?? 'assist'
    const app = await ApplicationModel.findByIdAndUpdate(
      req.params.id,
      {
        decision,
        recruiterNotes: notes,
        decisionBy: req.user!._id,
        decisionAt: new Date().toISOString(),
        status: decision === 'hire' ? 'hired' : decision === 'reject' ? 'rejected' : 'decision_made',
        stage: decision === 'reject' ? 'rejected' : decision === 'hire' ? 'offered' : 'decision',
      },
      { new: true },
    ).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const { user: candidateUser } = await getCandidateUser(String(app.candidate))
    const job = await JobModel.findById(String(app.job), { title: 1 }).lean()
    await logAction({
      actor: 'user',
      action: decision === 'hire' ? 'hired' : decision === 'reject' ? 'rejected' : 'decision-held',
      candidateId: String(app.candidate),
      jobId: String(app.job),
      mode,
      payload: { decision },
    })
    await notifyCandidate(String(app.candidate), {
      type: decision === 'hire' ? 'offer_extended' : 'decision_made',
      title: decision === 'hire' ? 'Offer decision recorded' : decision === 'reject' ? 'Application decision recorded' : 'Application on hold',
      body: decision === 'hire' ? 'Congratulations. A recruiter has marked your application as hired.' : decision === 'reject' ? 'A recruiter has completed review and closed this application.' : 'Your application is on hold while the recruiter completes final review.',
      link: `/candidate/explanation/${String(app._id)}`,
    })
    if (candidateUser?.email) {
      try {
        await sendEmail({
          to: candidateUser.email,
          subject: `[${job?.title ?? 'Your application'}] ${decision === 'hire' ? 'Offer decision' : decision === 'reject' ? 'Application update' : 'Application on hold'}`,
          text: decision === 'hire'
            ? `Hi ${candidateUser.firstName},\n\nWe are pleased to let you know that you have been selected for ${job?.title ?? 'the role'}.\n\nPlease log in to your RekrootAI portal to view the next steps.`
            : decision === 'reject'
              ? `Hi ${candidateUser.firstName},\n\nWe have completed our review for ${job?.title ?? 'this role'} and will not be progressing your application further.\n\nYou can log in to your RekrootAI portal to view the decision explanation and any recruiter notes.`
              : `Hi ${candidateUser.firstName},\n\nYour application for ${job?.title ?? 'this role'} is currently on hold while the recruiter completes final review.\n\nPlease check your RekrootAI portal for updates.`,
        })
      } catch (mailErr) {
        console.error('[decision] Failed to send decision email:', mailErr)
      }
    }
    res.json({ ...app, _id: String(app._id) })
  } catch (err) { next(err) }
})

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

applicationsRouter.post('/:id/undo-veto', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    if (app.aiDecision !== 'shortlist' && app.aiDecision !== 'reject') throw new HttpError(400, 'No veto decision available to undo')

    const reverted = await ApplicationModel.findByIdAndUpdate(
      req.params.id,
      {
        stage: 'applied',
        status: 'pending',
        aiDecision: 'review',
        recruiterNotes: undefined,
      },
      { new: true },
    ).lean()
    if (!reverted) throw new HttpError(404, 'Application not found')

    await logAction({
      actor: 'user',
      action: 'veto-undo',
      candidateId: String(reverted.candidate),
      jobId: String(reverted.job),
      mode: 'veto',
      payload: { previousDecision: app.aiDecision },
    })

    await notifyCandidate(String(reverted.candidate), {
      type: 'decision_made',
      title: 'Application returned to review',
      body: 'A recruiter reopened your application for manual review.',
      link: '/candidate/applications',
    })

    res.json({ ...reverted, _id: String(reverted._id) })
  } catch (err) { next(err) }
})

applicationsRouter.get('/:id/explanation', requireAuth, async (req, res, next) => {
  try {
    const { getSettings } = await import('../lib/settings.js')
    const settings = await getSettings()
    if (!settings.candidateExplain && req.user!.role === 'candidate') {
      return res.json({ explanation: { bullets: ['Detailed score explanations are not available at this time.'] }, scores: {} })
    }
    const app = await ApplicationModel.findById(req.params.id).populate('job', 'title thresholds').lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const s = app.scores ?? {}
    const resume = s.resume ?? 0
    const assessment = s.assessment ?? 0
    const penalty = s.penalty ?? 0
    const interview = s.interview ?? 0
    const final = s.final ?? resume
    const parts: string[] = []
    if (resume > 0) parts.push(`Your CV matched ${resume.toFixed(0)}% of the role's required skills.`)
    if (assessment > 0) parts.push(`Assessment score: ${assessment.toFixed(0)}%.`)
    if (interview > 0) parts.push(`Interview evaluation: ${interview.toFixed(0)}%.`)
    if (penalty > 0) parts.push(`A fairness adjustment of ${penalty.toFixed(0)} points was applied to correct for scoring imbalances.`)
    if (final > 0) parts.push(`Overall composite score: ${final.toFixed(0)}%.`)
    const narrative = parts.length ? parts.join(' ') : 'Your application is still being evaluated.'
    const thread = ((app as Record<string, unknown>).correspondence as Array<Record<string, unknown>> | undefined) ?? []
    const latestRecruiterMessage = thread.filter((entry) => String(entry.senderRole) !== 'candidate').at(-1)

    res.json({
      explanation: { bullets: parts.length ? parts : ['Your application is still being reviewed.'] },
      scores: {
        resumeScore: resume,
        assessmentScore: assessment,
        penaltyApplied: penalty,
        interviewScore: interview,
        finalScore: final,
        weights: { w1: 0.3, w2: 0.3, w3: 0.1, w4: 0.3 },
        explanation: narrative,
        stage: app.stage,
        decision: (app as Record<string, unknown>).decision as string | undefined,
        recruiterNote: ((app as Record<string, unknown>).recruiterNotes as string | undefined) ?? (latestRecruiterMessage?.message as string | undefined),
        shapValues: null,
      },
    })
  } catch (err) { next(err) }
})

applicationsRouter.post('/:id/correspondence/send', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const { subject, message } = req.body as { subject?: string; message?: string }
    if (!subject || !message) throw new HttpError(400, 'subject and message are required')

    const { candidate, user } = await getCandidateUser(String(app.candidate))
    if (!user?.email) throw new HttpError(422, 'Candidate email not found')
    const job = await JobModel.findById(String(app.job), { title: 1 }).lean()

    let deliveryStatus: 'sent' | 'failed' = 'sent'
    try {
      await sendEmail({
        to: user.email,
        subject: `[${job?.title ?? 'Your Application'}] ${subject}`,
        text: `Hi ${user.firstName},\n\n${message}\n\nBest regards,\nRekrootAI Hiring Team`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><p>Hi ${user.firstName},</p><p>${message.replace(/\n/g, '<br/>')}</p><p>Best regards,<br/>RekrootAI Hiring Team</p></div>`,
      })
    } catch (mailErr) {
      deliveryStatus = 'failed'
      console.error('[correspondence] Email send failed:', mailErr)
    }

    const sender = await UserModel.findById(req.user!._id, { firstName: 1, lastName: 1 }).lean()
    await ApplicationModel.findByIdAndUpdate(req.params.id, {
      $push: {
        correspondence: {
          senderRole: req.user!.role,
          senderUserId: req.user!._id,
          senderName: sender ? `${sender.firstName} ${sender.lastName}` : 'Recruiter',
          recipientUserId: candidate ? String(candidate.user) : undefined,
          recipientEmail: user.email,
          channel: 'email',
          subject,
          message,
          deliveryStatus,
          sentAt: new Date().toISOString(),
        },
      },
    })
    await notifyCandidate(String(app.candidate), { type: 'recruiter_feedback', title: 'New message from recruiter', body: subject, link: `/candidate/explanation/${String(app._id)}` })
    await logAction({ actor: 'user', action: 'email-sent', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist', payload: { subject, message } })
    res.json({ ok: deliveryStatus === 'sent', message: deliveryStatus === 'sent' ? 'Correspondence sent' : 'Email failed to send', deliveryStatus })
  } catch (err) { next(err) }
})

applicationsRouter.post('/:id/send-assessment', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const existingAssessment = await (await import('../models/Assessment.model.js')).AssessmentModel.findOne({
      application: String(app._id),
      status: { $in: ['pending', 'in_progress'] },
    }).lean()
    if (existingAssessment) throw new HttpError(409, 'An active assessment already exists for this application')
    const job = await JobModel.findById(String(app.job)).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    const { AssessmentModel } = await import('../models/Assessment.model.js')
    const durationMinutes = Number((req.body as { durationMinutes?: number }).durationMinutes ?? 60)
    const modules = await buildAssessmentModules(job)
    const assessment: any = await AssessmentModel.create({
      application: app._id, job: app.job, candidate: app.candidate, durationMinutes, status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      modules,
    } as object)
    await ApplicationModel.findByIdAndUpdate(app._id, {
      stage: 'assessment',
      status: 'assessment_sent',
      assessmentStatus: 'pending',
      assessmentExpiresAt: assessment.expiresAt,
    })
    await logAction({ actor: 'user', action: 'assessment-sent', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist' })
    await notifyCandidate(String(app.candidate), { type: 'assessment_sent', title: 'Assessment invitation sent', body: 'A recruiter has invited you to complete the next assessment stage.', link: '/candidate/applications' })
    res.status(201).json({ ...assessment.toObject(), _id: String(assessment._id) })
  } catch (err) { next(err) }
})

applicationsRouter.post('/:id/undo-assessment', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const { AssessmentModel } = await import('../models/Assessment.model.js')
    const assessment = await AssessmentModel.findOne({ application: String(app._id) }).sort({ createdAt: -1 })
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    await AssessmentModel.deleteOne({ _id: assessment._id })
    await ApplicationModel.findByIdAndUpdate(app._id, {
      stage: 'screening',
      status: 'shortlisted',
      assessmentExpiresAt: null,
      assessmentStatus: null,
      'scores.assessment': 0,
    })
    await notifyCandidate(String(app.candidate), {
      type: 'assessment_sent',
      title: 'Assessment reset',
      body: 'Your previous assessment has been withdrawn. A recruiter may send you a new one shortly.',
      link: '/candidate/applications',
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

applicationsRouter.post('/:id/fairness-gate', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const job = await JobModel.findById(String(app.job), { thresholds: 1 }).lean()
    const fairnessThreshold = Number(job?.thresholds?.fairness ?? 0.8)

    const flags: string[] = []
    const scores = app.scores ?? {}
    const final = scores.final ?? scores.resume ?? 0
    const penalty = scores.penalty ?? 0
    const resume = scores.resume ?? 0
    const assessment = scores.assessment ?? 0
    const interview = scores.interview ?? 0

    if (penalty > 15) flags.push(`High penalty score (${penalty}) detected - review scoring criteria for bias.`)
    if (resume > 0 && assessment > 0 && Math.abs(resume - assessment) > 40) flags.push(`Score inconsistency: resume ${resume} vs assessment ${assessment} - gap exceeds 40 points.`)
    if (assessment > 0 && interview > 0 && assessment - interview > 30) flags.push(`Interview score (${interview}) significantly lower than assessment (${assessment}) - check for interviewer bias.`)
    if (resume >= 70 && final < 40 && app.stage === 'rejected') flags.push(`Candidate rejected with strong resume score (${resume}) but low final score (${final}) - review rejection rationale.`)

    const peers = await ApplicationModel.find({ job: app.job, _id: { $ne: app._id } }, { scores: 1 }).lean()
    if (peers.length >= 3) {
      const peerFinals = peers.map((p) => p.scores?.final ?? 0).filter((s) => s > 0)
      if (peerFinals.length >= 3) {
        const avg = peerFinals.reduce((a, b) => a + b, 0) / peerFinals.length
        if (final > 0 && final < avg - 25 && app.stage !== 'rejected') flags.push(`Score (${final}) is 25+ points below peer average (${Math.round(avg)}) - verify scoring consistency.`)
      }
    }

    const computation = await computeJobBiasAudit(String(app.job), fairnessThreshold)
    Object.entries(computation.disparateImpact).forEach(([key, ratio]) => {
      if (ratio < fairnessThreshold) {
        flags.push(`${key} parity ratio is ${(ratio * 100).toFixed(0)}%, below the ${(fairnessThreshold * 100).toFixed(0)}% threshold.`)
      }
    })

    const passed = flags.length === 0
    await ApplicationModel.findByIdAndUpdate(req.params.id, { fairnessComputedAt: new Date().toISOString() })
    if (passed) await notifyCandidate(String(app.candidate), { type: 'fairness_passed', title: 'Application review updated', body: 'Your application has passed the AI fairness review stage.', link: '/candidate/applications' })
    res.json({
      passed,
      score: final,
      flags,
      message: passed ? 'No fairness concerns detected.' : `${flags.length} concern(s) flagged - review before making a decision.`,
      breakdown: { resume, assessment, interview, penalty, final },
      disparateImpact: computation.disparateImpact,
      groupBreakdown: computation.details.groups,
      threshold: fairnessThreshold,
    })
  } catch (err) { next(err) }
})

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

applicationsRouter.get('/:id/correspondence/thread', requireAuth, async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id, { correspondence: 1 }).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    res.json({ thread: (app as Record<string, unknown>).correspondence ?? [] })
  } catch (err) { next(err) }
})

applicationsRouter.post('/:id/correspondence/reply', requireAuth, async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const { subject, message } = req.body as { subject?: string; message?: string }
    if (!message?.trim()) throw new HttpError(400, 'message is required')

    const sender = await UserModel.findById(req.user!._id, { firstName: 1, lastName: 1, email: 1 }).lean()
    const { candidate, user: candidateUser } = await getCandidateUser(String(app.candidate))
    const recruiters = await getRecruitersForApplication({ job: String(app.job) })

    let deliveryStatus: 'sent' | 'failed' = 'sent'
    if (req.user!.role !== 'candidate' && candidateUser?.email && subject) {
      try {
        await sendEmail({ to: candidateUser.email, subject, text: message.trim(), html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><p>${message.trim().replace(/\n/g, '<br/>')}</p></div>` })
      } catch (mailErr) {
        deliveryStatus = 'failed'
        console.error('[reply] Email failed:', mailErr)
      }
    }

    await ApplicationModel.findByIdAndUpdate(req.params.id, {
      $push: {
        correspondence: {
          senderRole: req.user!.role,
          senderUserId: req.user!._id,
          senderName: sender ? `${sender.firstName} ${sender.lastName}` : req.user!.role,
          recipientUserId: req.user!.role === 'candidate' ? recruiters[0]?._id ? String(recruiters[0]._id) : undefined : candidate ? String(candidate.user) : undefined,
          recipientEmail: req.user!.role === 'candidate' ? recruiters[0]?.email : candidateUser?.email,
          channel: subject ? 'email' : 'in_app',
          subject,
          message: message.trim(),
          deliveryStatus,
          sentAt: new Date().toISOString(),
        },
      },
    })

    if (req.user!.role === 'candidate') {
      recruiters.forEach((recruiter) => {
        notify(String(recruiter._id), {
          type: 'recruiter_feedback',
          title: 'Candidate reply received',
          body: `${sender?.firstName ?? 'A candidate'} sent a new message about an application.`,
          link: '/recruiter/correspondence',
        })
      })
    } else {
      await notifyCandidate(String(app.candidate), { type: 'recruiter_feedback', title: 'New recruiter reply', body: subject ?? 'You have received a new message about your application.', link: `/candidate/explanation/${String(app._id)}` })
    }

    await logAction({ actor: 'user', action: 'correspondence-reply', candidateId: String(app.candidate), jobId: String(app.job), mode: 'assist', payload: req.body as Record<string, unknown> })
    res.json({ ok: deliveryStatus === 'sent', deliveryStatus })
  } catch (err) { next(err) }
})
