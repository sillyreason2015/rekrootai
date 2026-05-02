import { Router } from 'express'
import { getCandidateByUserId, getJobById, getApplicationById, logAction, ensureAssessment } from '../data/store.js'
import { ApplicationModel } from '../models/Application.model.js'
import { JobModel } from '../models/Job.model.js'
import { ProtectedAttributeModel } from '../models/ProtectedAttribute.model.js'
import { AiOutputModel } from '../models/AiOutput.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, nowIso, paginate } from '../lib/http.js'
import { runFairnessGate, runShapExplain } from '../lib/ml.js'
import { sendEmail } from '../lib/email.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { UserModel } from '../models/User.model.js'
import { AssessmentModel } from '../models/Assessment.model.js'
import { notify } from '../lib/notify.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { InterviewModel } from '../models/Interview.model.js'

function buildNarrative(s: {
  resumeScore: number; assessmentScore: number; penaltyApplied: number
  interviewScore: number; finalScore: number; decision?: string; stage?: string
}): string {
  const parts: string[] = []
  const { resumeScore, assessmentScore, penaltyApplied, interviewScore, finalScore, decision, stage } = s

  // Overall verdict
  if (finalScore >= 80) parts.push(`Your application scored strongly overall at ${finalScore.toFixed(1)}%, placing you in the top tier of candidates reviewed for this role.`)
  else if (finalScore >= 60) parts.push(`Your application achieved a score of ${finalScore.toFixed(1)}%, indicating solid performance across the evaluation pipeline.`)
  else if (finalScore >= 40) parts.push(`Your application was evaluated and received a score of ${finalScore.toFixed(1)}%, reflecting a mixed performance across assessment stages.`)
  else if (finalScore > 0) parts.push(`Your application received a score of ${finalScore.toFixed(1)}% following the full evaluation pipeline.`)
  else parts.push(`Your application is currently in the ${stage ?? 'review'} stage. A full score breakdown will be available once all evaluation stages are completed.`)

  // Resume
  if (resumeScore > 0) {
    if (resumeScore >= 75) parts.push(`Your CV demonstrated strong alignment with the job requirements, achieving a resume match score of ${resumeScore.toFixed(1)}%.`)
    else if (resumeScore >= 50) parts.push(`Your CV showed reasonable relevance to the role with a resume score of ${resumeScore.toFixed(1)}%. Strengthening keyword alignment to the job description in future applications could improve this.`)
    else parts.push(`Your CV scored ${resumeScore.toFixed(1)}% for relevance — this typically indicates limited alignment between your documented experience and the specific requirements of this role.`)
  }

  // Assessment
  if (assessmentScore > 0) {
    if (assessmentScore >= 80) parts.push(`You performed excellently in the structured assessment, scoring ${assessmentScore.toFixed(1)}% — a result that indicates strong technical and cognitive capability.`)
    else if (assessmentScore >= 60) parts.push(`Your assessment score of ${assessmentScore.toFixed(1)}% reflects competent performance, though further preparation in core technical areas could strengthen future results.`)
    else parts.push(`The assessment stage returned a score of ${assessmentScore.toFixed(1)}%. Focused practice in the competency areas assessed would be recommended before reapplying.`)
  }

  // Interview
  if (interviewScore > 0) {
    if (interviewScore >= 75) parts.push(`The structured interview evaluation returned a score of ${interviewScore.toFixed(1)}%, reflecting strong communication and role-fit responses.`)
    else if (interviewScore >= 50) parts.push(`Your interview score of ${interviewScore.toFixed(1)}% indicates adequate performance. Providing more specific, evidence-based responses using the STAR framework may improve this in future interviews.`)
    else parts.push(`The interview component scored ${interviewScore.toFixed(1)}%, suggesting responses may have lacked sufficient detail or role-specific evidence.`)
  }

  // Fairness penalty
  if (penaltyApplied > 0) parts.push(`The AI fairness gate detected a minor scoring adjustment of ${penaltyApplied.toFixed(1)}% to ensure equitable evaluation across all candidate groups. This is applied systematically and does not reflect negatively on any individual candidate.`)

  // Decision
  if (decision === 'hire') parts.push('The recruiter has reviewed this evaluation and made a positive hiring decision. Congratulations.')
  else if (decision === 'reject') parts.push('After reviewing the full evaluation, the recruiter has determined that another candidate was a stronger fit for this particular role. This is not a reflection on your broader potential.')
  else if (decision === 'hold') parts.push('The recruiter has placed this application on hold while reviewing the full candidate pool. No final decision has been made.')

  return parts.join(' ')
}

