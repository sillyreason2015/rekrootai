import { Router } from 'express'
import { getAssessmentByApplicationId, getApplicationById, logAction } from '../data/store.js'
import { AssessmentModel } from '../models/Assessment.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { AiOutputModel } from '../models/AiOutput.model.js'
import { JobModel } from '../models/Job.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { requireAuth } from '../lib/auth.js'
import { HttpError, nowIso } from '../lib/http.js'
import { notify } from '../lib/notify.js'
import { UserModel } from '../models/User.model.js'
import { sendEmail } from '../lib/email.js'

export const assessmentsRouter = Router()

// Default pass threshold (if not set on job)
const DEFAULT_THRESHOLD = 60

function assessmentNarrative(score: number, threshold: number, passed: boolean): string {
  if (!passed) {
    return `Your assessment score of ${score}% was below the required threshold of ${threshold}% for this role. `
      + `The AI pipeline evaluated your responses across all modules and determined the score did not meet the minimum standard set by the recruiter. `
      + `This is not a reflection of your broader potential — different roles have different requirements, and we encourage you to apply to roles better matched to your current experience level. `
      + `Focus areas for improvement typically include the technical or situational modules where the largest gaps from the threshold appeared.`
  }
  if (score >= 85) return `Excellent result — your assessment score of ${score}% is significantly above the required threshold of ${threshold}%. `
    + `The AI evaluation found strong performance across all modules, indicating solid technical knowledge and situational judgement. `
    + `Your application progresses to the AI fairness review, after which the recruiter will schedule an interview.`
  if (score >= threshold) return `Your assessment score of ${score}% meets the required threshold of ${threshold}% for this role. `
    + `The AI evaluation found adequate performance across the tested competency areas. `
    + `Your application will now be reviewed by the AI fairness gate before progressing to the interview stage.`
  return `Score: ${score}%`
}

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
    const current = await AssessmentModel.findById(String(req.params.assessmentId)).lean()
    if (!current) throw new HttpError(404, 'Assessment not found')
    const app0 = await getApplicationById(String(current.application))
    if (!app0) throw new HttpError(404, 'Application not found')
    if (String(app0.stage) !== 'assessment') throw new HttpError(400, 'Assessment is not available for this application stage')
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
    const app0 = await getApplicationById(String(assessment.application))
    if (!app0) throw new HttpError(404, 'Application not found')
    if (String(app0.stage) !== 'assessment') throw new HttpError(400, 'Cannot submit module outside assessment stage')

    const module = assessment.modules.find((m) => m.type === req.params.moduleType)
    if (!module) throw new HttpError(404, `Module '${req.params.moduleType}' not found`)

    const submittedAnswers = Array.isArray((req.body as { answers?: unknown[] }).answers)
      ? ((req.body as { answers?: unknown[] }).answers as unknown[])
      : []
    const answeredCount = submittedAnswers.filter((a) => {
      if (a == null) return false
      if (typeof a === 'string') return a.trim().length > 0
      return true
    }).length
    const totalCount = Math.max(submittedAnswers.length, module.questions.length, 1)
    const completionRatio = answeredCount / totalCount
    const score = answeredCount === 0 ? 0 : Math.round(Math.min(100, completionRatio * 100))

    module.score = score
    module.timeSpent = Math.max(0, Math.round(Number((req.body as { timeSpent?: number }).timeSpent ?? 0)))
    module.completedAt = nowIso()
    module.answers = submittedAnswers as never

    await assessment.save()
    res.json({ ok: true, score, answeredCount, totalCount })
  } catch (err) {
    next(err)
  }
})

