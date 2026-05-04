import { Router } from 'express'
import { db, getJobById, logAction } from '../data/mockStore.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, paginate, nowIso } from '../lib/http.js'

export const jobsRouter = Router()

jobsRouter.get('/', (req, res) => {
  const search = String(req.query.search ?? '').toLowerCase()
  const type = String(req.query.type ?? '')
  const remote = String(req.query.remote ?? '')
  const page = Number(req.query.page ?? 1)
  const limit = Number(req.query.limit ?? 10)
  const filtered = db.jobs.filter((job) => {
    const matchesSearch = !search || [job.title, job.department, job.location].some((value) => value.toLowerCase().includes(search))
    const matchesType = !type || job.type === type
    const matchesRemote = !remote || job.remote === remote
    return matchesSearch && matchesType && matchesRemote && job.status !== 'draft'
  })
  res.json(paginate(filtered, page, limit))
})

jobsRouter.get('/mine', requireAuth, requireRole('recruiter', 'admin'), (req, res) => {
  const page = Number(req.query.page ?? 1)
  const limit = Number(req.query.limit ?? 10)
  const status = String(req.query.status ?? '')
  const jobs = db.jobs.filter((job) => job.createdBy === req.user?._id && (!status || job.status === status))
  res.json(paginate(jobs, page, limit))
})

jobsRouter.get('/:id', (req, res, next) => {
  try {
    const job = getJobById(String(req.params.id))
    if (!job) throw new HttpError(404, 'Job not found')
    res.json(job)
  } catch (error) {
    next(error)
  }
})

jobsRouter.post('/', requireAuth, requireRole('recruiter', 'admin'), (req, res) => {
  const job = {
    _id: `job-${db.jobs.length + 1}`,
    company: 'company-1',
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
    status: 'draft' as const,
    assessmentModules: req.body.assessmentModules ?? [],
    thresholds: req.body.thresholds ?? { tau1: 0.5, tau2: 70 },
    alpha: req.body.alpha ?? 0.4,
    createdBy: req.user?._id ?? 'mock-recruiter',
    createdAt: nowIso(),
  }
  db.jobs.unshift(job)
  logAction({ actor: 'user', action: 'job-create', jobId: job._id, mode: 'assist' })
  res.status(201).json(job)
})

jobsRouter.patch('/:id', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const job = getJobById(String(req.params.id))
    if (!job) throw new HttpError(404, 'Job not found')
    Object.assign(job, req.body)
    logAction({ actor: 'user', action: 'job-update', jobId: job._id, mode: 'assist' })
    res.json(job)
  } catch (error) {
    next(error)
  }
})

jobsRouter.post('/:id/publish', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const job = getJobById(String(req.params.id))
    if (!job) throw new HttpError(404, 'Job not found')
    job.status = 'published'
    res.json(job)
  } catch (error) {
    next(error)
  }
})

jobsRouter.post('/:id/close', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const job = getJobById(String(req.params.id))
    if (!job) throw new HttpError(404, 'Job not found')
    job.status = 'closed'
    res.json(job)
  } catch (error) {
    next(error)
  }
})

jobsRouter.get('/:jobId/question-banks/:metric', requireAuth, requireRole('recruiter', 'admin'), (req, res) => {
  res.json({
    jobId: req.params.jobId,
    metric: req.params.metric,
    items: [
      {
        stem: `Sample ${req.params.metric} question`,
        type: 'mcq',
        difficulty: 'medium',
        tags: ['scaffold'],
      },
    ],
  })
})
