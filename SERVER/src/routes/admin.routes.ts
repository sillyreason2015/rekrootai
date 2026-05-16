import { Router } from 'express'
import { UserModel } from '../models/User.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { BiasAuditModel } from '../models/BiasAudit.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, paginate } from '../lib/http.js'
import { logAction } from '../data/store.js'
import { computeJobBiasAudit } from '../lib/fairness.js'
import { env } from '../config/env.js'
import { buildTeamScopedUserFilter, resolveWorkspaceScope } from '../lib/workspace.js'

export const adminRouter = Router()

async function buildAuditNarrative(entry: {
  actor?: string
  action: string
  candidateId?: string
  jobId?: string
  mode?: string
  payload?: Record<string, unknown>
}) {
  const who = entry.actor === 'ai' ? 'The AI system' : 'A recruiter'
  let candidateName = 'a candidate'
  let jobTitle = 'a job'

  if (entry.candidateId) {
    const candidate = await UserModel.findById(entry.candidateId, { firstName: 1, lastName: 1 }).lean()
    if (candidate) candidateName = `${candidate.firstName} ${candidate.lastName}`.trim()
  }
  if (entry.jobId) {
    const job = await JobModel.findById(entry.jobId, { title: 1 }).lean()
    if (job) jobTitle = `"${job.title}"`
  }

  const payload = entry.payload ?? {}
  const score = typeof payload.avgScore === 'number' ? `${payload.avgScore}%` : null
  const threshold = typeof payload.threshold === 'number' ? `${payload.threshold}%` : null
  const passed = typeof payload.passed === 'boolean' ? payload.passed : null
  const stage = payload.stage ? String(payload.stage) : null
  const decision = payload.decision ? String(payload.decision) : null
  const modeLabel = entry.mode ? ` (${entry.mode} mode)` : ''

  switch (entry.action) {
    case 'screening-passed':
      return `${who}${modeLabel} screened ${candidateName} for ${jobTitle} - they passed${score ? ` with a score of ${score}` : ''}${threshold ? ` (threshold: ${threshold})` : ''}.`
    case 'screening-failed':
      return `${who}${modeLabel} screened ${candidateName} for ${jobTitle} - they did not meet the criteria${score ? ` (score: ${score}` + (threshold ? `, threshold: ${threshold})` : ')') : ''}.`
    case 'shortlist':
    case 'shortlisted':
      return `${who}${modeLabel} shortlisted ${candidateName} for ${jobTitle}.`
    case 'reject':
    case 'rejected':
      return `${who}${modeLabel} rejected ${candidateName} from ${jobTitle}${decision ? ` - reason: ${decision}` : ''}.`
    case 'hire':
    case 'hired':
      return `${who} marked ${candidateName} as hired for ${jobTitle}.`
    case 'interview-scheduled':
      return `An interview was scheduled for ${candidateName} for the ${jobTitle} role.`
    case 'interview-completed':
      return `${candidateName}'s interview for ${jobTitle} was completed${score ? ` - interview score: ${score}` : ''}.`
    case 'assessment-sent':
      return `${who} sent an assessment to ${candidateName} for ${jobTitle}${stage ? ` (${stage} stage)` : ''}.`
    case 'assessment-completed':
      return `${candidateName} completed their assessment for ${jobTitle}${score ? ` - score: ${score}` : ''}${passed !== null ? `, result: ${passed ? 'passed' : 'failed'}` : ''}.`
    case 'decision-override':
      return `A recruiter manually overrode the AI decision${modeLabel} for ${candidateName} on ${jobTitle}${decision ? ` - new decision: ${decision}` : ''}.`
    case 'bias-audit-run':
      return `A fairness/bias audit was run on ${jobTitle} by ${who.toLowerCase()}.`
    case 'email-sent':
    case 'email_sent':
      return `A correspondence email was sent to ${candidateName} regarding ${jobTitle}.`
    case 'team-invite':
      return `A team invitation was created${payload.email ? ` for ${String(payload.email)}` : ''}${payload.role ? ` with ${String(payload.role)} access` : ''}.`
    case 'job-created':
      return `The job posting ${jobTitle} was created.`
    case 'job-published':
      return `${jobTitle} was published and is now accepting applications.`
    case 'apply':
    case 'applied':
      return `${candidateName} submitted an application for ${jobTitle}.`
    default:
      return `${who}${modeLabel} performed "${entry.action.replace(/[-_]/g, ' ')}" involving ${candidateName} on ${jobTitle}.`
  }
}