function buildStageSpecificNarrative(s: {
  stage?: string
  resumeScore: number
  assessmentScore: number
  penaltyApplied: number
  interviewScore: number
  finalScore: number
  decision?: string
}): string {
  const { stage } = s
  if (stage === 'applied' || stage === 'screening') {
    if (s.resumeScore > 0) return `Your CV relevance score is ${s.resumeScore.toFixed(1)}%. The recruiter and AI screening stage use this to determine progression to assessment.`
    return 'Your application has been received and is currently in screening. CV scoring will appear as soon as evaluation is completed.'
  }
  if (stage === 'assessment') {
    if (s.assessmentScore > 0) return `Your assessment score is ${s.assessmentScore.toFixed(1)}%. This is compared against the job threshold before fairness review and interview progression.`
    return 'Assessment stage is active. Complete all modules to generate your score and explanation.'
  }
  if (stage === 'interview') {
    if (s.interviewScore > 0) return `Your interview score is ${s.interviewScore.toFixed(1)}%. Recruiter rubric and AI summary are combined before final decision.`
    return 'Interview stage is active. Interview scoring and explanation will appear after recruiter completion.'
  }
  if (stage === 'rejected' && s.interviewScore === 0) {
    return 'Your application was closed because the interview window elapsed without attendance. The interview score was recorded as 0 and the process ended automatically.'
  }
  return buildNarrative(s)
}

function isWeakGenericExplanation(text?: string): boolean {
  if (!text) return true
  const t = text.trim().toLowerCase()
  if (!t) return true
  return (
    t.includes('top factors generated by shap') ||
    t.includes('treeexplainer on the xgboost model') ||
    t === 'explanation pending' ||
    t === 'pending'
  )
}

export const applicationsRouter = Router()

applicationsRouter.get('/:id/correspondence/thread', requireAuth, async (req, res, next) => {
  try {
    const application = await getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    const entries = await AuditLogModel.find({
      action: { $in: ['correspondence-send', 'correspondence-reply'] },
      candidateId: String(application.candidate),
      jobId: String(application.job),
    }).sort({ timestamp: 1 }).lean()
    res.json(entries.map((e) => ({
      _id: String(e._id),
      action: e.action,
      actor: e.actor,
      message: (e.payload as { message?: string })?.message ?? '',
      subject: (e.payload as { subject?: string })?.subject ?? '',
      timestamp: (e as { timestamp?: string; createdAt?: string }).timestamp ?? (e as { createdAt?: string }).createdAt,
    })))
  } catch (err) { next(err) }
})

// POST /applications
applicationsRouter.post('/', requireAuth, requireRole('candidate', 'admin'), async (req, res, next) => {
  try {
    const { jobId, applicationAnswers } = req.body as {
      jobId?: string
      applicationAnswers?: Array<{ question?: string; answer?: string }>
    }
    const [candidate, job] = await Promise.all([
      getCandidateByUserId(req.user!._id),
      jobId ? getJobById(jobId) : null,
    ])
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    if (!job) throw new HttpError(404, 'Job not found')

    // Prevent duplicate applications
    const existing = await ApplicationModel.findOne({ job: String(job._id), candidate: String(candidate._id) }).lean()
    if (existing) throw new HttpError(409, 'Already applied to this job')

    const requiresQuestions = Boolean((job as { requiresQuestionnaire?: boolean }).requiresQuestionnaire)
    const expectedQuestions = Array.isArray((job as { applicationQuestions?: Array<{ question?: string; required?: boolean }> }).applicationQuestions)
      ? ((job as { applicationQuestions?: Array<{ question?: string; required?: boolean }> }).applicationQuestions ?? [])
      : []
    const safeAnswers = Array.isArray(applicationAnswers)
      ? applicationAnswers
          .map((a) => ({
            question: String(a.question ?? '').trim(),
            answer: String(a.answer ?? '').trim(),
          }))
          .filter((a) => a.question && a.answer)
      : []
    if (requiresQuestions) {
      const requiredQuestions = expectedQuestions.filter((q) => q.required !== false)
      const answeredSet = new Set(safeAnswers.map((a) => a.question.toLowerCase()))
      const missing = requiredQuestions.filter((q) => !answeredSet.has(String(q.question ?? '').trim().toLowerCase()))
      if (missing.length) {
        throw new HttpError(400, 'Please answer all required application questions before submitting.')
      }
    }

    const application = await ApplicationModel.create({
      job: String(job._id),
      candidate: String(candidate._id),
      status: 'pending',
      scores: { resume: 0, assessment: 0, penalty: 0, interview: 0, final: 0 },
      stage: 'applied',
      applicationAnswers: safeAnswers,
    })

    // Auto-create assessment record
    await ensureAssessment(String(application._id), String(job._id))

    await logAction({ actor: 'user', action: 'application-create', candidateId: String(candidate._id), jobId: String(job._id), mode: 'assist' })
    // Notify recruiter of new application
    if (job.createdBy) {
      notify(String(job.createdBy), {
        type: 'application_received',
        title: 'New application received',
        body: `A candidate has applied to "${job.title}".`,
        link: `/recruiter/shortlist?job=${String(job._id)}`,
      })
    }
    res.status(201).json({ ...application.toJSON(), _id: String(application._id) })
  } catch (err) {
    next(err)
  }
})

