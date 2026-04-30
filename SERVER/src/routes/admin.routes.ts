import { Router } from 'express'
import { db, logAction, getUserById } from '../data/mockStore.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, paginate, nowIso } from '../lib/http.js'

export const adminRouter = Router()

adminRouter.use(requireAuth, requireRole('admin'))

adminRouter.get('/dashboard', (_req, res) => {
  res.json({
    totalUsers: db.users.length,
    totalJobs: db.jobs.length,
    totalApplications: db.applications.length,
    pipelineStats: {
      screening: db.applications.filter((application) => application.stage === 'screening').length,
      assessment: db.applications.filter((application) => application.stage === 'assessment').length,
      interview: db.applications.filter((application) => application.stage === 'interview').length,
      decision: db.applications.filter((application) => application.stage === 'decision').length,
    },
    recentActivity: db.auditLog.slice(0, 5),
  })
})

adminRouter.get('/audit-log', (req, res) => {
  const page = Number(req.query.page ?? 1)
  const limit = Number(req.query.limit ?? 20)
  const action = String(req.query.action ?? '').toLowerCase()
  const filtered = action ? db.auditLog.filter((entry) => entry.action.toLowerCase().includes(action)) : db.auditLog
  // Enrich entries with user info for client compatibility
  const enriched = filtered.map((entry) => {
    const actor = entry.actor === 'user' && entry.candidateId ? getUserById(entry.candidateId) : null
    return {
      _id: entry._id,
      action: entry.action,
      user: actor
        ? { firstName: actor.firstName, lastName: actor.lastName, email: actor.email }
        : { firstName: entry.actor, lastName: '', email: '' },
      resource: entry.jobId ? 'job' : entry.candidateId ? 'candidate' : 'system',
      resourceId: entry.jobId ?? entry.candidateId ?? entry._id,
      createdAt: entry.timestamp,
      metadata: { mode: entry.mode, modelVersion: entry.modelVersion },
    }
  })
  res.json(paginate(enriched, page, limit))
})

adminRouter.get('/bias-audits', (_req, res) => {
  res.json(db.biasAudits)
})

adminRouter.post('/bias-audits/run', (req, res, next) => {
  try {
    const { jobId } = req.body as { jobId?: string }
    if (!jobId) throw new HttpError(400, 'jobId is required')
    const audit = {
      _id: `bias-${db.biasAudits.length + 1}`,
      job: jobId,
      runAt: nowIso(),
      disparateImpact: { gender: 0.9, age: 0.87 },
      flagged: false,
      details: { summary: 'Scaffold fairness audit completed' },
    }
    db.biasAudits.unshift(audit)
    logAction({ actor: 'ai', action: 'bias-audit-run', jobId, mode: 'assist', payload: audit })
    res.status(201).json(audit)
  } catch (error) {
    next(error)
  }
})

adminRouter.get('/team', (_req, res) => {
  const members = db.users
    .filter((user) => user.role !== 'candidate')
    .map(({ password: _pw, ...u }) => u)
  res.json({ members })
})

adminRouter.post('/team/invite', (req, res, next) => {
  try {
    const { email, role } = req.body as { email?: string; role?: string }
    if (!email || !role) throw new HttpError(400, 'email and role are required')
    db.invitations.push({ email, role, sentAt: nowIso() })
    logAction({ actor: 'user', action: 'team-invite', mode: 'assist', payload: { email, role } })
    res.status(201).json({ ok: true })
  } catch (error) {
    next(error)
  }
})

adminRouter.get('/billing', (_req, res) => {
  res.json({
    plan: 'Starter',
    seats: db.users.length,
    usage: {
      jobs: db.jobs.length,
      applications: db.applications.length,
      aiCalls: db.aiOutputs.length + db.biasAudits.length,
    },
    nextBillingDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  })
})