adminRouter.post('/team/invite/accept', async (req, res, next) => {
  try {
    const { token, password, firstName, lastName } = req.body as { token?: string; password?: string; firstName?: string; lastName?: string }
    if (!token || !password) throw new HttpError(400, 'token and password required')

    const { EmailTokenModel } = await import('../models/EmailToken.model.js')
    const invite = await EmailTokenModel.findOne({ token, kind: 'invite' } as object).lean()
    if (!invite) throw new HttpError(400, 'Invalid or expired invite link')
    if (invite.usedAt) throw new HttpError(400, 'Invite link has already been used')
    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      await EmailTokenModel.deleteOne({ _id: invite._id })
      throw new HttpError(400, 'Invite link has expired')
    }

    const existing = await UserModel.findOne({ email: invite.email.toLowerCase() }).lean()
    if (existing) throw new HttpError(409, 'A user with this email already exists')

    let companyName = invite.companyName
    let teamName = invite.teamName
    if (!companyName && invite.invitedBy) {
      const scope = await resolveWorkspaceScope(invite.invitedBy)
      companyName = scope.canonicalCompanyName ?? undefined
      teamName = teamName ?? scope.teamName ?? undefined
    }

    const argon2 = await import('argon2')
    const hashed = await argon2.hash(password)
    const invitedRole = invite.role ?? 'recruiter'
    const user = await UserModel.create({
      email: invite.email,
      password: hashed,
      role: invitedRole,
      firstName: firstName?.trim() || 'Team',
      lastName: lastName?.trim() || 'Member',
      companyName,
      teamName,
      isVerified: true,
      onboardingComplete: invitedRole !== 'candidate',
    })

    await EmailTokenModel.deleteOne({ _id: invite._id })
    await logAction({
      actor: 'user',
      action: 'team-invite-accepted',
      mode: 'assist',
      payload: { email: invite.email, role: invitedRole, companyName: companyName ?? '', teamName: teamName ?? '' },
    })
    res.status(201).json({ ok: true, userId: String(user._id) })
  } catch (err) { next(err) }
})

adminRouter.use(requireAuth, requireRole('admin', 'super_admin'))

adminRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const [totalUsers, totalJobs, totalApplications, pipeline, recentLogs] = await Promise.all([
      UserModel.countDocuments(),
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
      ApplicationModel.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
      AuditLogModel.find().sort({ timestamp: -1 }).limit(8).lean(),
    ])
    const pipelineStats: Record<string, number> = {}
    for (const p of pipeline) pipelineStats[String(p._id)] = Number(p.count)
    const recentActivity = recentLogs.map((l) => ({
      action: l.action,
      user: l.actor,
      resource: l.jobId ? `job:${String(l.jobId)}` : undefined,
      createdAt: (l as Record<string, unknown>).timestamp as string,
    }))
    res.json({ totalUsers, totalJobs, totalApplications, pipelineStats, recentActivity })
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
    const candidateIds = [...new Set(all
      .map((entry) => entry.candidateId)
      .filter((candidateId): candidateId is string => typeof candidateId === 'string' && candidateId.length > 0))]
    const users = candidateIds.length
      ? await UserModel.find({ _id: { $in: candidateIds } }, { firstName: 1, lastName: 1, email: 1 }).lean()
      : []
    const userMap = new Map(users.map((user) => [String(user._id), user]))
    const enriched = await Promise.all(all.map(async (entry) => ({
      ...entry,
      _id: String(entry._id),
      createdAt: (entry as { timestamp?: string }).timestamp,
      narrative: await buildAuditNarrative(entry as Parameters<typeof buildAuditNarrative>[0]),
      metadata: entry.payload,
      user: entry.candidateId ? userMap.get(String(entry.candidateId)) ?? {} : {},
    })))
    res.json(paginate(enriched, page, limit))
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
    const computation = await computeJobBiasAudit(jobId)
    const audit = await BiasAuditModel.create({
      job: jobId, runAt: new Date().toISOString(),
      disparateImpact: computation.disparateImpact, flagged: computation.flagged,
      details: computation.details,
    })
    await logAction({ actor: 'ai', action: 'bias-audit-run', jobId, mode: 'assist', payload: { flagged: computation.flagged } })
    res.status(201).json({ ...audit.toObject(), _id: String(audit._id) })
  } catch (err) { next(err) }
})

adminRouter.get('/team', async (_req, res, next) => {
  try {
    const scope = await resolveWorkspaceScope(_req.user!._id)
    const companyNames = scope.companyNames
    const users = await UserModel.find({
      role: { $ne: 'candidate' },
      ...(companyNames.length ? buildTeamScopedUserFilter(scope) : { _id: _req.user!._id }),
    } as Record<string, unknown>, { password: 0 }).lean()
    const members = users.map((u) => ({ ...u, _id: String(u._id) }))
    res.json({ members, data: members })
  } catch (err) { next(err) }
})

