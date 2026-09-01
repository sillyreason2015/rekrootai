import { Router } from 'express'
import { AssessmentModel } from '../models/Assessment.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { requireAuth } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { logAction } from '../data/store.js'
import { notify } from '../lib/notify.js'
import { computeCompositeScore } from '../lib/scoring.js'

export const assessmentsRouter = Router()

async function assertAssessmentAccess(assessment: { candidate?: unknown }, user: { _id: string; role: string }) {
  if (user.role === 'admin' || user.role === 'super_admin') return
  if (user.role !== 'candidate') throw new HttpError(403, 'Only the assigned candidate may access this assessment')
  const candidate = await CandidateModel.findOne({ user: user._id }, { _id: 1 }).lean()
  if (!candidate || String(candidate._id) !== String(assessment.candidate)) {
    throw new HttpError(403, 'You may only access your own assessment')
  }
}

async function notifyCandidate(candidateId: string | undefined, data: { type: string; title: string; body: string; link?: string }) {
  if (!candidateId) return
  const candidate = await CandidateModel.findById(candidateId, { user: 1 }).lean()
  if (!candidate?.user) return
  notify(String(candidate.user), data)
}

assessmentsRouter.get('/:applicationId', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findOne({ application: req.params.applicationId })
      .sort({ createdAt: -1 })
      .populate('job', 'title assessmentModules thresholds')
      .lean()
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    await assertAssessmentAccess(assessment, req.user!)
    res.json({ ...assessment, _id: String(assessment._id) })
  } catch (err) { next(err) }
})

assessmentsRouter.post('/:assessmentId/start', requireAuth, async (req, res, next) => {
  try {
    const existing = await AssessmentModel.findById(req.params.assessmentId).lean()
    if (!existing) throw new HttpError(404, 'Assessment not found')
    await assertAssessmentAccess(existing, req.user!)
    if (new Date(existing.expiresAt).getTime() <= Date.now()) {
      await AssessmentModel.findByIdAndUpdate(existing._id, { status: 'expired' })
      throw new HttpError(409, 'Assessment has expired')
    }
    if (existing.status !== 'pending' || existing.startedAt) {
      throw new HttpError(409, 'Assessment has already started')
    }
    const assessment = await AssessmentModel.findByIdAndUpdate(
      req.params.assessmentId,
      { status: 'in_progress', startedAt: new Date().toISOString() },
      { new: true },
    ).lean()
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    await assertAssessmentAccess(assessment, req.user!)
    await ApplicationModel.findByIdAndUpdate(assessment.application, {
      assessmentStatus: 'in_progress',
      assessmentExpiresAt: assessment.expiresAt,
    })
    await notifyCandidate(typeof existing.candidate === 'string' ? existing.candidate : undefined, {
      type: 'assessment_sent',
      title: 'Assessment started',
      body: 'Your assessment session is now in progress. You can continue from where you left off if the page reloads.',
      link: `/candidate/assessment/${String(existing.application)}`,
    })
    res.json({ ...assessment, _id: String(assessment._id) })
  } catch (err) { next(err) }
})

