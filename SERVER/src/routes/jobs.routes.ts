import { Router } from 'express'
import { JobModel } from '../models/Job.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { logAction } from '../data/store.js'

export const jobsRouter = Router()

// ── GET /jobs — public, published only ───────────────────────────────────────
jobsRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').toLowerCase()
    const type = String(req.query.type ?? '')
    const remote = String(req.query.remote ?? '')
    const page = Math.max(1, Number(req.query.page ?? 1) || 1)
    const limit = Math.max(1, Number(req.query.limit ?? 10) || 10)
    const skip = (page - 1) * limit
    const filter: Record<string, unknown> = { status: 'published' }
    if (type) filter.type = type
    if (remote) filter.remote = remote
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { department: { $regex: search, $options: 'i' } },
      { location: { $regex: search, $options: 'i' } },
    ]
    const [jobs, total] = await Promise.all([
      JobModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      JobModel.countDocuments(filter),
    ])
    res.json({
      data: jobs,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (err) { next(err) }
})

// ── GET /jobs/mine — recruiter's own jobs (admins see all) ────────────────────
jobsRouter.get('/mine', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1)
    const limit = Math.max(1, Number(req.query.limit ?? 10) || 10)
    const skip = (page - 1) * limit
    const status = String(req.query.status ?? '')
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin'
    // Admins see ALL company jobs; recruiters see only their own
    const filter: Record<string, unknown> = isAdmin ? {} : { createdBy: req.user!._id }
    if (status) filter.status = status
    const [jobs, total] = await Promise.all([
      JobModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      JobModel.countDocuments(filter),
    ])
    res.json({
      data: jobs,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    })
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
// Delegates to the real question bank — returns questions for this job + module type
jobsRouter.get('/:jobId/question-banks/:metric', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { QuestionBankModel } = await import('../models/QuestionBank.model.js')
    const items = await QuestionBankModel.find({
      category: req.params.metric,
    }).sort({ createdAt: -1 }).limit(50).lean()
    res.json({ jobId: req.params.jobId, metric: req.params.metric, items: items.map((q) => ({ ...q, _id: String(q._id) })) })
  } catch (err) { next(err) }
})

// ── PATCH /jobs/:id/thresholds ────────────────────────────────────────────────
jobsRouter.patch('/:id/thresholds', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const job = await JobModel.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user!._id },
      { thresholds: req.body },
      { new: true }
    ).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})
