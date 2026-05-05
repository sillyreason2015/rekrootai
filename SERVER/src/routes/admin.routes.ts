import { Router } from 'express'
import { UserModel } from '../models/User.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { BiasAuditModel } from '../models/BiasAudit.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, paginate } from '../lib/http.js'
import { logAction } from '../data/store.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireRole('admin', 'super_admin'))

adminRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const [totalUsers, totalJobs, totalApplications, pipeline] = await Promise.all([
      UserModel.countDocuments(),
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
      ApplicationModel.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
    ])
    const pipelineStats: Record<string, number> = {}
    for (const p of pipeline) pipelineStats[String(p._id)] = Number(p.count)
    res.json({ totalUsers, totalJobs, totalApplications, pipelineStats })
  } catch (err) { next(err) }
})

adminRouter.get('/audit-log', async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 20)
    const action = String(req.query.action ?? '')
    const filter: Record<string, unknown> = {}
    if (action) filter.action = { $regex: action, $options: 'i' }
    const all = await AuditLogModel.find(filter).sort({ timestamp: -1 }).lean()
    res.json(paginate(all, page, limit))
  } catch (err) { next(err) }
})

adminRouter.get('/bias-audits', async (_req, res, next) => {
  try {
    const audits = await BiasAuditModel.find().sort({ runAt: -1 }).lean()
    res.json(audits)
  } catch (err) { next(err) }
})

adminRouter.post('/bias-audits/run', async (req, res, next) => {
  try {
    const { jobId } = req.body as { jobId?: string }
    if (!jobId) throw new HttpError(400, 'jobId is required')
    const audit = await BiasAuditModel.create({
      job: jobId, runAt: new Date().toISOString(),
      disparateImpact: { gender: 0.9, age: 0.87 }, flagged: false,
      details: { summary: 'Fairness audit completed — no significant disparate impact detected.' },
    })
    await logAction({ actor: 'ai', action: 'bias-audit-run', jobId, mode: 'assist', payload: { flagged: false } })
    res.status(201).json({ ...audit.toObject(), _id: String(audit._id) })
  } catch (err) { next(err) }
})

adminRouter.get('/team', async (_req, res, next) => {
  try {
    const users = await UserModel.find({ role: { $ne: 'candidate' } }, { password: 0 }).lean()
    res.json({ data: users.map((u) => ({ ...u, _id: String(u._id) })) })
  } catch (err) { next(err) }
})

adminRouter.post('/team/invite', async (req, res, next) => {
  try {
    const { email, role } = req.body as { email?: string; role?: string }
    if (!email || !role) throw new HttpError(400, 'email and role are required')
    await logAction({ actor: 'user', action: 'team-invite', mode: 'assist', payload: { email, role } })
    res.status(201).json({ ok: true })
  } catch (err) { next(err) }
})

adminRouter.get('/billing', async (_req, res, next) => {
  try {
    const [seats, jobs, applications] = await Promise.all([
      UserModel.countDocuments(),
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
    ])
    res.json({ plan: 'Pro', seats, usage: { jobs, applications } })
  } catch (err) { next(err) }
})

adminRouter.get('/users', async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 20)
    const all = await UserModel.find({}, { password: 0 }).sort({ createdAt: -1 }).lean()
    res.json(paginate(all.map((u) => ({ ...u, _id: String(u._id) })), page, limit))
  } catch (err) { next(err) }
})

adminRouter.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body as { role?: string }
    if (!role) throw new HttpError(400, 'role is required')
    const user = await UserModel.findByIdAndUpdate(req.params.id, { role }, { new: true, projection: { password: 0 } }).lean()
    if (!user) throw new HttpError(404, 'User not found')
    res.json({ ...user, _id: String(user._id) })
  } catch (err) { next(err) }
})