// GET /applications/mine
applicationsRouter.get('/mine', requireAuth, requireRole('candidate', 'admin'), async (req, res, next) => {
  try {
    const candidate = await getCandidateByUserId(req.user!._id)
    const applications = candidate
      ? await ApplicationModel.find({ candidate: String(candidate._id) }).lean()
      : []
    // Manually populate job (stored as string ref)
    const jobIds = [...new Set(applications.map((a) => a.job))]
    const jobs = await JobModel.find({ _id: { $in: jobIds } }).lean()
    const jobMap = Object.fromEntries(jobs.map((j) => [String(j._id), { ...j, _id: String(j._id) }]))
    // Enforce interview no-show as automatic fail before returning dashboard/application data
    const appIds = applications.map((a) => String(a._id))
    const interviews = await InterviewModel.find({ application: { $in: appIds } })
    for (const iv of interviews) {
      if (iv.status === 'completed' || iv.status === 'cancelled') continue
      const start = new Date(iv.scheduledAt).getTime()
      const end = start + Number(iv.durationMin ?? 45) * 60_000
      if (Date.now() > end) {
        iv.status = 'completed'
        iv.score = 0
        await iv.save()
        await ApplicationModel.findByIdAndUpdate(String(iv.application), {
          stage: 'rejected',
          status: 'rejected',
          decision: 'reject',
          decisionAt: nowIso(),
          decisionBy: 'ai',
          'scores.interview': 0,
        })
      }
    }
    const interviewsFresh = await InterviewModel.find({ application: { $in: appIds } }).lean()
    const interviewMap = Object.fromEntries(interviewsFresh.map((i) => [String(i.application), { id: String(i._id), status: i.status, scheduledAt: i.scheduledAt }]))
    const assessments = await AssessmentModel.find({ application: { $in: appIds } }).lean()
    const assessmentMap = Object.fromEntries(
      assessments.map((as) => [String(as.application), { expiresAt: as.expiresAt, status: as.status }]),
    )
    const aiOutputs = await AiOutputModel.find({
      application: { $in: appIds },
      type: { $in: ['bias_audit', 'explanation'] },
    }).sort({ createdAt: -1 }).lean()
    const aiMap = aiOutputs.reduce<Record<string, { fairnessAt?: string; explanationAt?: string }>>((acc, item) => {
      const key = String(item.application)
      const current = acc[key] ?? {}
      const createdAt = String((item as { createdAt?: string }).createdAt ?? '')
      if (item.type === 'bias_audit' && !current.fairnessAt) current.fairnessAt = createdAt
      if (item.type === 'explanation' && !current.explanationAt) current.explanationAt = createdAt
      acc[key] = current
      return acc
    }, {})
    res.json(applications.map((a) => ({
      ...a,
      _id: String(a._id),
      job: jobMap[a.job] ?? a.job,
      interviewId: interviewMap[String(a._id)]?.id,
      interviewStatus: interviewMap[String(a._id)]?.status,
      interviewScheduledAt: interviewMap[String(a._id)]?.scheduledAt,
      assessmentExpiresAt: assessmentMap[String(a._id)]?.expiresAt,
      assessmentStatus: assessmentMap[String(a._id)]?.status,
      fairnessComputedAt: aiMap[String(a._id)]?.fairnessAt,
      explanationComputedAt: aiMap[String(a._id)]?.explanationAt,
    })))
  } catch (err) {
    next(err)
  }
})

