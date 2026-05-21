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
    res.json({ ...assessment, _id: String(assessment._id) })
  } catch (err) { next(err) }
})

assessmentsRouter.post('/:assessmentId/start', requireAuth, async (req, res, next) => {
  try {
    const existing = await AssessmentModel.findById(req.params.assessmentId).lean()
    if (!existing) throw new HttpError(404, 'Assessment not found')
    if (existing.status !== 'pending' || existing.startedAt) {
      throw new HttpError(409, 'Assessment has already started')
    }
    const assessment = await AssessmentModel.findByIdAndUpdate(
      req.params.assessmentId,
      { status: 'in_progress', startedAt: new Date().toISOString() },
      { new: true },
    ).lean()
    if (!assessment) throw new HttpError(404, 'Assessment not found')
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
    const body = req.body as { answers?: unknown[]; score?: number }
    mod.answers = body.answers as never
    const totalQuestions = mod.questions.length || 1
    mod.score = typeof body.score === 'number'
      ? Math.min(100, Math.max(0, body.score))
      : Math.min(100, Math.round(((body.answers?.length ?? 0) / totalQuestions) * 100))
    mod.completedAt = new Date().toISOString()

    const allModulesSubmitted = assessment.modules.every((m) => m.completedAt)
    if (allModulesSubmitted) {
      assessment.status = 'completed'
      assessment.completedAt = new Date().toISOString()
      const scores = assessment.modules.map((m) => m.score ?? 0)
      assessment.score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    }

    await assessment.save()

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
      })
      await logAction({ actor: 'ai', action: 'assessment-completed', jobId: String(assessment.job), mode: 'assist', payload: { avgScore: assessment.score, passed: (assessment.score ?? 0) >= 60 } })
      await notifyCandidate(typeof assessment.candidate === 'string' ? assessment.candidate : undefined, {
        type: (assessment.score ?? 0) >= 60 ? 'assessment_completed' : 'assessment_failed',
        title: 'Assessment submitted',
        body: `Your assessment has been submitted and recorded with a current score of ${assessment.score ?? 0}%.`,
        link: '/candidate/applications',
      })
    }

    res.json({ ...assessment.toObject(), _id: String(assessment._id) })
  } catch (err) { next(err) }
})

assessmentsRouter.post('/:assessmentId/complete', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findById(req.params.assessmentId)
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    if (assessment.status === 'completed') {
      return res.json({ ...assessment.toObject(), _id: String(assessment._id) })
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