assessmentsRouter.post('/:assessmentId/modules/:moduleIndex/submit', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findById(req.params.assessmentId)
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    await assertAssessmentAccess(assessment, req.user!)
    if (assessment.status === 'completed') {
      throw new HttpError(409, 'Assessment has already been completed')
    }
    const moduleIndex = Number(req.params.moduleIndex)
    if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= assessment.modules.length) {
      throw new HttpError(404, 'Module not found')
    }
    const mod = assessment.modules[moduleIndex]
    if (!mod) throw new HttpError(404, 'Module not found')
    if (mod.completedAt) {
      throw new HttpError(409, 'This module has already been submitted')
    }
    if (new Date(assessment.expiresAt).getTime() <= Date.now()) {
      assessment.status = 'expired'
      await assessment.save()
      throw new HttpError(409, 'Assessment has expired')
    }
    if (assessment.status !== 'in_progress') throw new HttpError(409, 'Start the assessment before submitting a module')
    const body = req.body as { answers?: Array<{ questionId: string; selected?: number; text?: string }>; score?: number }
    if (body.score !== undefined) throw new HttpError(400, 'Score is calculated by the server and cannot be submitted')
    if (!Array.isArray(body.answers)) throw new HttpError(400, 'answers must be an array')
    const questionIds = new Set(mod.questions.map((question) => String(question._id)))
    const seen = new Set<string>()
    const answers = body.answers.filter((answer) => {
      const questionId = String(answer.questionId ?? '')
      if (!questionIds.has(questionId) || seen.has(questionId)) return false
      seen.add(questionId)
      return true
    })
    if (answers.length !== body.answers.length) throw new HttpError(400, 'Answers contain an unknown or duplicate question')
    for (const answer of answers) {
      const question = mod.questions.find((candidate) => String(candidate._id) === answer.questionId)
      if (!question) throw new HttpError(400, 'Answer does not match an assessment question')
      if (question.type === 'mcq') {
        if (answer.selected !== undefined && (!Number.isInteger(answer.selected) || answer.selected < 0 || answer.selected >= (question.options?.length ?? 0))) {
          throw new HttpError(400, 'Invalid multiple-choice answer')
        }
        if (answer.text !== undefined) throw new HttpError(400, 'Text answers are not valid for multiple-choice questions')
      } else if (answer.selected !== undefined) {
        throw new HttpError(400, 'Multiple-choice selections are not valid for this question')
      } else if (answer.text !== undefined && typeof answer.text !== 'string') {
        throw new HttpError(400, 'Text answer must be a string')
      }
    }
    mod.answers = answers as never

    // Score: if an explicit score is passed use it, otherwise compute from MCQ correctness.
    // Open/personality/values questions are unscored here — AI scoring runs separately.
    if (typeof body.score === 'number') {
      mod.score = Math.min(100, Math.max(0, body.score))
    } else {
      const mcqQuestions = mod.questions.filter((q) => q.type === 'mcq')
      if (mcqQuestions.length > 0) {
        const correct = mcqQuestions.filter((q) => {
          const ans = answers.find((a) => a.questionId === String(q._id))
          return ans !== undefined && ans.selected === q.correctIndex
        }).length
        mod.score = Math.round((correct / mcqQuestions.length) * 100)
      } else {
        // Open/text answers require a later evaluator; never award implicit
        // full credit from a client submission.
        mod.score = 0
      }
    }
    mod.completedAt = new Date().toISOString()

    const allModulesSubmitted = assessment.modules.every((m) => m.completedAt)
    if (allModulesSubmitted) {
      assessment.status = 'completed'
      assessment.completedAt = new Date().toISOString()
      const scores = assessment.modules.map((m) => m.score ?? 0)
      assessment.score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    }

    await assessment.save()

    const modulesCompleted = assessment.modules.filter((m) => m.completedAt).length
    const totalModules = assessment.modules.length

    if (allModulesSubmitted) {
      const application = await ApplicationModel.findById(assessment.application, { scores: 1 }).lean()
      const currentScores = application?.scores ?? {}
      const finalScore = computeCompositeScore({
        resume: currentScores.resume,
        assessment: assessment.score,
        penalty: currentScores.penalty,
        interview: currentScores.interview,
      }, 'assessment')
      await ApplicationModel.findByIdAndUpdate(assessment.application, {
        stage: 'assessment',
        status: 'assessment_completed',
        assessmentStatus: 'completed',
        currentAssessmentId: null,
        assessmentExpiresAt: assessment.expiresAt,
        'scores.assessment': assessment.score,
        'scores.final': finalScore,
        'assessmentCheckpoint.modulesCompleted': modulesCompleted,
        'assessmentCheckpoint.totalModules': totalModules,
        'assessmentCheckpoint.lastActiveAt': new Date().toISOString(),
      })
      await logAction({ actor: 'ai', action: 'assessment-completed', jobId: String(assessment.job), mode: 'assist', payload: { avgScore: assessment.score, passed: (assessment.score ?? 0) >= 60 } })
      await notifyCandidate(typeof assessment.candidate === 'string' ? assessment.candidate : undefined, {
        type: (assessment.score ?? 0) >= 60 ? 'assessment_completed' : 'assessment_failed',
        title: 'Assessment submitted',
        body: `Your assessment has been submitted and recorded with a current score of ${assessment.score ?? 0}%.`,
        link: '/candidate/applications',
      })
    } else {
      // Partial progress — update checkpoint so recruiters can see where the candidate is
      await ApplicationModel.findByIdAndUpdate(assessment.application, {
        assessmentStatus: 'in_progress',
        'assessmentCheckpoint.modulesCompleted': modulesCompleted,
        'assessmentCheckpoint.totalModules': totalModules,
        'assessmentCheckpoint.lastActiveAt': new Date().toISOString(),
      })
    }

    res.json({ ...assessment.toObject(), _id: String(assessment._id) })
  } catch (err) { next(err) }
})