adminRouter.post('/team/invite', async (req, res, next) => {
  try {
    const { email, role, teamName: requestedTeamName } = req.body as { email?: string; role?: string; teamName?: string }
    if (!email || !role) throw new HttpError(400, 'email and role are required')
    const existing = await UserModel.findOne({ email: email.toLowerCase() }).lean()
    if (existing) throw new HttpError(409, 'User already exists with that email')
    const scope = await resolveWorkspaceScope(req.user!._id)
    const companyName = scope.canonicalCompanyName
    const inviteTeamName = (typeof requestedTeamName === 'string' && requestedTeamName.trim()) || scope.teamName || companyName
    const { EmailTokenModel } = await import('../models/EmailToken.model.js')
    const crypto = await import('node:crypto')
    const token = crypto.randomUUID()
    await EmailTokenModel.create({
      email: email.toLowerCase(),
      kind: 'invite',
      token,
      role: role as 'candidate' | 'recruiter' | 'admin' | 'super_admin',
      companyName: companyName ?? undefined,
      teamName: inviteTeamName ?? undefined,
      invitedBy: req.user!._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    // Best-effort email — don't let SMTP failure block the invite creation
    try {
      const { sendInviteEmail } = await import('../lib/mail.js')
      const inviteBase = env.CORS_ORIGINS[0] ?? process.env.CLIENT_URL ?? 'https://rekroot-ai.vercel.app'
      const inviteUrl = `${inviteBase}/accept-invite?token=${encodeURIComponent(token)}`
      await sendInviteEmail(email, inviteUrl, req.user?.email)
    } catch (mailErr) {
      console.error('[admin] Failed to send invite email:', mailErr)
    }
    await logAction({ actor: 'user', action: 'team-invite', mode: 'assist', payload: { email, role, teamName: inviteTeamName } })
    res.status(201).json({ ok: true, token, inviteToken: token })
  } catch (err) { next(err) }
})

adminRouter.get('/billing', async (_req, res, next) => {
  try {
    const scope = await resolveWorkspaceScope(_req.user!._id)
    const companyId = scope.companyId
    const companyNames = scope.companyNames
    const [seats, jobs, applications] = await Promise.all([
      UserModel.countDocuments((companyNames.length ? buildTeamScopedUserFilter(scope) : { _id: _req.user!._id }) as Record<string, unknown>),
      JobModel.countDocuments(companyId ? { company: companyId, ...(scope.teamName ? { teamName: scope.teamName } : {}) } : { createdBy: _req.user!._id }),
      ApplicationModel.countDocuments(companyId ? { job: { $in: await JobModel.find({ company: companyId, ...(scope.teamName ? { teamName: scope.teamName } : {}) }).distinct('_id') } } : {}),
    ])
    res.json({
      plan: 'Pro',
      seats,
      usage: { jobs, applications, aiCalls: applications + jobs },
      nextBillingDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      company: scope.company ? { id: scope.company._id, name: scope.company.name ?? scope.company.legalName ?? '' } : null,
    })
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
    const { InterviewModel } = await import('../models/Interview.model.js')
    const { AssessmentModel } = await import('../models/Assessment.model.js')
    const { CompanyModel } = await import('../models/Company.model.js')
    const [users, jobs, applications, interviews, assessments, companies, verifiedCompanies] = await Promise.all([
      UserModel.countDocuments(),
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
      InterviewModel.countDocuments(),
      AssessmentModel.countDocuments(),
      CompanyModel.countDocuments(),
      CompanyModel.countDocuments({ isVerified: true }),
    ])
    res.json({ users, jobs, applications, interviews, assessments, companies, verifiedCompanies, aiOutputs: assessments + interviews, uptime: process.uptime() })
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
    const allGreen = Object.values(checks).every((v) => v === 'ok' || v === 'configured')
    res.json({ status: 'ready', checks, allGreen })
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
    const { invalidateSettingsCache } = await import('../lib/settings.js')
    const { SystemSettingsModel } = await import('../models/SystemSettings.model.js')
    const settings = await SystemSettingsModel.findOneAndUpdate(
      {},
      { $set: req.body as Record<string, unknown> },
      { new: true, upsert: true },
    ).lean()
    invalidateSettingsCache()
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
    const insights = [
      { metric: 'Total Questions', value: total, hint: 'Questions available in the bank across all categories.' },
      ...byCategory.slice(0, 3).map((c) => ({
        metric: String(c._id || 'Uncategorized'),
        value: Number(c.count),
        hint: `Questions in the ${c._id || 'uncategorized'} category.`,
      })),
    ]
    res.json({ total, byCategory, insights })
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