// GET /applications/:id
applicationsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const application = await getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    res.json({ ...application, _id: String(application._id) })
  } catch (err) {
    next(err)
  }
})

// GET /applications/job/:jobId
applicationsRouter.get('/job/:jobId', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 10)
    const stage = String(req.query.stage ?? '')

    const filter: Record<string, unknown> = { job: String(req.params.jobId) }
    if (stage) filter.stage = stage

    const applications = await ApplicationModel.find(filter).sort({ createdAt: -1 }).lean()
    const appIds = applications.map((a) => String(a._id))

    // Populate candidate → user for name display
    const candidateIds = [...new Set(applications.map((a) => a.candidate))]
    const candidates = await CandidateModel.find({ _id: { $in: candidateIds } }).lean()
    const userIds = candidates.map((c) => String(c.user)).filter(Boolean)
    const users = await UserModel.find({ _id: { $in: userIds } }, { password: 0 }).lean()
    const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]))
    const candidateMap = Object.fromEntries(candidates.map((c) => [
      String(c._id),
      {
        _id: String(c._id),
        user: userMap[String(c.user)]
          ? {
              _id: String(userMap[String(c.user)]._id),
              firstName: (userMap[String(c.user)] as { firstName: string }).firstName,
              lastName: (userMap[String(c.user)] as { lastName: string }).lastName,
              email: (userMap[String(c.user)] as { email: string }).email,
            }
          : c.user,
      },
    ]))

    const assessments = await AssessmentModel.find({ application: { $in: appIds } }).lean()
    const assessmentMap = Object.fromEntries(
      assessments.map((as) => [String(as.application), { expiresAt: as.expiresAt, status: as.status }]),
    )
    const aiOutputs = await AiOutputModel.find({
      application: { $in: appIds },
      type: { $in: ['bias_audit', 'explanation'] },
    }).sort({ createdAt: -1 }).lean()
    const aiMap = aiOutputs.reduce<Record<string, { fairnessAt?: string; explanationAt?: string }>>((acc, item) => {
      const key = String(item.application)
      const current = acc[key] ?? {}
      const createdAt = String((item as { createdAt?: string }).createdAt ?? '')
      if (item.type === 'bias_audit' && !current.fairnessAt) current.fairnessAt = createdAt
      if (item.type === 'explanation' && !current.explanationAt) current.explanationAt = createdAt
      acc[key] = current
      return acc
    }, {})

    // Attach interview IDs
    const { InterviewModel } = await import('../models/Interview.model.js')
    const interviews = await InterviewModel.find({ application: { $in: appIds } }).lean()
    const interviewMap = Object.fromEntries(interviews.map((i) => [String(i.application), { _id: String(i._id), status: i.status, scheduledAt: i.scheduledAt }]))

    res.json(
      paginate(
        applications.map((a) => ({
          ...a,
          _id: String(a._id),
          candidate: candidateMap[String(a.candidate)] ?? a.candidate,
          assessmentExpiresAt: assessmentMap[String(a._id)]?.expiresAt,
          assessmentStatus: assessmentMap[String(a._id)]?.status,
          fairnessComputedAt: aiMap[String(a._id)]?.fairnessAt,
          explanationComputedAt: aiMap[String(a._id)]?.explanationAt,
          interviewId: interviewMap[String(a._id)]?._id,
          interviewStatus: interviewMap[String(a._id)]?.status,
          interviewScheduledAt: interviewMap[String(a._id)]?.scheduledAt,
          aiRecommendation:
            a.stage === 'applied'
              ? ((a.scores?.resume ?? 0) >= 65 ? 'shortlist' : (a.scores?.resume ?? 0) > 0 ? 'review' : 'review')
              : a.stage === 'assessment'
                ? ((a.scores?.assessment ?? 0) >= 60 ? 'run_fairness' : 'reject')
                : a.stage === 'interview'
                  ? 'decide'
                  : 'review',
        })),
        page,
        limit,
      ),
    )
  } catch (err) {
    next(err)
  }
})