assessmentsRouter.post('/:assessmentId/complete', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findById(req.params.assessmentId)
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    await assertAssessmentAccess(assessment, req.user!)
    if (assessment.status === 'completed') {
      return res.json({ ...assessment.toObject(), _id: String(assessment._id) })
    }
    if (new Date(assessment.expiresAt).getTime() <= Date.now()) {
      assessment.status = 'expired'
      await assessment.save()
      throw new HttpError(409, 'Assessment has expired')
    }
    if (assessment.status !== 'in_progress') throw new HttpError(409, 'Assessment is not in progress')
    if (assessment.modules.some((module) => !module.completedAt)) {
      throw new HttpError(409, 'Submit every assessment module before completing the assessment')
    }
    assessment.status = 'completed'
    assessment.completedAt = new Date().toISOString()
    // Average only modules that were actually submitted (have completedAt)
    const submittedModules = assessment.modules.filter((m) => m.completedAt)
    const scores = submittedModules.map((m) => m.score ?? 0)
    assessment.score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    await assessment.save()
    const application = await ApplicationModel.findById(assessment.application, { scores: 1 }).lean()
    const currentScores = application?.scores ?? {}
    const finalScore = computeCompositeScore({
      resume: currentScores.resume,
      assessment: assessment.score,
      penalty: currentScores.penalty,
      interview: currentScores.interview,
    }, 'assessment')
    await ApplicationModel.findByIdAndUpdate(assessment.application, {
      stage: 'assessment',
      status: 'assessment_completed',
      assessmentStatus: 'completed',
      currentAssessmentId: null,
      assessmentExpiresAt: assessment.expiresAt,
      'scores.assessment': assessment.score,
      'scores.final': finalScore,
    })
    await logAction({ actor: 'ai', action: 'assessment-completed', jobId: String(assessment.job), mode: 'assist', payload: { avgScore: assessment.score, passed: assessment.score >= 60 } })
    await notifyCandidate(typeof assessment.candidate === 'string' ? assessment.candidate : undefined, {
      type: assessment.score >= 60 ? 'assessment_completed' : 'assessment_failed',
      title: assessment.score >= 60 ? 'Assessment submitted' : 'Assessment submitted',
      body: assessment.score >= 60
        ? `Your assessment has been submitted successfully with a current score of ${assessment.score}%.`
        : `Your assessment has been submitted and recorded with a current score of ${assessment.score}%.`,
      link: '/candidate/applications',
    })
    res.json({ ...assessment.toObject(), _id: String(assessment._id) })
  } catch (err) { next(err) }
})

assessmentsRouter.post('/:assessmentId/proctoring-event', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findById(req.params.assessmentId)
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    await assertAssessmentAccess(assessment, req.user!)
    if (assessment.status !== 'in_progress') throw new HttpError(409, 'Assessment is not in progress')
    const body = req.body as { type?: string; reason?: string }
    const allowed = new Set(['tab_switch', 'window_blur', 'other'])
    if (!body.type || !allowed.has(body.type)) throw new HttpError(400, 'Invalid proctoring event type')
    const reason = String(body.reason ?? '').trim().slice(0, 500)
    if (!reason) throw new HttpError(400, 'Proctoring event reason is required')
    assessment.proctoringEvents = assessment.proctoringEvents ?? []
    assessment.proctoringEvents.push({ actor: 'candidate', type: body.type as 'tab_switch' | 'window_blur' | 'other', reason, at: new Date().toISOString() })
    await assessment.save()
    await logAction({ actor: 'user', action: 'assessment-proctoring-event', candidateId: String(assessment.candidate), jobId: String(assessment.job), mode: 'assist', payload: { assessmentId: String(assessment._id), type: body.type, reason } })
    res.status(201).json({ ok: true, events: assessment.proctoringEvents })
  } catch (err) { next(err) }
})
