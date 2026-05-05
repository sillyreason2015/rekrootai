import { Router } from 'express'
import { AssessmentModel } from '../models/Assessment.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { requireAuth } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { logAction } from '../data/store.js'

export const assessmentsRouter = Router()

assessmentsRouter.get('/:applicationId', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findOne({ application: req.params.applicationId }).lean()
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    res.json({ ...assessment, _id: String(assessment._id) })
  } catch (err) { next(err) }
})

assessmentsRouter.post('/:assessmentId/start', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findByIdAndUpdate(
      req.params.assessmentId,
      { status: 'in_progress', startedAt: new Date().toISOString() },
      { new: true },
    ).lean()
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    res.json({ ...assessment, _id: String(assessment._id) })
  } catch (err) { next(err) }
})

assessmentsRouter.post('/:assessmentId/modules/:moduleType/submit', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findById(req.params.assessmentId)
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    const mod = assessment.modules.find((m) => m.type === req.params.moduleType)
    if (!mod) throw new HttpError(404, 'Module not found')
    const body = req.body as { answers?: unknown[]; score?: number }
    mod.answers = body.answers as never
    // Use submitted score if provided by ML service; otherwise score by answer count correctness
    mod.score = typeof body.score === 'number'
      ? Math.min(100, Math.max(0, body.score))
      : Math.min(100, Math.round(((body.answers?.length ?? 0) / 10) * 100))
    mod.completedAt = new Date().toISOString()
    await assessment.save()
    res.json({ ok: true, score: mod.score })
  } catch (err) { next(err) }
})

assessmentsRouter.post('/:assessmentId/complete', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findById(req.params.assessmentId)
    if (!assessment) throw new HttpError(404, 'Assessment not found')
    assessment.status = 'completed'
    assessment.completedAt = new Date().toISOString()
    const scores = assessment.modules.map((m) => m.score ?? 0).filter((s) => s > 0)
    assessment.score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    await assessment.save()
    await ApplicationModel.findByIdAndUpdate(assessment.application, {
      stage: 'assessment', status: 'assessment_sent', 'scores.assessment': assessment.score,
    })
    await logAction({ actor: 'ai', action: 'assessment-completed', jobId: String(assessment.job), mode: 'assist', payload: { avgScore: assessment.score, passed: assessment.score >= 60 } })
    res.json({ ...assessment.toObject(), _id: String(assessment._id) })
  } catch (err) { next(err) }
})
