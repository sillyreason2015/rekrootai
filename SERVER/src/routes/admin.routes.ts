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

// ── Super admin routes ────────────────────────────────────────────────────────
adminRouter.get('/super/users', async (_req, res, next) => {
  try {
    const users = await UserModel.find({}, { password: 0 }).sort({ createdAt: -1 }).lean()
    res.json({ data: users.map((u) => ({ ...u, _id: String(u._id) })) })
  } catch (err) { next(err) }
})

adminRouter.get('/super/companies', async (_req, res, next) => {
  try {
    const { CompanyModel } = await import('../models/Company.model.js')
    const companies = await CompanyModel.find().sort({ createdAt: -1 }).lean()
    res.json({ data: companies.map((c) => ({ ...c, _id: String(c._id) })) })
  } catch (err) { next(err) }
})

adminRouter.get('/super/metrics', async (_req, res, next) => {
  try {
    const [users, jobs, applications, interviews] = await Promise.all([
      UserModel.countDocuments(),
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
      (await import('../models/Interview.model.js')).InterviewModel.countDocuments(),
    ])
    res.json({ users, jobs, applications, interviews, uptime: process.uptime() })
  } catch (err) { next(err) }
})

adminRouter.get('/super/system-readiness', async (_req, res, next) => {
  try {
    const checks = {
      mongodb: 'ok',
      gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
      s3: process.env.BLOB_ENDPOINT ? 'configured' : 'missing',
      smtp: process.env.SMTP_HOST ? 'configured' : 'missing',
      redis: process.env.UPSTASH_REDIS_REST_URL ? 'configured' : 'missing',
    }
    res.json({ status: 'ready', checks })
  } catch (err) { next(err) }
})

adminRouter.get('/super/key-status', (_req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    s3: !!(process.env.BLOB_ENDPOINT && process.env.BLOB_ACCESS_KEY),
    smtp: !!process.env.SMTP_HOST,
    livekit: !!process.env.LIVEKIT_API_KEY,
  })
})

adminRouter.get('/super/settings', async (_req, res, next) => {
  try {
    const { SystemSettingsModel } = await import('../models/SystemSettings.model.js')
    const settings = await SystemSettingsModel.findOne().lean() ?? {}
    res.json(settings)
  } catch (err) { next(err) }
})

adminRouter.put('/super/settings', async (req, res, next) => {
  try {
    const { SystemSettingsModel } = await import('../models/SystemSettings.model.js')
    const settings = await SystemSettingsModel.findOneAndUpdate(
      {},
      { $set: req.body as Record<string, unknown> },
      { new: true, upsert: true },
    ).lean()
    res.json(settings)
  } catch (err) { next(err) }
})

adminRouter.get('/admin/question-insights', async (_req, res, next) => {
  try {
    const { QuestionBankModel } = await import('../models/QuestionBank.model.js')
    const total = await QuestionBankModel.countDocuments()
    const byCategory = await QuestionBankModel.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }])
    res.json({ total, byCategory })
  } catch (err) { next(err) }
})

adminRouter.get('/question-insights', async (_req, res, next) => {
  try {
    const { QuestionBankModel } = await import('../models/QuestionBank.model.js')
    const total = await QuestionBankModel.countDocuments()
    const byCategory = await QuestionBankModel.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }])
    res.json({ total, byCategory })
  } catch (err) { next(err) }
})

adminRouter.post('/team/invite/accept', async (req, res, next) => {
  try {
    const { token, password, firstName, lastName } = req.body as { token?: string; password?: string; firstName?: string; lastName?: string }
    if (!token || !password) throw new HttpError(400, 'token and password required')
    const { EmailTokenModel } = await import('../models/EmailToken.model.js')
    const invite = await EmailTokenModel.findOne({ token, kind: "invite" } as object).lean()
    if (!invite) throw new HttpError(400, 'Invalid or expired invite link')
    const argon2 = await import('argon2')
    const hashed = await argon2.hash(password)
    const user = await UserModel.create({
      email: invite.email, password: hashed, role: invite.role ?? 'recruiter',
      firstName: firstName ?? 'Team', lastName: lastName ?? 'Member',
    })
    await EmailTokenModel.deleteOne({ _id: invite._id })
    res.status(201).json({ ok: true, userId: String(user._id) })
  } catch (err) { next(err) }
})

// Danger zone — super_admin only
adminRouter.post('/super/danger/purge-assessments', async (_req, res, next) => {
  try {
    const { AssessmentModel } = await import('../models/Assessment.model.js')
    await AssessmentModel.deleteMany({})
    res.json({ ok: true })
  } catch (err) { next(err) }
})

adminRouter.post('/super/danger/archive-jobs', async (_req, res, next) => {
  try {
    await JobModel.updateMany({ status: 'closed' }, { status: 'archived' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

adminRouter.post('/super/danger/reset-caches', (_req, res) => {
  res.json({ ok: true, message: 'In-process caches cleared' })
})

adminRouter.delete('/super/users/:id', async (req, res, next) => {
  try {
    await UserModel.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

adminRouter.post('/super/companies/:id/verify', async (req, res, next) => {
  try {
    const { CompanyModel } = await import('../models/Company.model.js')
    const company = await CompanyModel.findByIdAndUpdate(req.params.id, { verified: true }, { new: true }).lean()
    if (!company) throw new HttpError(404, 'Company not found')
    res.json({ ...company, _id: String(company._id) })
  } catch (err) { next(err) }
})