// POST /applications/:id/shortlist
applicationsRouter.post('/:id/shortlist', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const application = await ApplicationModel.findByIdAndUpdate(
      String(req.params.id),
      { status: 'shortlisted', stage: 'screening' },
      { new: true },
    ).lean()
    if (!application) throw new HttpError(404, 'Application not found')
    await logAction({ actor: 'user', action: 'application-shortlist', candidateId: application.candidate, jobId: application.job, mode: 'assist' })
    // Notify candidate
    const cand = await CandidateModel.findById(application.candidate).lean()
    if (cand?.user) {
      notify(String(cand.user), {
        type: 'shortlisted',
        title: 'You\'ve been shortlisted! 🎉',
        body: 'Great news — you\'ve been shortlisted for a role. Check your applications for details.',
        link: '/candidate/applications',
      })
    }
    res.json({ ...application, _id: String(application._id) })
  } catch (err) {
    next(err)
  }
})

// POST /applications/:id/send-assessment
applicationsRouter.post('/:id/send-assessment', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { durationMinutes } = req.body as { durationMinutes?: number }
    const application = await getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')

    const assessment = await ensureAssessment(String(application._id), String(application.job))
    const minutes = Math.max(5, Math.min(7 * 24 * 60, Number(durationMinutes ?? 60)))
    const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString()

    await Promise.all([
      ApplicationModel.findByIdAndUpdate(String(application._id), { status: 'assessment_sent', stage: 'assessment' }),
      AssessmentModel.findByIdAndUpdate(String(assessment._id), { status: 'pending', expiresAt }),
    ])

    await logAction({
      actor: 'user',
      action: 'assessment-send',
      candidateId: application.candidate,
      jobId: application.job,
      mode: 'assist',
      payload: { durationMinutes: minutes, expiresAt },
    })
    // Notify candidate
    const candForAssessment = await CandidateModel.findById(application.candidate).lean()
    if (candForAssessment?.user) {
      notify(String(candForAssessment.user), {
        type: 'assessment_sent',
        title: 'Assessment ready for you',
        body: 'A recruiter has sent you an assessment. Complete it before it expires.',
        link: '/candidate/applications',
      })
    }
    res.json({ ok: true, assessmentId: String(assessment._id), expiresAt })
  } catch (err) {
    next(err)
  }
})

// POST /applications/:id/reject
applicationsRouter.post('/:id/reject', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { reason } = req.body as { reason?: string }
    const application = await ApplicationModel.findByIdAndUpdate(
      String(req.params.id),
      { status: 'rejected', stage: 'rejected', recruiterNotes: reason, decision: 'reject', decisionAt: nowIso(), decisionBy: req.user!._id },
      { new: true },
    ).lean()
    if (!application) throw new HttpError(404, 'Application not found')

    // Store AI explanation so candidate can see it immediately
    const s = application.scores
    await AiOutputModel.create({
      application: String(application._id),
      type: 'explanation',
      input: { stage: application.stage, scores: s },
      output: {
        explanation: buildNarrative({
          resumeScore: s.resume ?? 0,
          assessmentScore: s.assessment ?? 0,
          penaltyApplied: s.penalty ?? 0,
          interviewScore: s.interview ?? 0,
          finalScore: s.final ?? 0,
          decision: 'reject',
          stage: application.stage,
        }),
        stage: application.stage,
      },
      modelVersion: 'rejection-auto-v1',
    })

    // Notify candidate immediately with explanation link
    const cand = await CandidateModel.findById(application.candidate).lean()
    if (cand?.user) {
      const candUser = await UserModel.findById(String(cand.user)).lean()
      notify(String(cand.user), {
        type: 'application_rejected',
        title: 'Application outcome — see your AI explanation',
        body: reason
          ? `The recruiter noted: "${reason.slice(0, 80)}". View your full AI explanation for a detailed breakdown.`
          : 'A decision has been made on your application. View your personalised AI explanation to understand how you were evaluated.',
        link: `/candidate/explanation/${String(application._id)}`,
      })
      if (candUser?.email) {
        await sendEmail({
          to: candUser.email,
          subject: 'Application outcome',
          text: 'A decision has been made on your application. Please open your dashboard to see the AI explanation and recruiter feedback.',
        })
      }
    }

    await logAction({ actor: 'user', action: 'application-reject', candidateId: application.candidate, jobId: application.job, mode: 'assist' })
    res.json({ ...application, _id: String(application._id) })
  } catch (err) {
    next(err)
  }
})

