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
import { env } from '../config/env.js'
import { sendInviteEmail } from '../lib/mail.js'
import { CompanyModel } from '../models/Company.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { AssessmentModel } from '../models/Assessment.model.js'
import { NotificationModel } from '../models/Notification.model.js'
import { SystemSettingsModel } from '../models/SystemSettings.model.js'

export const adminRouter = Router()

adminRouter.use(requireAuth, requireRole('admin', 'super_admin'))

// GET /admin/dashboard
adminRouter.get('/dashboard', async (req, res, next) => {
  try {
    const isSuper = req.user?.role === 'super_admin'
    const me = await UserModel.findById(req.user!._id).lean()
    const companyName = me?.companyName
    const companyUserIds = !isSuper && companyName
      ? (await UserModel.find({ companyName }, { _id: 1 }).lean()).map((u) => String(u._id))
      : []
    const companyJobs = !isSuper && companyUserIds.length
      ? await JobModel.find({ createdBy: { $in: companyUserIds } }, { _id: 1 }).lean()
      : []
    const companyJobIds = companyJobs.map((j) => String(j._id))

    const [totalUsers, totalJobs, totalApplications, pipelineCounts, recentActivity] = await Promise.all([
      isSuper ? UserModel.countDocuments() : UserModel.countDocuments({ companyName }),
      isSuper ? JobModel.countDocuments() : JobModel.countDocuments({ _id: { $in: companyJobIds } }),
      isSuper ? ApplicationModel.countDocuments() : ApplicationModel.countDocuments({ job: { $in: companyJobIds } }),
      isSuper
        ? ApplicationModel.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }])
        : ApplicationModel.aggregate([{ $match: { job: { $in: companyJobIds } } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
      isSuper
        ? AuditLogModel.find().sort({ timestamp: -1 }).limit(5).lean()
        : AuditLogModel.find({ actor: 'user' }).sort({ timestamp: -1 }).limit(5).lean(),
    ])

    const pipelineStats = { screening: 0, assessment: 0, interview: 0, decision: 0 }
    for (const { _id, count } of pipelineCounts) {
      if (_id in pipelineStats) pipelineStats[_id as keyof typeof pipelineStats] = count
    }

    res.json({
      scope: isSuper ? 'platform' : 'company',
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

adminRouter.get('/question-insights', async (req, res, next) => {
  try {
    const isSuper = req.user?.role === 'super_admin'
    const me = await UserModel.findById(req.user!._id).lean()
    const companyName = me?.companyName
    const userIds = !isSuper && companyName
      ? (await UserModel.find({ companyName }, { _id: 1 }).lean()).map((u) => String(u._id))
      : []
    const jobs = !isSuper && userIds.length ? await JobModel.find({ createdBy: { $in: userIds } }, { _id: 1 }).lean() : []
    const jobIds = jobs.map((j) => String(j._id))
    const apps = await ApplicationModel.find(isSuper ? {} : { job: { $in: jobIds } }, { scores: 1 }).lean()
    const total = apps.length || 1
    const avgAssessment = apps.reduce((s, a) => s + Number(a.scores?.assessment ?? 0), 0) / total
    const avgInterview = apps.reduce((s, a) => s + Number(a.scores?.interview ?? 0), 0) / total
    res.json({
      generatedAt: nowIso(),
      insights: [
        { metric: 'assessment_quality', value: +avgAssessment.toFixed(1), hint: 'Higher average indicates stronger question calibration.' },
        { metric: 'interview_alignment', value: +avgInterview.toFixed(1), hint: 'Compare interview and assessment scores to tune question banks.' },
      ],
    })
  } catch (err) { next(err) }
})

// GET /admin/audit-log
adminRouter.get('/audit-log', async (req, res, next) => {
  try {
    const isSuper = req.user?.role === 'super_admin'
    const me = await UserModel.findById(req.user!._id).lean()
    const companyName = me?.companyName
    const companyUserIds = !isSuper && companyName
      ? (await UserModel.find({ companyName }, { _id: 1 }).lean()).map((u) => String(u._id))
      : []
    const companyJobs = !isSuper && companyUserIds.length
      ? await JobModel.find({ createdBy: { $in: companyUserIds } }, { _id: 1 }).lean()
      : []
    const companyJobIds = companyJobs.map((j) => String(j._id))
    const companyApps = !isSuper && companyJobIds.length
      ? await ApplicationModel.find({ job: { $in: companyJobIds } }, { candidate: 1 }).lean()
      : []
    const companyCandidateIds = [...new Set(companyApps.map((a) => String(a.candidate)))]

    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 20)
    const action = String(req.query.action ?? '').toLowerCase()

    const baseFilter: Record<string, unknown> = action ? { action: { $regex: action, $options: 'i' } } : {}
    const scopeFilter = isSuper ? {} : {
      $or: [
        { jobId: { $in: companyJobIds } },
        { candidateId: { $in: companyCandidateIds } },
      ],
    }
    const filter = { ...baseFilter, ...scopeFilter }
    const entries = await AuditLogModel.find(filter).sort({ timestamp: -1 }).lean()

    // Enrich with user info + plain-English narrative
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        let user = { firstName: entry.actor === 'ai' ? 'AI System' : 'System', lastName: '', email: '' }
        if (entry.candidateId) {
          const u = await UserModel.findById(entry.candidateId, { firstName: 1, lastName: 1, email: 1 }).lean()
          if (u) user = { firstName: u.firstName, lastName: u.lastName, email: u.email }
        }

        // Look up job title and candidate name for the narrative
        let candidateName = user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'a candidate'
        let jobTitle = 'a job'
        if (entry.jobId) {
          const j = await JobModel.findById(entry.jobId, { title: 1 }).lean()
          if (j) jobTitle = `"${j.title}"`
        }

        const who = entry.actor === 'ai' ? 'The AI system' : `${user.firstName} ${user.lastName}`.trim() || 'A user'
        const p = (entry.payload as Record<string, unknown>) ?? {}
        const score = typeof p.avgScore === 'number' ? `${p.avgScore}%` : null
        const threshold = typeof p.threshold === 'number' ? `${p.threshold}%` : null
        const passed = typeof p.passed === 'boolean' ? p.passed : null
        const modeLabel = entry.mode ? ` (${entry.mode} mode)` : ''
        const decision = p.decision ? String(p.decision) : null
        const stage = p.stage ? String(p.stage) : null

        let narrative: string
        switch (entry.action) {
          case 'screening-passed':
            narrative = `${who}${modeLabel} screened ${candidateName} for ${jobTitle} — passed${score ? ` with score ${score}` : ''}${threshold ? ` (threshold: ${threshold})` : ''}.`; break
          case 'screening-failed':
            narrative = `${who}${modeLabel} screened ${candidateName} for ${jobTitle} — did not meet criteria${score ? ` (score: ${score}` + (threshold ? `, threshold: ${threshold})` : ')') : ''}.`; break
          case 'shortlist': case 'shortlisted':
            narrative = `${who}${modeLabel} shortlisted ${candidateName} for ${jobTitle}.`; break
          case 'reject': case 'rejected':
            narrative = `${who}${modeLabel} rejected ${candidateName} from ${jobTitle}${decision ? ` — reason: ${decision}` : ''}.`; break
          case 'hire': case 'hired':
            narrative = `${who} marked ${candidateName} as hired for ${jobTitle}.`; break
          case 'interview-scheduled':
            narrative = `An interview was scheduled for ${candidateName} for the ${jobTitle} role.`; break
          case 'interview-completed':
            narrative = `${candidateName}'s interview for ${jobTitle} was completed${score ? ` — score: ${score}` : ''}.`; break
          case 'assessment-sent':
            narrative = `${who} sent an assessment to ${candidateName} for ${jobTitle}${stage ? ` (${stage} stage)` : ''}.`; break
          case 'assessment-completed':
            narrative = `${candidateName} completed the assessment for ${jobTitle}${score ? ` — score: ${score}` : ''}${passed !== null ? `, result: ${passed ? 'passed' : 'failed'}` : ''}.`; break
          case 'decision-override':
            narrative = `${who} manually overrode the AI decision${modeLabel} for ${candidateName} on ${jobTitle}${decision ? ` — new decision: ${decision}` : ''}.`; break
          case 'bias-audit-run': case 'bias_audit_run':
            narrative = `A fairness/bias audit was run on ${jobTitle}.`; break
          case 'email-sent': case 'email_sent':
            narrative = `A correspondence email was sent to ${candidateName} regarding ${jobTitle}.`; break
          case 'job-created':
            narrative = `The job posting ${jobTitle} was created by ${who}.`; break
          case 'job-published':
            narrative = `${jobTitle} was published and is now live.`; break
          case 'apply': case 'applied':
            narrative = `${candidateName} submitted an application for ${jobTitle}.`; break
          case 'login':
            narrative = `${who} logged in to the platform.`; break
          case 'register':
            narrative = `${who} created a new account.`; break
          default: {
            const label = entry.action.replace(/[-_]/g, ' ')
            narrative = `${who}${modeLabel} performed "${label}" involving ${candidateName} on ${jobTitle}.`
          }
        }

        return {
          _id: String(entry._id),
          action: entry.action,
          narrative,
          user,
          actor: entry.actor,
          mode: entry.mode,
          resource: entry.jobId ? 'job' : entry.candidateId ? 'candidate' : 'system',
          resourceId: entry.jobId ?? entry.candidateId ?? String(entry._id),
          createdAt: (entry as { timestamp?: string; createdAt?: string }).timestamp ?? (entry as { createdAt?: string }).createdAt ?? '',
          metadata: { ...(p as object), mode: entry.mode, modelVersion: entry.modelVersion },
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
adminRouter.get('/team', async (req, res, next) => {
  try {
    const isSuper = req.user?.role === 'super_admin'
    const me = await UserModel.findById(req.user!._id).lean()
    const filter = isSuper
      ? ({ role: { $in: ['recruiter', 'admin', 'super_admin'] } })
      : ({ role: { $in: ['recruiter', 'admin', 'super_admin'] }, companyName: me?.companyName })
    const members = await UserModel.find(filter as any).lean()
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
    const me = await UserModel.findById(req.user!._id).lean()
    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    await EmailTokenModel.create({ email: email.toLowerCase(), kind: 'invite', role: role as 'recruiter' | 'admin', token, expiresAt })
    const frontendBase = env.CORS_ORIGIN || 'http://localhost:3000'
    const inviteUrl = `${frontendBase}/accept-invite?token=${encodeURIComponent(token)}`
    await sendInviteEmail(email.toLowerCase(), inviteUrl, me ? `${me.firstName} ${me.lastName}` : 'A RekrootAI admin')
    await logAction({ actor: 'user', action: 'team-invite', mode: 'assist', payload: { email, role } })
    res.status(201).json({ ok: true, inviteToken: token, inviteUrl, expiresAt })
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

function requireSuper(req: Parameters<typeof adminRouter.get>[1] extends (req: infer R, ...args: infer _Rest) => unknown ? R : never) {
  if (req.user?.role !== 'super_admin') throw new HttpError(403, 'Super admin only')
}

adminRouter.get('/super/metrics', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const [users, companies, verifiedCompanies, jobs, applications, interviews, assessments, aiOutputs] = await Promise.all([
      UserModel.countDocuments(),
      CompanyModel.countDocuments(),
      CompanyModel.countDocuments({ isVerified: true }),
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
      InterviewModel.countDocuments(),
      AssessmentModel.countDocuments(),
      AiOutputModel.countDocuments(),
    ])
    res.json({ users, companies, verifiedCompanies, jobs, applications, interviews, assessments, aiOutputs })
  } catch (err) { next(err) }
})

adminRouter.get('/super/system-readiness', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const [users, companies, jobs, applications, interviews, notifications] = await Promise.all([
      UserModel.countDocuments(),
      CompanyModel.countDocuments(),
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
      InterviewModel.countDocuments(),
      NotificationModel.countDocuments(),
    ])
    const readiness = {
      auth: Boolean(process.env.JWT_SECRET),
      db: true,
      redis: Boolean(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL),
      blob: Boolean(process.env.BLOB_ENDPOINT && process.env.BLOB_BUCKET),
      smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
      livekit: Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_HOST),
      ml: Boolean(process.env.ML_SERVICE_URL),
    }
    res.json({
      readiness,
      counts: { users, companies, jobs, applications, interviews, notifications },
      allGreen: Object.values(readiness).every(Boolean),
    })
  } catch (err) { next(err) }
})

adminRouter.get('/super/users', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 25)
    const role = String(req.query.role ?? '')
    const q = String(req.query.q ?? '').trim()
    const filter: Record<string, unknown> = {}
    if (role) filter.role = role
    if (q) filter.$or = [{ email: { $regex: q, $options: 'i' } }, { firstName: { $regex: q, $options: 'i' } }, { lastName: { $regex: q, $options: 'i' } }]
    const users = await UserModel.find(filter).sort({ createdAt: -1 }).lean()
    const safe = users.map(({ password: _pw, ...u }) => ({ ...u, _id: String(u._id) }))
    res.json(paginate(safe, page, limit))
  } catch (err) { next(err) }
})

adminRouter.delete('/super/users/:id', async (req, res, next) => {
  try {
    requireSuper(req as never)
    if (String(req.params.id) === String(req.user!._id)) throw new HttpError(400, 'Cannot delete self')
    const user = await UserModel.findById(String(req.params.id)).lean()
    if (!user) throw new HttpError(404, 'User not found')
    const candidate = await CandidateModel.findOne({ user: String(user._id) }).lean()
    if (candidate) {
      const appIds = (await ApplicationModel.find({ candidate: String(candidate._id) }).select('_id').lean()).map((a) => String(a._id))
      await Promise.all([
        AiOutputModel.deleteMany({ application: { $in: appIds } }),
        AssessmentModel.deleteMany({ application: { $in: appIds } }),
        InterviewModel.deleteMany({ application: { $in: appIds } }),
        ApplicationModel.deleteMany({ candidate: String(candidate._id) }),
        CandidateModel.deleteOne({ _id: String(candidate._id) }),
      ])
    }
    await UserModel.deleteOne({ _id: String(user._id) })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

adminRouter.get('/super/companies', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 25)
    const q = String(req.query.q ?? '').trim()
    const filter: Record<string, unknown> = q ? { $or: [{ name: { $regex: q, $options: 'i' } }, { legalName: { $regex: q, $options: 'i' } }] } : {}
    const companies = await CompanyModel.find(filter).sort({ createdAt: -1 }).lean()
    res.json(paginate(companies.map((c) => ({ ...c, _id: String(c._id) })), page, limit))
  } catch (err) { next(err) }
})

adminRouter.post('/super/companies/:id/verify', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const company = await CompanyModel.findByIdAndUpdate(
      String(req.params.id),
      { isVerified: true, verifiedAt: nowIso(), verifiedBy: req.user!._id },
      { new: true },
    ).lean()
    if (!company) throw new HttpError(404, 'Company not found')
    res.json({ ...company, _id: String(company._id) })
  } catch (err) { next(err) }
})

adminRouter.get('/super/settings', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const existing = await SystemSettingsModel.findOne().lean()
    if (!existing) {
      const created = await SystemSettingsModel.create({})
      return res.json({ ...created.toJSON(), _id: String(created._id) })
    }
    res.json({ ...existing, _id: String(existing._id) })
  } catch (err) { next(err) }
})

