import { Router } from 'express'
import { JobModel } from '../models/Job.model.js'
import { CompanyModel } from '../models/Company.model.js'
import { UserModel } from '../models/User.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { logAction } from '../data/store.js'

export const jobsRouter = Router()

async function resolveCompanyScope(userId: string) {
  const me = await UserModel.findById(userId, { companyName: 1 }).lean()
  const rawCompanyName = me?.companyName?.trim()

  const ownedCompany = await CompanyModel.findOne({
    $or: [
      { createdBy: userId },
      ...(rawCompanyName ? [{ name: rawCompanyName }, { legalName: rawCompanyName }] : []),
    ],
  }).lean()

  if (ownedCompany?._id) {
    return {
      companyId: String(ownedCompany._id),
      companyNames: [ownedCompany.name, ownedCompany.legalName, rawCompanyName].filter(Boolean) as string[],
    }
  }

  return {
    companyId: null,
    companyNames: rawCompanyName ? [rawCompanyName] : [],
  }
}

async function buildScopedJobFilter(userId: string) {
  const { companyId } = await resolveCompanyScope(userId)
  return companyId ? { company: companyId } : { createdBy: userId }
}

async function findScopedJob(userId: string, jobId: string) {
  const filter = await buildScopedJobFilter(userId)
  return JobModel.findOne({ _id: jobId, ...filter }).lean()
}

// GET /jobs - public, published only
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

// GET /jobs/mine - company jobs visible to recruiter/admin workspace members
jobsRouter.get('/mine', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1)
    const limit = Math.max(1, Number(req.query.limit ?? 10) || 10)
    const skip = (page - 1) * limit
    const status = String(req.query.status ?? '')
    const filter: Record<string, unknown> = await buildScopedJobFilter(req.user!._id)
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

// GET /jobs/:id
jobsRouter.get('/:id', async (req, res, next) => {
  try {
    const job = await JobModel.findById(req.params.id).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// POST /jobs
jobsRouter.post('/', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>
    const { companyId } = await resolveCompanyScope(req.user!._id)
    if (!companyId) throw new HttpError(400, 'Create or complete your company profile before posting a job.')

    const normalisedDepartmentHiring = Array.isArray(body.departmentHiring)
      ? (body.departmentHiring as Array<Record<string, unknown>>)
          .map((entry) => ({
            department: String(entry.department ?? body.department ?? '').trim(),
            seats: Number(entry.seats ?? 1),
          }))
          .filter((entry) => entry.department && entry.seats > 0)
      : []

    const validModuleTypes = new Set(['aptitude', 'technical', 'situational', 'personality', 'values'])
    const normalisedAssessmentModules = Array.isArray(body.assessmentModules)
      ? (body.assessmentModules as Array<Record<string, unknown>>)
          .map((module) => {
            const rawType = String(module.type ?? 'technical')
            const type = validModuleTypes.has(rawType) ? rawType as 'aptitude' | 'technical' | 'situational' | 'personality' | 'values' : 'technical'
            return {
              type,
              timeLimit: Number(module.timeLimit ?? 20),
              weight: Number(module.weight ?? 0.25),
            }
          })
      : []

    const jobPayload = {
      ...body,
      company: companyId,
      status: body.status === 'published' ? 'published' : 'draft',
      aiMode: ['assist', 'veto', 'override'].includes(String(body.aiMode ?? ''))
        ? body.aiMode
        : 'assist',
      departmentHiring: normalisedDepartmentHiring,
      assessmentModules: normalisedAssessmentModules,
      createdBy: req.user!._id,
    }
    const job = await JobModel.create(jobPayload as Record<string, unknown>)
    await logAction({ actor: 'user', action: 'job-created', jobId: String(job._id), mode: 'assist' })
    res.status(201).json({ ...job.toObject(), _id: String(job._id) })
  } catch (err) { next(err) }
})

// PATCH /jobs/:id
jobsRouter.patch('/:id', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const jobId = String(req.params.id)
    const existing = await findScopedJob(req.user!._id, jobId)
    if (!existing) throw new HttpError(404, 'Job not found')
    const job = await JobModel.findByIdAndUpdate(jobId, req.body as Record<string, unknown>, { new: true }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    await logAction({ actor: 'user', action: 'job-updated', jobId: String(job._id), mode: 'assist' })
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// POST /jobs/:id/publish
jobsRouter.post('/:id/publish', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const jobId = String(req.params.id)
    const existing = await findScopedJob(req.user!._id, jobId)
    if (!existing) throw new HttpError(404, 'Job not found')
    const job = await JobModel.findByIdAndUpdate(jobId, { status: 'published' }, { new: true }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    await logAction({ actor: 'user', action: 'job-published', jobId: String(job._id), mode: 'assist' })
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// POST /jobs/:id/close
jobsRouter.post('/:id/close', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const jobId = String(req.params.id)
    const existing = await findScopedJob(req.user!._id, jobId)
    if (!existing) throw new HttpError(404, 'Job not found')
    const job = await JobModel.findByIdAndUpdate(jobId, { status: 'closed' }, { new: true }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// DELETE /jobs/:id
jobsRouter.delete('/:id', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const jobId = String(req.params.id)
    const job = await findScopedJob(req.user!._id, jobId)
    if (!job) throw new HttpError(404, 'Job not found')
    if (job.status === 'published') throw new HttpError(400, 'Close the job before deleting it')
    await JobModel.deleteOne({ _id: jobId })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// GET /jobs/:jobId/question-banks/:metric
jobsRouter.get('/:jobId/question-banks/:metric', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const jobId = String(req.params.jobId)
    const metric = String(req.params.metric)
    const existing = await findScopedJob(req.user!._id, jobId)
    if (!existing) throw new HttpError(404, 'Job not found')
    const { QuestionBankModel } = await import('../models/QuestionBank.model.js')
    const items = await QuestionBankModel.find({
      category: metric,
    }).sort({ createdAt: -1 }).limit(50).lean()
    res.json({ jobId, metric, items: items.map((q) => ({ ...q, _id: String(q._id) })) })
  } catch (err) { next(err) }
})

// PATCH /jobs/:id/thresholds
jobsRouter.patch('/:id/thresholds', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const jobId = String(req.params.id)
    const existing = await findScopedJob(req.user!._id, jobId)
    if (!existing) throw new HttpError(404, 'Job not found')
    const job = await JobModel.findByIdAndUpdate(
      jobId,
      { thresholds: req.body },
      { new: true },
    ).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})