// POST /applications/ai-decide — Veto mode: AI auto-shortlists/rejects applied candidates for a job
applicationsRouter.post('/ai-decide', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { jobId, shortlistThreshold = 65, rejectThreshold = 40 } = req.body as {
      jobId?: string; shortlistThreshold?: number; rejectThreshold?: number
    }
    if (!jobId) throw new HttpError(400, 'jobId required')

    const appliedApps = await ApplicationModel.find({ job: jobId, stage: 'applied' }).lean()
    const results: { id: string; action: 'shortlisted' | 'rejected' | 'review'; score: number }[] = []

    for (const app of appliedApps) {
      const resumeScore = app.scores.resume ?? 0
      if (resumeScore >= shortlistThreshold) {
        await ApplicationModel.findByIdAndUpdate(String(app._id), { stage: 'screening', status: 'shortlisted' })
        // Notify candidate
        const cand = await CandidateModel.findById(app.candidate).lean()
        if (cand?.user) {
          notify(String(cand.user), {
            type: 'shortlisted',
            title: 'AI has shortlisted your application 🎉',
            body: `Your CV scored ${resumeScore}% (above the ${shortlistThreshold}% threshold). The AI has progressed your application automatically.`,
            link: '/candidate/applications',
          })
        }
        results.push({ id: String(app._id), action: 'shortlisted', score: resumeScore })
      } else if (resumeScore > 0 && resumeScore < rejectThreshold) {
        await ApplicationModel.findByIdAndUpdate(String(app._id), {
          stage: 'rejected', status: 'rejected', decision: 'reject', decisionAt: nowIso(), decisionBy: 'ai',
        })
        await AiOutputModel.create({
          application: String(app._id),
          type: 'explanation',
          input: { stage: 'applied', scores: app.scores },
          output: {
            explanation: buildNarrative({ resumeScore, assessmentScore: 0, penaltyApplied: 0, interviewScore: 0, finalScore: resumeScore, decision: 'reject', stage: 'applied' }),
            stage: 'applied',
          },
          modelVersion: 'veto-auto-v1',
        })
        const cand = await CandidateModel.findById(app.candidate).lean()
        if (cand?.user) {
          const candUser = await UserModel.findById(String(cand.user)).lean()
          notify(String(cand.user), {
            type: 'application_rejected',
            title: 'Application not progressed — AI explanation available',
            body: `Your CV scored ${resumeScore}% against this role's requirements. View your detailed AI explanation to understand the evaluation.`,
            link: `/candidate/explanation/${String(app._id)}`,
          })
          if (candUser?.email) {
            await sendEmail({
              to: candUser.email,
              subject: 'Application did not progress',
              text: `Your application for this role did not progress after AI screening (score ${resumeScore}%). Check your dashboard for full explanation.`,
            })
          }
        }
        results.push({ id: String(app._id), action: 'rejected', score: resumeScore })
      } else {
        results.push({ id: String(app._id), action: 'review', score: resumeScore })
      }
    }

    await logAction({ actor: 'ai', action: 'veto-ai-decide', jobId, mode: 'veto', payload: { results } })
    res.json({ ok: true, processed: results.length, results })
  } catch (err) {
    next(err)
  }
})