// POST /assessments/:assessmentId/complete
assessmentsRouter.post('/:assessmentId/complete', requireAuth, async (req, res, next) => {
  try {
    const assessment = await AssessmentModel.findById(String(req.params.assessmentId))
    if (!assessment) throw new HttpError(404, 'Assessment not found')

    const completedModules = assessment.modules.filter((m) => m.score != null && m.type !== 'values')
    const avgScore = completedModules.length
      ? Math.round(completedModules.reduce((sum, m) => sum + (m.score ?? 0), 0) / completedModules.length)
      : 0

    assessment.status = 'completed'
    assessment.completedAt = nowIso()
    assessment.score = avgScore
    await assessment.save()

    // Get job threshold for pass/fail decision
    const jobDoc = await JobModel.findById(assessment.job).lean()
    const threshold = Number(jobDoc?.thresholds?.assessment ?? DEFAULT_THRESHOLD)
    const passed = avgScore >= threshold

    // Update application
    const application = await ApplicationModel.findByIdAndUpdate(
      assessment.application,
      {
        'scores.assessment': avgScore,
        // If failed → auto-reject; if passed → stay in assessment awaiting fairness gate
        stage: passed ? 'assessment' : 'rejected',
        status: passed ? 'assessment_sent' : 'rejected',
        ...(passed ? {} : { decision: 'reject', decisionAt: nowIso(), decisionBy: 'ai' }),
      },
      { new: true },
    ).lean()

    await logAction({
      actor: 'ai',
      action: 'assessment-complete',
      candidateId: application?.candidate,
      jobId: assessment.job,
      mode: 'assist',
      payload: { avgScore, threshold, passed },
    })

    // Store AI explanation output for this stage
    if (application) {
      await AiOutputModel.create({
        application: String(application._id),
        type: 'explanation',
        input: { avgScore, threshold, passed, stage: 'assessment' },
        output: {
          explanation: assessmentNarrative(avgScore, threshold, passed),
          stage: 'assessment',
          topFeatures: [
            { name: 'assessment_score', value: +(avgScore / 100).toFixed(2) },
            { name: 'threshold_delta', value: +((avgScore - threshold) / 100).toFixed(2) },
          ],
        },
        modelVersion: 'assessment-auto-v1',
      })
    }

    // Notify recruiter
    if (jobDoc?.createdBy && application) {
      notify(String(jobDoc.createdBy), {
        type: 'assessment_completed',
        title: passed ? 'Assessment passed' : 'Candidate failed assessment',
        body: `Candidate scored ${avgScore}% (threshold: ${threshold}%) for "${jobDoc.title}". ${passed ? 'Review in shortlist.' : 'Auto-rejected by AI.'}`,
        link: `/recruiter/shortlist?job=${String(jobDoc._id)}`,
      })
    }

    // Notify candidate immediately — with explanation link
    if (application) {
      const cand = await CandidateModel.findById(application.candidate).lean()
      if (cand?.user) {
        if (passed) {
          notify(String(cand.user), {
            type: 'assessment_result',
            title: `Assessment passed — score ${avgScore}% ✓`,
            body: `You scored ${avgScore}% (threshold: ${threshold}%). Your application progresses to the fairness review and interview stage. See your detailed breakdown.`,
            link: `/candidate/explanation/${String(application._id)}`,
          })
        } else {
          notify(String(cand.user), {
            type: 'assessment_failed',
            title: `Assessment result: ${avgScore}% — below threshold`,
            body: `Your score of ${avgScore}% did not meet the ${threshold}% threshold for this role. View your personalised AI explanation for detailed feedback.`,
            link: `/candidate/explanation/${String(application._id)}`,
          })
          const candidateUser = await UserModel.findById(String(cand.user)).lean()
          if (candidateUser?.email) {
            await sendEmail({
              to: candidateUser.email,
              subject: 'Assessment outcome for your application',
              text: `Your assessment score was ${avgScore}% and did not meet the ${threshold}% threshold for this role. Open your dashboard explanation for details.`,
            })
          }
        }
      }
    }

    res.json({ ...assessment.toJSON(), _id: String(assessment._id), passed, avgScore, threshold })
  } catch (err) {
    next(err)
  }
})
