import { Router } from 'express'
import { db, getAssessmentByApplicationId, getApplicationById, logAction } from '../data/mockStore.js'
import { requireAuth } from '../lib/auth.js'
import { HttpError, nowIso } from '../lib/http.js'

export const assessmentsRouter = Router()

assessmentsRouter.get('/:applicationId', requireAuth, (req, res, next) => {
  try {
    const assessment = getAssessmentByApplicationId(String(req.params.applicationId))
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    res.json(assessment)
  } catch (error) {
    next(error)
  }
})

assessmentsRouter.post('/:assessmentId/start', requireAuth, (req, res, next) => {
  try {
    const assessment = db.assessments.find((item) => item._id === req.params.assessmentId) ?? null
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    assessment.status = 'in_progress'
    assessment.startedAt = nowIso()
    logAction({ actor: 'ai', action: 'assessment-start', candidateId: getApplicationById(assessment.application)?.candidate, jobId: assessment.job, mode: 'assist' })
    res.json(assessment)
  } catch (error) {
    next(error)
  }
})

assessmentsRouter.post('/:assessmentId/modules/:moduleType/submit', requireAuth, (req, res, next) => {
  try {
    const assessment = db.assessments.find((item) => item._id === req.params.assessmentId) ?? null
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    const module = assessment.modules.find((item) => item.type === req.params.moduleType)
    if (!module) throw new HttpError(404, 'Module not found')
    module.answers = (req.body as { answers?: unknown[] }).answers as never
    module.score = Math.min(100, Math.round(70 + Math.random() * 20))
    module.timeSpent = Math.round(10 + Math.random() * 20)
    module.completedAt = nowIso()
    res.json({ ok: true, score: module.score })
  } catch (error) {
    next(error)
  }
})

assessmentsRouter.post('/:assessmentId/complete', requireAuth, (req, res, next) => {
  try {
    const assessment = db.assessments.find((item) => item._id === req.params.assessmentId) ?? null
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    assessment.status = 'completed'
    assessment.completedAt = nowIso()
    assessment.score = Math.round(assessment.modules.reduce((sum, module) => sum + (module.score ?? 0), 0) / assessment.modules.length)
    const application = getApplicationById(assessment.application)
    if (application) {
      application.status = 'assessment_sent'
      application.stage = 'assessment'
      application.scores.assessment = assessment.score
    }
    logAction({ actor: 'ai', action: 'assessment-complete', candidateId: application?.candidate, jobId: assessment.job, mode: 'assist' })
    res.json(assessment)
  } catch (error) {
    next(error)
  }
})