// POST /applications/:id/decision
applicationsRouter.post('/:id/decision', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { decision, notes, closeJobOnHire = true } = req.body as {
      decision?: 'hire' | 'reject' | 'hold'
      notes?: string
      closeJobOnHire?: boolean
    }
    if (!decision) throw new HttpError(400, 'decision is required')
    if (!notes || notes.trim().length < 10) throw new HttpError(400, 'decision rationale must be at least 10 characters')
    const application = await ApplicationModel.findByIdAndUpdate(
      String(req.params.id),
      {
        decision,
        recruiterNotes: notes,
        decisionBy: req.user!._id,
        decisionAt: nowIso(),
        status: 'decision_made',
        stage: decision === 'hire' ? 'decision' : decision === 'reject' ? 'rejected' : 'decision',
      },
      { new: true },
    ).lean()
    if (!application) throw new HttpError(404, 'Application not found')
    const s = application.scores
    await AiOutputModel.create({
      application: String(application._id),
      type: 'explanation',
      input: { stage: 'decision', decision, scores: s, recruiterNotes: notes ?? null },
      output: {
        explanation: buildNarrative({
          resumeScore: s.resume ?? 0,
          assessmentScore: s.assessment ?? 0,
          penaltyApplied: s.penalty ?? 0,
          interviewScore: s.interview ?? 0,
          finalScore: s.final ?? 0,
          decision,
          stage: application.stage,
        }),
        stage: application.stage,
        recruiterNote: notes ?? null,
      },
      modelVersion: 'decision-summary-v1',
    })
    await logAction({ actor: 'user', action: 'application-decision', candidateId: application.candidate, jobId: application.job, mode: 'assist' })
    if (decision === 'hire' && closeJobOnHire) {
      await JobModel.findByIdAndUpdate(String(application.job), { status: 'closed' })
      await logAction({ actor: 'user', action: 'job-close-after-hire', jobId: String(application.job), mode: 'assist', payload: { applicationId: String(application._id) } })
    }
    // Notify candidate with link to AI explanation
    const candForDecision = await CandidateModel.findById(application.candidate).lean()
    if (candForDecision?.user) {
      const candUser = await UserModel.findById(String(candForDecision.user)).lean()
      const isHire = decision === 'hire'
      notify(String(candForDecision.user), {
        type: 'decision_made',
        title: isHire ? 'Congratulations — offer extended! 🎉' : 'Application decision made',
        body: isHire
          ? 'A recruiter has extended an offer. View your AI-generated decision explanation.'
          : 'A recruiter has made a decision on your application. See your personalised AI explanation.',
        link: `/candidate/explanation/${String(application._id)}`,
      })
      if (candUser?.email) {
        await sendEmail({
          to: candUser.email,
          subject: isHire ? 'Offer decision on your application' : 'Application decision update',
          text: isHire
            ? 'Congratulations. A recruiter has extended an offer. View your full AI explanation and next steps in your dashboard.'
            : 'A final decision has been recorded on your application. View your dashboard for detailed AI explanation.',
        })
      }
    }
    res.json({ ...application, _id: String(application._id) })
  } catch (err) {
    next(err)
  }
})

// GET /applications/:id/explanation
applicationsRouter.get('/:id/explanation', requireAuth, async (req, res, next) => {
  try {
    const application = await getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    const s = application.scores
    const toPercent = (v: number) => Math.round((v > 1 ? v : v * 100) * 10) / 10
    const ai = await AiOutputModel.findOne({ application: String(application._id), type: 'explanation' }).sort({ createdAt: -1 }).lean()
    const shapValues = (ai?.output as { topFeatures?: Array<{ name: string; value: number }> } | undefined)?.topFeatures
      ?.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.name]: item.value }), {})

    const resumeScore = toPercent(s.resume ?? 0)
    const assessmentScore = toPercent(s.assessment ?? 0)
    const penaltyApplied = toPercent(s.penalty ?? 0)
    const interviewScore = toPercent(s.interview ?? 0)
    const finalScore = toPercent(s.final ?? 0)

    // Build a real, data-driven narrative explanation
    const aiExplanation = (ai?.output as { explanation?: string } | undefined)?.explanation
    const narrative = !isWeakGenericExplanation(aiExplanation)
      ? aiExplanation
      : buildStageSpecificNarrative({
          resumeScore,
          assessmentScore,
          penaltyApplied,
          interviewScore,
          finalScore,
          decision: application.decision as string | undefined,
          stage: application.stage,
        })

    // Include recruiter note if present
    const recruiterNote = (application as { recruiterNote?: string }).recruiterNote

    res.json({
      scores: {
        resumeScore,
        assessmentScore,
        penaltyApplied,
        interviewScore,
        finalScore,
        weights: { w1: 0.3, w2: 0.3, w3: 0.1, w4: 0.3 },
        explanation: narrative,
        shapValues: shapValues ?? {},
        recruiterNote: recruiterNote ?? null,
        stage: application.stage,
        decision: application.decision,
      },
    })
  } catch (err) {
    next(err)
  }
})

