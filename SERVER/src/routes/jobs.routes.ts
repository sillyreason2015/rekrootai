import { Router } from 'express'
import { JobModel } from '../models/Job.model.js'
import { QuestionBankModel } from '../models/QuestionBank.model.js'
import { UserModel } from '../models/User.model.js'
import { CompanyModel } from '../models/Company.model.js'
import { getJobById, logAction } from '../data/store.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, paginate } from '../lib/http.js'

export const jobsRouter = Router()

async function assertCompanyVerifiedForJobActions(userId: string, role?: string) {
  if (role === 'super_admin') return
  const me = await UserModel.findById(userId).lean()
  if (!me?.companyName) throw new HttpError(403, 'Company verification required before job actions')
  const company = await CompanyModel.findOne({
    $or: [{ name: me.companyName }, { legalName: me.companyName }],
  }).lean()
  if (!company?.isVerified) throw new HttpError(403, 'Company pending super-admin verification')
}

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
  } catch (err) { next(err) }
})

jobsRouter.get('/mine', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 10)
    const status = String(req.query.status ?? '')
    const filter: Record<string, unknown> = { createdBy: req.user!._id }
    if (status) filter.status = status
    const jobs = await JobModel.find(filter).sort({ createdAt: -1 }).lean()
    res.json(paginate(jobs.map((j) => ({ ...j, _id: String(j._id) })), page, limit))
  } catch (err) { next(err) }
})

jobsRouter.get('/:id', async (req, res, next) => {
  try {
    const job = await getJobById(String(req.params.id))
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

jobsRouter.post('/', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    await assertCompanyVerifiedForJobActions(req.user!._id, req.user?.role)
    const job = await JobModel.create({
      company: req.body.company ?? 'company-default',
      title: req.body.title ?? 'New Role',
      department: req.body.department ?? 'General',
      level: req.body.level ?? 'mid',
      departments: req.body.departments ?? [],
      hiringPlan: req.body.hiringPlan ?? undefined,
      positionsCount: Number(req.body.positionsCount ?? 1),
      departmentHiring: Array.isArray(req.body.departmentHiring) ? req.body.departmentHiring : [],
      requiresQuestionnaire: Boolean(req.body.requiresQuestionnaire ?? false),
      applicationQuestions: Array.isArray(req.body.applicationQuestions) ? req.body.applicationQuestions : [],
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
      status: req.body.status === 'published' ? 'published' : 'draft',
      assessmentModules: req.body.assessmentModules ?? [],
      thresholds: req.body.thresholds ?? { screening: 0.5, assessment: 70, fairness: 0.5, interview: 70 },
      alpha: req.body.alpha ?? 0.4,
      createdBy: req.user!._id,
    })
    await logAction({ actor: 'user', action: 'job-create', jobId: String(job._id), mode: 'assist' })
    res.status(201).json({ ...job.toJSON(), _id: String(job._id) })
  } catch (err) { next(err) }
})

jobsRouter.patch('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    await assertCompanyVerifiedForJobActions(req.user!._id, req.user?.role)
    const job = await JobModel.findByIdAndUpdate(String(req.params.id), req.body, { new: true }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    await logAction({ actor: 'user', action: 'job-update', jobId: String(job._id), mode: 'assist' })
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

jobsRouter.post('/:id/publish', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    await assertCompanyVerifiedForJobActions(req.user!._id, req.user?.role)
    const minQuestions = 3
    const categories = ['aptitude', 'technical', 'situational', 'personality']
    const me = await UserModel.findById(req.user!._id).lean()
    const baseFilter: Record<string, unknown> = req.user?.role === 'super_admin'
      ? {}
      : { companyName: me?.companyName ?? '__none__' }
    const counts = await Promise.all(
      categories.map((c) => QuestionBankModel.countDocuments({ ...baseFilter, category: c })),
    )
    const missing = categories.filter((_c, i) => counts[i] < minQuestions)
    if (missing.length) throw new HttpError(400, `Question bank incomplete. Need at least ${minQuestions} questions in: ${missing.join(', ')}`)
    const job = await JobModel.findByIdAndUpdate(String(req.params.id), { status: 'published' }, { new: true }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// PATCH /jobs/:id/thresholds — admin or the job's creator can update AI thresholds
jobsRouter.patch('/:id/thresholds', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const job = await JobModel.findById(String(req.params.id)).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    // Only creator or admin can edit
    const isCreator = String(job.createdBy) === String(req.user!._id)
    const isAdmin = ['admin', 'super_admin'].includes(req.user!.role ?? '')
    if (!isCreator && !isAdmin) throw new HttpError(403, 'Not authorised to update this job')

    const { assessment, fairness, interview } = req.body as {
      assessment?: number; fairness?: number; interview?: number
    }
    const update: Record<string, unknown> = {}
    if (assessment !== undefined) update['thresholds.assessment'] = Number(assessment)
    if (fairness !== undefined) update['thresholds.fairness'] = Number(fairness)
    if (interview !== undefined) update['thresholds.interview'] = Number(interview)

    const updated = await JobModel.findByIdAndUpdate(String(req.params.id), { $set: update }, { new: true }).lean()
    await logAction({ actor: 'user', action: 'job-thresholds-update', jobId: String(req.params.id), mode: 'assist', payload: req.body as Record<string, unknown> })
    res.json({ ...updated, _id: String(updated!._id) })
  } catch (err) { next(err) }
})

jobsRouter.post('/:id/close', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    await assertCompanyVerifiedForJobActions(req.user!._id, req.user?.role)
    const job = await JobModel.findByIdAndUpdate(String(req.params.id), { status: 'closed' }, { new: true }).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    res.json({ ...job, _id: String(job._id) })
  } catch (err) { next(err) }
})

// DELETE /jobs/:id — permanently removes draft jobs; published/closed jobs are archived instead
jobsRouter.delete('/:id', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    await assertCompanyVerifiedForJobActions(req.user!._id, req.user?.role)
    const job = await JobModel.findById(String(req.params.id)).lean()
    if (!job) throw new HttpError(404, 'Job not found')

    if (job.status === 'published') {
      // Protect published jobs — close first, then delete
      throw new HttpError(400, 'Cannot delete a published job. Close it first.')
    }

    await JobModel.findByIdAndDelete(String(req.params.id))
    await logAction({ actor: 'user', action: 'job-deleted', jobId: String(req.params.id), mode: 'assist' })
    res.json({ ok: true, deleted: String(req.params.id) })
  } catch (err) { next(err) }
})

jobsRouter.get('/:jobId/question-banks/:metric', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), (req, res) => {
  res.json({
    jobId: req.params.jobId,
    metric: req.params.metric,
    items: [{ stem: `Sample ${req.params.metric} question`, type: 'mcq', difficulty: 'medium', tags: ['scaffold'] }],
  })
})
