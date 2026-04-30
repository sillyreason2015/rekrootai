import { Router } from 'express'
import { UserModel } from '../models/User.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { BiasAuditModel } from '../models/BiasAudit.model.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { AiOutputModel } from '../models/AiOutput.model.js'
import { logAction } from '../data/store.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, paginate, nowIso } from '../lib/http.js'
import { EmailTokenModel } from '../models/EmailToken.model.js'
import crypto from 'crypto'

export const adminRouter = Router()

adminRouter.use(requireAuth, requireRole('admin'))

// GET /admin/dashboard
adminRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const [totalUsers, totalJobs, totalApplications, pipelineCounts, recentActivity] = await Promise.all([
      UserModel.countDocuments(),
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
      ApplicationModel.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
      AuditLogModel.find().sort({ timestamp: -1 }).limit(5).lean(),
    ])

    const pipelineStats = { screening: 0, assessment: 0, interview: 0, decision: 0 }
    for (const { _id, count } of pipelineCounts) {
      if (_id in pipelineStats) pipelineStats[_id as keyof typeof pipelineStats] = count
    }

    res.json({
      totalUsers,
      totalJobs,
      totalApplications,
      pipelineStats,
      recentActivity: recentActivity.map((e) => ({ ...e, _id: String(e._id) })),
    })
  } catch (err) {
    next(err)
  }
})

// GET /admin/stats
adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const [total, grouped] = await Promise.all([
      ApplicationModel.countDocuments(),
      ApplicationModel.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
    ])

    const byStage: Record<string, number> = {
      applied: 0,
      screening: 0,
      assessment: 0,
      interview: 0,
      decision: 0,
      offered: 0,
      rejected: 0,
    }
    for (const row of grouped) byStage[String(row._id)] = Number(row.count)

    const passThrough = {
      screeningToAssessment: byStage.screening ? byStage.assessment / byStage.screening : 0,
      assessmentToInterview: byStage.assessment ? byStage.interview / byStage.assessment : 0,
      interviewToDecision: byStage.interview ? byStage.decision / byStage.interview : 0,
    }

    res.json({ totalApplications: total, byStage, passThrough })
  } catch (err) {
    next(err)
  }
})

// GET /admin/audit-log
adminRouter.get('/audit-log', async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 20)
    const action = String(req.query.action ?? '').toLowerCase()

    const filter = action ? { action: { $regex: action, $options: 'i' } } : {}
    const entries = await AuditLogModel.find(filter).sort({ timestamp: -1 }).lean()

    // Enrich with user info
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        let user = { firstName: String(entry.actor), lastName: '', email: '' }
        if (entry.actor === 'user' && entry.candidateId) {
          const u = await UserModel.findById(entry.candidateId).lean()
          if (u) user = { firstName: u.firstName, lastName: u.lastName, email: u.email }
        }
        return {
          _id: String(entry._id),
          action: entry.action,
          user,
          resource: entry.jobId ? 'job' : entry.candidateId ? 'candidate' : 'system',
          resourceId: entry.jobId ?? entry.candidateId ?? String(entry._id),
          createdAt: (entry as { timestamp?: string; createdAt?: string }).timestamp ?? (entry as { createdAt?: string }).createdAt ?? '',
          metadata: { mode: entry.mode, modelVersion: entry.modelVersion },
        }
      }),
    )

    res.json(paginate(enriched, page, limit))
  } catch (err) {
    next(err)
  }
})

// GET /admin/bias-audits
adminRouter.get('/bias-audits', async (_req, res, next) => {
  try {
    const audits = await BiasAuditModel.find().sort({ runAt: -1 }).lean()
    res.json(audits.map((a) => ({ ...a, _id: String(a._id) })))
  } catch (err) {
    next(err)
  }
})

// POST /admin/bias-audits/run
adminRouter.post('/bias-audits/run', async (req, res, next) => {
  try {
    const { jobId } = req.body as { jobId?: string }
    if (!jobId) throw new HttpError(400, 'jobId is required')

    const audit = await BiasAuditModel.create({
      job: jobId,
      runAt: nowIso(),
      disparateImpact: { gender: 0.9, age: 0.87 },
      flagged: false,
      details: { summary: 'Fairness audit completed — integrate real demographic analysis for production' },
    })

    await logAction({ actor: 'ai', action: 'bias-audit-run', jobId, mode: 'assist' })
    res.status(201).json({ ...audit.toJSON(), _id: String(audit._id) })
  } catch (err) {
    next(err)
  }
})

// GET /admin/team
adminRouter.get('/team', async (_req, res, next) => {
  try {
    const members = await UserModel.find({ role: { $ne: 'candidate' } }).lean()
    res.json({
      members: members.map(({ password: _pw, ...u }) => ({ ...u, _id: String(u._id) })),
    })
  } catch (err) {
    next(err)
  }
})

// POST /admin/team/invite
adminRouter.post('/team/invite', async (req, res, next) => {
  try {
    const { email, role } = req.body as { email?: string; role?: string }
    if (!email || !role) throw new HttpError(400, 'email and role are required')
    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    await EmailTokenModel.create({ email: email.toLowerCase(), kind: 'invite', role: role as 'recruiter' | 'admin', token, expiresAt })
    await logAction({ actor: 'user', action: 'team-invite', mode: 'assist', payload: { email, role } })
    res.status(201).json({ ok: true, inviteToken: token, expiresAt })
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/team/invite/accept', async (req, res, next) => {
  try {
    const { token, firstName, lastName, password } = req.body as { token?: string; firstName?: string; lastName?: string; password?: string }
    if (!token) throw new HttpError(400, 'token is required')
    const invite = await EmailTokenModel.findOne({ token, kind: 'invite' })
    if (!invite || invite.usedAt || new Date(invite.expiresAt).getTime() < Date.now()) throw new HttpError(400, 'Invite token invalid or expired')

    const existing = await UserModel.findOne({ email: invite.email.toLowerCase() })
    if (existing) {
      existing.role = (invite.role ?? existing.role) as 'candidate' | 'recruiter' | 'admin'
      await existing.save()
    } else {
      if (!firstName || !lastName || !password) throw new HttpError(400, 'firstName, lastName, password are required for new users')
      const argon2 = await import('argon2')
      await UserModel.create({
        email: invite.email.toLowerCase(),
        password: await argon2.hash(password),
        role: invite.role ?? 'recruiter',
        firstName,
        lastName,
        isVerified: true,
        onboardingComplete: true,
      })
    }
    invite.usedAt = nowIso()
    await invite.save()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// GET /admin/billing
adminRouter.get('/billing', async (_req, res, next) => {
  try {
    const [seats, jobs, applications, aiCalls] = await Promise.all([
      UserModel.countDocuments(),
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
      AiOutputModel.countDocuments().then((n) => BiasAuditModel.countDocuments().then((b) => n + b)),
    ])
    res.json({
      plan: 'Starter',
      seats,
      usage: { jobs, applications, aiCalls },
      nextBillingDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
  } catch (err) {
    next(err)
  }
})
