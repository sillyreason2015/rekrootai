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

export const applicationsRouter = Router()

// POST /applications
applicationsRouter.post('/', requireAuth, requireRole('candidate', 'admin'), async (req, res, next) => {
  try {
    const { jobId } = req.body as { jobId?: string }
    const [candidate, job] = await Promise.all([
      getCandidateByUserId(req.user!._id),
      jobId ? getJobById(jobId) : null,
    ])
    if (!candidate) throw new HttpError(404, 'Candidate profile not found')
    if (!job) throw new HttpError(404, 'Job not found')

    // Prevent duplicate applications
    const existing = await ApplicationModel.findOne({ job: String(job._id), candidate: String(candidate._id) }).lean()
    if (existing) throw new HttpError(409, 'Already applied to this job')

    const application = await ApplicationModel.create({
      job: String(job._id),
      candidate: String(candidate._id),
      status: 'pending',
      scores: { resume: 0, assessment: 0, penalty: 0, interview: 0, final: 0 },
      stage: 'applied',
    })

    // Auto-create assessment record
    await ensureAssessment(String(application._id), String(job._id))

    await logAction({ actor: 'user', action: 'application-create', candidateId: String(candidate._id), jobId: String(job._id), mode: 'assist' })
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
    // Attach interviewId for applications in interview stage
    const { InterviewModel } = await import('../models/Interview.model.js')
    const appIds = applications.map((a) => String(a._id))
    const interviews = await InterviewModel.find({ application: { $in: appIds } }).lean()
    const interviewMap = Object.fromEntries(interviews.map((i) => [String(i.application), String(i._id)]))
    res.json(applications.map((a) => ({
      ...a,
      _id: String(a._id),
      job: jobMap[a.job] ?? a.job,
      interviewId: interviewMap[String(a._id)],
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
    res.json(paginate(applications.map((a) => ({ ...a, _id: String(a._id) })), page, limit))
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
    res.json({ ...application, _id: String(application._id) })
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
      { status: 'rejected', stage: 'rejected', recruiterNotes: reason },
      { new: true },
    ).lean()
    if (!application) throw new HttpError(404, 'Application not found')
    await logAction({ actor: 'user', action: 'application-reject', candidateId: application.candidate, jobId: application.job, mode: 'assist' })
    res.json({ ...application, _id: String(application._id) })
  } catch (err) {
    next(err)
  }
})

// POST /applications/:id/decision
applicationsRouter.post('/:id/decision', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { decision, notes } = req.body as { decision?: 'hire' | 'reject' | 'hold'; notes?: string }
    const application = await ApplicationModel.findByIdAndUpdate(
      String(req.params.id),
      {
        decision,
        recruiterNotes: notes,
        decisionBy: req.user!._id,
        decisionAt: nowIso(),
        status: 'decision_made',
        stage: decision === 'hire' ? 'decision' : 'rejected',
      },
      { new: true },
    ).lean()
    if (!application) throw new HttpError(404, 'Application not found')
    await logAction({ actor: 'user', action: 'application-decision', candidateId: application.candidate, jobId: application.job, mode: 'assist' })
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

    res.json({
      scores: {
        resumeScore: toPercent(s.resume ?? 0),
        assessmentScore: toPercent(s.assessment ?? 0),
        penaltyApplied: toPercent(s.penalty ?? 0),
        interviewScore: toPercent(s.interview ?? 0),
        finalScore: toPercent(s.final ?? 0),
        weights: { w1: 0.3, w2: 0.3, w3: 0.1, w4: 0.3 },
        explanation: (ai?.output as { explanation?: string } | undefined)?.explanation
          ?? 'Explanation pending. Run fairness/explainer pipeline to generate SHAP-backed rationale.',
        shapValues: shapValues ?? {},
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

    res.json({ ok: true, gate, explain })
  } catch (err) {
    next(err)
  }
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