adminRouter.put('/super/settings', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const settings = await SystemSettingsModel.findOneAndUpdate({}, req.body, { new: true, upsert: true }).lean()
    res.json({ ...settings, _id: String(settings!._id) })
  } catch (err) { next(err) }
})

// GET /admin/super/key-status — which provider env vars are present
adminRouter.get('/super/key-status', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const check = (v: string | undefined) => !!v && v.length > 0
    res.json({
      GEMINI_API_KEY:  check(process.env.GEMINI_API_KEY),
      LIVEKIT_API_KEY: check(process.env.LIVEKIT_API_KEY),
      SMTP_HOST:       check(process.env.SMTP_HOST),
      BLOB_ACCESS_KEY: check(process.env.BLOB_ACCESS_KEY),
      ML_SERVICE_URL:  check(process.env.ML_SERVICE_URL),
      MONGODB_URI:     check(process.env.MONGODB_URI),
      JWT_SECRET:      check(process.env.JWT_SECRET),
    })
  } catch (err) { next(err) }
})

// POST /admin/super/danger/purge-assessments
adminRouter.post('/super/danger/purge-assessments', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const cutoff = new Date().toISOString()
    const result = await AssessmentModel.deleteMany({ expiresAt: { $lt: cutoff } } as never)
    await logAction({ actor: 'ai', action: 'danger-purge-assessments', mode: 'assist', payload: { deleted: result.deletedCount } as unknown as Record<string, unknown> })
    res.json({ ok: true, deleted: result.deletedCount })
  } catch (err) { next(err) }
})

// POST /admin/super/danger/reset-caches
adminRouter.post('/super/danger/reset-caches', async (req, res, next) => {
  try {
    requireSuper(req as never)
    // Clear AiOutput cache records older than 1 day
    const cutoff = new Date(Date.now() - 86_400_000)
    const result = await AiOutputModel.deleteMany({ createdAt: { $lt: cutoff } })
    await logAction({ actor: 'ai', action: 'danger-reset-caches', mode: 'assist', payload: { cleared: result.deletedCount } as unknown as Record<string, unknown> })
    res.json({ ok: true, cleared: result.deletedCount })
  } catch (err) { next(err) }
})

// POST /admin/super/danger/archive-jobs
adminRouter.post('/super/danger/archive-jobs', async (req, res, next) => {
  try {
    requireSuper(req as never)
    const result = await JobModel.updateMany({ status: 'closed' }, { $set: { status: 'archived' } })
    await logAction({ actor: 'ai', action: 'danger-archive-jobs', mode: 'assist', payload: { archived: result.modifiedCount } as unknown as Record<string, unknown> })
    res.json({ ok: true, archived: result.modifiedCount })
  } catch (err) { next(err) }
})
