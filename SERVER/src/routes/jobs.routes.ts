import { Router } from 'express'
import { JobModel } from '../models/Job.model.js'
import { QuestionBankModel } from '../models/QuestionBank.model.js'
import { getJobById, logAction } from '../data/store.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, paginate } from '../lib/http.js'

export const jobsRouter = Router()

// GET /jobs — public, paginated, filterable
jobsRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').toLowerCase()
    const type = String(req.query.type ?? '')
    const remote = String(req.query.remote ?? '')
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 10)

    const filter: Record<string, unknown> = { status: 'published' }
    if (type) filter.type = type
    if (remote) filter.remote = remote

    let jobs = await JobModel.find(filter).lean()
    if (search) {
      jobs = jobs.filter((j) =>
        [j.title, j.department ?? '', j.location ?? ''].some((v) => v.toLowerCase().includes(search)),
      )
    }

    res.json(paginate(jobs.map((j) => ({ ...j, _id: String(j._id) })), page, limit))
  } catch (err) {
    next(err)
  }
})

// GET /jobs/mine — recruiter/admin
jobsRouter.get('/mine', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 10)
    const status = String(req.query.status ?? '')

    const filter: Record<string, unknown> = { createdBy: req.user!._id }
    if (status) filter.status = status

    const jobs = await JobModel.find(filter).sort({ createdAt: -1 }).lean()
    res.json(paginate(jobs.map((j) => ({ ...j, _id: String(j._id) })), page, limit))
  } catch (err) {
    next(err)
  }
})

// GET /jobs/:id — public
jobsRouter.get('/:id', async (req, res, next) => {
  try {
    const job = await getJobById(String(req.params.id))
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) {
    next(err)
  }
})

// POST /jobs
jobsRouter.post('/', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const job = await JobModel.create({
      company: req.body.company ?? 'company-default',
      title: req.body.title ?? 'New Role',
      department: req.body.department ?? 'General',
      location: req.body.location ?? 'Remote',
      type: req.body.type ?? 'full-time',
      remote: req.body.remote ?? 'remote',
      description: req.body.description ?? '',
      requirements: req.body.requirements ?? [],
      responsibilities: req.body.responsibilities ?? [],
      skills: req.body.skills ?? [],
      salaryCurrency: req.body.salaryCurrency ?? 'USD',
      salaryMin: req.body.salaryMin,
      salaryMax: req.body.salaryMax,
      status: 'draft',
      assessmentModules: req.body.assessmentModules ?? [],
      thresholds: req.body.thresholds ?? { screening: 0.5, assessment: 70, fairness: 0.5, interview: 70 },
      alpha: req.body.alpha ?? 0.4,
      createdBy: req.user!._id,
    })
    await logAction({ actor: 'user', action: 'job-create', jobId: String(job._id), mode: 'assist' })
    res.status(201).json({ ...job.toJSON(), _id: String(job._id) })
  } catch (err) {
    next(err)
  }
})

// PATCH /jobs/:id
jobsRouter.patch('/:id', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const job = await JobModel.findByIdAndUpdate(String(req.params.id), req.body, { new: true }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    await logAction({ actor: 'user', action: 'job-update', jobId: String(job._id), mode: 'assist' })
    res.json({ ...job, _id: String(job._id) })
  } catch (err) {
    next(err)
  }
})

// POST /jobs/:id/publish
jobsRouter.post('/:id/publish', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const minQuestions = 3
    const categories = ['aptitude', 'technical', 'situational', 'personality']
    const counts = await Promise.all(categories.map((c) => QuestionBankModel.countDocuments({ category: c })))
    const missing = categories.filter((_c, i) => counts[i] < minQuestions)
    if (missing.length) {
      throw new HttpError(400, `Question bank incomplete. Need at least ${minQuestions} questions in: ${missing.join(', ')}`)
    }

    const job = await JobModel.findByIdAndUpdate(String(req.params.id), { status: 'published' }, { new: true }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) {
    next(err)
  }
})

// POST /jobs/:id/close
jobsRouter.post('/:id/close', requireAuth, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const job = await JobModel.findByIdAndUpdate(String(req.params.id), { status: 'closed' }, { new: true }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) {
    next(err)
  }
})

// GET /jobs/:jobId/question-banks/:metric — legacy endpoint kept for compatibility
jobsRouter.get('/:jobId/question-banks/:metric', requireAuth, requireRole('recruiter', 'admin'), (req, res) => {
  res.json({
    jobId: req.params.jobId,
    metric: req.params.metric,
    items: [{ stem: `Sample ${req.params.metric} question`, type: 'mcq', difficulty: 'medium', tags: ['scaffold'] }],
  })
})
