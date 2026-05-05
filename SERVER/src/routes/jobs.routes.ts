import { Router } from 'express'
import { JobModel } from '../models/Job.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, paginate } from '../lib/http.js'
import { logAction } from '../data/store.js'

export const jobsRouter = Router()

// ── GET /jobs — public, published only ───────────────────────────────────────
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
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { department: { $regex: search, $options: 'i' } },
      { location: { $regex: search, $options: 'i' } },
    ]
    const all = await JobModel.find(filter).sort({ createdAt: -1 }).lean()
    res.json(paginate(all, page, limit))
  } catch (err) { next(err) }
})

// ── GET /jobs/mine — recruiter's own jobs ─────────────────────────────────────
jobsRouter.get('/mine', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 10)
    const status = String(req.query.status ?? '')
    const filter: Record<string, unknown> = { createdBy: req.user!._id }
    if (status) filter.status = status
    const all = await JobModel.find(filter).sort({ createdAt: -1 }).lean()
    res.json(paginate(all, page, limit))
  } catch (err) { next(err) }
})

// ── GET /jobs/:id ─────────────────────────────────────────────────────────────
jobsRouter.get('/:id', async (req, res, next) => {
  try {
    const job = await JobModel.findById(req.params.id).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// ── POST /jobs ────────────────────────────────────────────────────────────────
jobsRouter.post('/', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>
    const job = await JobModel.create({
      ...body,
      status: 'draft',
      createdBy: req.user!._id,
    })
    await logAction({ actor: 'user', action: 'job-created', jobId: String(job._id), mode: 'assist' })
    res.status(201).json({ ...job.toObject(), _id: String(job._id) })
  } catch (err) { next(err) }
})

// ── PATCH /jobs/:id ───────────────────────────────────────────────────────────
jobsRouter.patch('/:id', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const job = await JobModel.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user!._id },
      req.body as Record<string, unknown>,
      { new: true },
    ).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    await logAction({ actor: 'user', action: 'job-updated', jobId: String(job._id), mode: 'assist' })
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// ── POST /jobs/:id/publish ────────────────────────────────────────────────────
jobsRouter.post('/:id/publish', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const job = await JobModel.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user!._id },
      { status: 'published' },
      { new: true },
    ).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    await logAction({ actor: 'user', action: 'job-published', jobId: String(job._id), mode: 'assist' })
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// ── POST /jobs/:id/close ──────────────────────────────────────────────────────
jobsRouter.post('/:id/close', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const job = await JobModel.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user!._id },
      { status: 'closed' },
      { new: true },
    ).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// ── DELETE /jobs/:id ──────────────────────────────────────────────────────────
jobsRouter.delete('/:id', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const job = await JobModel.findOne({ _id: req.params.id, createdBy: req.user!._id }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    if (job.status === 'published') throw new HttpError(400, 'Close the job before deleting it')
    await JobModel.deleteOne({ _id: req.params.id })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /jobs/:jobId/question-banks/:metric ───────────────────────────────────
jobsRouter.get('/:jobId/question-banks/:metric', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), (req, res) => {
  res.json({
    jobId: req.params.jobId,
    metric: req.params.metric,
    items: [{ stem: `Sample ${req.params.metric} question`, type: 'mcq', difficulty: 'medium', tags: [] }],
  })
})
