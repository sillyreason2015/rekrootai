import { Router } from 'express'
import { JobModel } from '../models/Job.model.js'
import { UserModel } from '../models/User.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { logAction } from '../data/store.js'
import { notify } from '../lib/notify.js'
import { buildTeamScopedJobFilter, pickRoundRobinRecruiter, resolveEffectiveTeamScope, resolveWorkspaceScope } from '../lib/workspace.js'
import { sendEmail } from '../lib/mail.js'

export const jobsRouter = Router()

async function buildScopedJobFilterForTeam(userId: string, requestedTeamName?: string) {
  const scope = await resolveEffectiveTeamScope(userId, requestedTeamName)
  return buildTeamScopedJobFilter(scope, userId)
}

async function findScopedJob(userId: string, jobId: string) {
  const filter = await buildScopedJobFilterForTeam(userId, undefined)
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
      JobModel.find(filter).populate('assignedRecruiter', 'firstName lastName email role').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
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
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const filter: Record<string, unknown> = await buildScopedJobFilterForTeam(req.user!._id, requestedTeamName)
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
    const scope = await resolveWorkspaceScope(req.user!._id)
    const { companyId, teamName } = scope
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

    const selectedTeamName =
      (typeof body.teamName === 'string' && body.teamName.trim()) ||
      teamName ||
      undefined

    const assignmentMode = scope.company?.assignmentMode ?? 'round_robin'
    const { assignedRecruiter } = assignmentMode === 'manual'
      ? { assignedRecruiter: null }
      : await pickRoundRobinRecruiter(req.user!._id)
    const assignmentMethod = assignmentMode === 'manual'
      ? 'manual'
      : assignedRecruiter?._id === req.user!._id
        ? 'solo_owner'
        : assignedRecruiter?._id
          ? 'round_robin'
          : 'manual'

    const jobPayload = {
      ...body,
      company: companyId,
      teamName: selectedTeamName,
      status: body.status === 'published' ? 'published' : 'draft',
      aiMode: ['assist', 'veto', 'override'].includes(String(body.aiMode ?? ''))
        ? body.aiMode
        : 'assist',
      departmentHiring: normalisedDepartmentHiring,
      assessmentModules: normalisedAssessmentModules,
      createdBy: req.user!._id,
      assignedRecruiter: assignedRecruiter?._id,
      assignedRecruiterAt: assignedRecruiter?._id ? new Date().toISOString() : undefined,
      assignmentMethod,
      assignmentHistory: assignedRecruiter?._id ? [{
        recruiterId: assignedRecruiter._id,
        assignedBy: req.user!._id,
        method: assignmentMethod,
        at: new Date().toISOString(),
      }] : [],
    }
    const job = await JobModel.create(jobPayload as Record<string, unknown>)
    await logAction({
      actor: 'user',
      action: 'job-created',
      jobId: String(job._id),
      mode: 'assist',
      payload: {
        teamName: selectedTeamName ?? '',
        assignedRecruiterId: assignedRecruiter?._id ?? '',
        assignmentMethod,
      },
    })
    if (assignedRecruiter?._id) {
      notify(assignedRecruiter._id, {
        type: 'job_assigned',
        title: 'New job assigned',
        body: `${String(body.title ?? 'A new job')} has been assigned to you${selectedTeamName ? ` for the ${selectedTeamName} team` : ''}.`,
        link: '/recruiter/jobs',
      })
      if (assignedRecruiter.email) {
        sendEmail({
          to: assignedRecruiter.email,
          subject: `[${String(body.title ?? 'New job')}] Job assigned to you`,
          text: `${String(body.title ?? 'A new job')} has been assigned to you${selectedTeamName ? ` for the ${selectedTeamName} team` : ''}. Sign in to RekrootAI to review the role and begin managing the pipeline.`,
          html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><p><strong>${String(body.title ?? 'A new job')}</strong> has been assigned to you${selectedTeamName ? ` for the <strong>${selectedTeamName}</strong> team` : ''}.</p><p>Sign in to RekrootAI to review the role and begin managing the pipeline.</p></div>`,
        }).catch((err) => {
          console.error('[jobs] Failed to send assignment email:', err)
        })
      }
    }
    res.status(201).json({ ...job.toObject(), _id: String(job._id) })
  } catch (err) { next(err) }
})

jobsRouter.patch('/:id/assignment', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const jobId = String(req.params.id)
    const existing = await findScopedJob(req.user!._id, jobId)
    if (!existing) throw new HttpError(404, 'Job not found')
    const { recruiterId, note } = req.body as { recruiterId?: string | null; note?: string }
    if (!recruiterId) {
      const updated = await JobModel.findByIdAndUpdate(
        jobId,
        {
          $unset: { assignedRecruiter: '', assignedRecruiterAt: '' },
          $set: { assignmentMethod: 'manual' },
          $push: {
            assignmentHistory: {
              recruiterId: '',
              assignedBy: req.user!._id,
              method: 'manual',
              note: note?.trim() || 'Assignment cleared',
              at: new Date().toISOString(),
            },
          },
        },
        { new: true },
      ).lean()
      return res.json({ ...updated, _id: String(updated!._id) })
    }

    const scope = await resolveWorkspaceScope(req.user!._id)
    const recruiter = await UserModel.findOne({
      _id: recruiterId,
      role: { $in: ['recruiter', 'admin', 'super_admin'] },
      ...(scope.companyNames.length ? { companyName: { $in: scope.companyNames } } : {}),
      ...(scope.teamName ? { teamName: existing.teamName ?? scope.teamName } : {}),
    }, { firstName: 1, lastName: 1, email: 1 }).lean()
    if (!recruiter) throw new HttpError(404, 'Recruiter not found in this team')

    const updated = await JobModel.findByIdAndUpdate(
      jobId,
      {
        assignedRecruiter: String(recruiter._id),
        assignedRecruiterAt: new Date().toISOString(),
        assignmentMethod: 'manual',
        $push: {
          assignmentHistory: {
            recruiterId: String(recruiter._id),
            assignedBy: req.user!._id,
            method: 'manual',
            note: note?.trim(),
            at: new Date().toISOString(),
          },
        },
      },
      { new: true },
    ).lean()
    notify(String(recruiter._id), {
      type: 'job_assigned',
      title: 'Job ownership updated',
      body: `${existing.title} has been assigned to you manually${note?.trim() ? `: ${note.trim()}` : '.'}`,
      link: '/recruiter/jobs',
    })
    if (recruiter.email) {
      sendEmail({
        to: recruiter.email,
        subject: `[${existing.title}] Job reassigned to you`,
        text: `${existing.title} has been assigned to you manually.${note?.trim() ? `\n\nHandoff note: ${note.trim()}` : ''}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><p><strong>${existing.title}</strong> has been assigned to you manually.</p>${note?.trim() ? `<p><strong>Handoff note:</strong> ${note.trim()}</p>` : ''}</div>`,
      }).catch((err) => console.error('[jobs] Failed to send reassignment email:', err))
    }
    await logAction({ actor: 'user', action: 'job-assignment-updated', jobId, mode: 'assist', payload: { recruiterId, note: note ?? '', method: 'manual' } })
    res.json({ ...updated, _id: String(updated!._id) })
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
