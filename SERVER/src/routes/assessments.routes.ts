import { Router } from 'express'
import { getAssessmentByApplicationId, getApplicationById, logAction } from '../data/store.js'
import { AssessmentModel } from '../models/Assessment.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { requireAuth } from '../lib/auth.js'
import { HttpError, nowIso } from '../lib/http.js'

export const assessmentsRouter = Router()

// GET /assessments/:applicationId
assessmentsRouter.get('/:applicationId', requireAuth, async (req, res, next) => {
  try {
    const assessment = await getAssessmentByApplicationId(String(req.params.applicationId))
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    res.json({ ...assessment, _id: String(assessment._id) })
  } catch (err) {
    next(err)
  }
})

// POST /assessments/:assessmentId/start
assessmentsRouter.post('/:assessmentId/start', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findByIdAndUpdate(
      String(req.params.assessmentId),
      { status: 'in_progress', startedAt: nowIso() },
      { new: true },
    ).lean()
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    const app = await getApplicationById(assessment.application)
    await logAction({ actor: 'ai', action: 'assessment-start', candidateId: app?.candidate, jobId: assessment.job, mode: 'assist' })
    res.json({ ...assessment, _id: String(assessment._id) })
  } catch (err) {
    next(err)
  }
})

// POST /assessments/:assessmentId/modules/:moduleType/submit
assessmentsRouter.post('/:assessmentId/modules/:moduleType/submit', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findById(String(req.params.assessmentId))
    if (!assessment) throw new HttpError(404, 'Assessment not found')

    const module = assessment.modules.find((m) => m.type === req.params.moduleType)
    if (!module) throw new HttpError(404, `Module '${req.params.moduleType}' not found`)

    const score = Math.min(100, Math.round(70 + Math.random() * 20))
    module.score = score
    module.timeSpent = Math.round(10 + Math.random() * 20)
    module.completedAt = nowIso()
    if ((req.body as { answers?: unknown[] }).answers) {
      module.answers = (req.body as { answers: unknown[] }).answers as never
    }

    await assessment.save()
    res.json({ ok: true, score })
  } catch (err) {
    next(err)
  }
})

// POST /assessments/:assessmentId/complete
assessmentsRouter.post('/:assessmentId/complete', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findById(String(req.params.assessmentId))
    if (!assessment) throw new HttpError(404, 'Assessment not found')

    const completedModules = assessment.modules.filter((m) => m.score != null)
    const avgScore = completedModules.length
      ? Math.round(completedModules.reduce((sum, m) => sum + (m.score ?? 0), 0) / completedModules.length)
      : 0

    assessment.status = 'completed'
    assessment.completedAt = nowIso()
    assessment.score = avgScore
    await assessment.save()

    // Update application scores
    const application = await ApplicationModel.findByIdAndUpdate(
      assessment.application,
      { status: 'assessment_sent', stage: 'assessment', 'scores.assessment': avgScore },
      { new: true },
    ).lean()

    await logAction({ actor: 'ai', action: 'assessment-complete', candidateId: application?.candidate, jobId: assessment.job, mode: 'assist' })
    res.json({ ...assessment.toJSON(), _id: String(assessment._id) })
  } catch (err) {
    next(err)
  }
})