// POST /applications/:id/fairness-gate
applicationsRouter.post('/:id/fairness-gate', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const application = await getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    const [job, attrs] = await Promise.all([
      JobModel.findById(application.job).lean(),
      ProtectedAttributeModel.findOne({ candidate: application.candidate }).lean(),
    ])
    if (!job) throw new HttpError(404, 'Job not found')

    const threshold = Number(job.thresholds?.fairness ?? 0.5)
    const features = {
      resume: application.scores.resume ?? 0,
      assessment: application.scores.assessment ?? 0,
      interview: application.scores.interview ?? 0,
    }

    const gate = await runFairnessGate({
      applicationId: String(application._id),
      jobId: String(job._id),
      candidateId: String(application.candidate),
      protectedAttributes: {
        gender: attrs?.gender,
        ageRange: attrs?.ageRange,
        ethnicity: attrs?.ethnicity,
      },
      features,
      threshold,
    })

    await ApplicationModel.findByIdAndUpdate(String(application._id), {
      'scores.penalty': gate.delta,
      stage: gate.decision === 'pass' ? 'interview' : 'rejected',
      status: gate.decision === 'pass' ? application.status : 'rejected',
    })

    await AiOutputModel.create({
      application: String(application._id),
      type: 'bias_audit',
      input: { threshold, features },
      output: gate as unknown as Record<string, unknown>,
      modelVersion: 'fairness-xgb-v1',
    })

    const explain = await runShapExplain({
      applicationId: String(application._id),
      modelInput: features,
    })
    await AiOutputModel.create({
      application: String(application._id),
      type: 'explanation',
      input: { features },
      output: explain as unknown as Record<string, unknown>,
      modelVersion: 'shap-xgb-v1',
    })

    const cand = await CandidateModel.findById(application.candidate).lean()
    if (cand?.user) {
      if (gate.decision === 'pass') {
        notify(String(cand.user), {
          type: 'fairness_passed',
          title: 'Fairness review passed',
          body: 'Your application passed AI fairness review and has progressed to interview stage.',
          link: `/candidate/explanation/${String(application._id)}`,
        })
      } else {
        notify(String(cand.user), {
          type: 'fairness_rejected',
          title: 'Application update after fairness review',
          body: 'Your application did not progress after AI fairness review. View your detailed explanation.',
          link: `/candidate/explanation/${String(application._id)}`,
        })
      }
    }

    res.json({ ok: true, gate, explain })
  } catch (err) {
    next(err)
  }
})

// POST /applications/:id/recruiter-note — human-in-the-loop feedback visible to candidate
applicationsRouter.post('/:id/recruiter-note', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { note } = req.body as { note?: string }
    if (!note?.trim()) throw new HttpError(400, 'note is required')
    const application = await ApplicationModel.findByIdAndUpdate(
      String(req.params.id),
      { recruiterNote: note.trim() },
      { new: true },
    ).lean()
    if (!application) throw new HttpError(404, 'Application not found')
    const cand = await CandidateModel.findById(application.candidate).lean()
    if (cand?.user) {
      notify(String(cand.user), {
        type: 'recruiter_feedback',
        title: 'Recruiter feedback added',
        body: 'A recruiter has added personalised feedback to your application explanation.',
        link: `/candidate/explanation/${String(application._id)}`,
      })
    }
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// POST /applications/:id/correspondence/send
applicationsRouter.post('/:id/correspondence/send', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const application = await getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    const candidate = await CandidateModel.findById(application.candidate).lean()
    const candidateUser = candidate ? await UserModel.findById(candidate.user).lean() : null
    if (!candidateUser?.email) throw new HttpError(404, 'Candidate email not found')
    const body = req.body as { subject?: string; message?: string }
    const subject = body.subject ?? 'Update on your application'
    const message = body.message ?? 'We have an update regarding your application status.'
    await sendEmail({ to: candidateUser.email, subject, text: message, html: `<p>${message}</p>` })
    await logAction({ actor: 'user', action: 'correspondence-send', candidateId: application.candidate, jobId: application.job, mode: 'assist', payload: req.body as Record<string, unknown> })
    res.json({ ok: true, message: 'Correspondence sent' })
  } catch (err) {
    next(err)
  }
})

applicationsRouter.post('/:id/correspondence/reply', requireAuth, requireRole('candidate'), async (req, res, next) => {
  try {
    const application = await getApplicationById(String(req.params.id))
    if (!application) throw new HttpError(404, 'Application not found')
    const candidate = await getCandidateByUserId(req.user!._id)
    if (!candidate || String(candidate._id) !== String(application.candidate)) throw new HttpError(403, 'Forbidden')
    const body = req.body as { message?: string }
    const message = String(body.message ?? '').trim()
    if (message.length < 3) throw new HttpError(400, 'message too short')
    await logAction({
      actor: 'user',
      action: 'correspondence-reply',
      candidateId: String(application.candidate),
      jobId: String(application.job),
      mode: 'assist',
      payload: { message },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})
