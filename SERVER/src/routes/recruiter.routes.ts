import { Router } from 'express'
import { requireAuth, requireRole } from '../lib/auth.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { paginate } from '../lib/http.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { presignedDownloadUrl } from '../lib/blob.js'
import { UserModel } from '../models/User.model.js'

export const recruiterRouter = Router()
recruiterRouter.use(requireAuth, requireRole('recruiter'))

// Helper: build a plain-English sentence from an audit entry
async function buildNarrative(entry: {
  actor?: string; action: string; candidateId?: string; jobId?: string;
  mode?: string; payload?: Record<string, unknown>
}): Promise<string> {
  const who = entry.actor === 'ai' ? 'The AI system' : 'A recruiter'
  let candidateName = 'a candidate'
  let jobTitle = 'a job'

  if (entry.candidateId) {
    const u = await UserModel.findById(entry.candidateId, { firstName: 1, lastName: 1 }).lean()
    if (u) candidateName = `${u.firstName} ${u.lastName}`
  }
  if (entry.jobId) {
    const j = await JobModel.findById(entry.jobId, { title: 1 }).lean()
    if (j) jobTitle = `"${j.title}"`
  }

  const p = entry.payload ?? {}
  const score = typeof p.avgScore === 'number' ? `${p.avgScore}%` : null
  const threshold = typeof p.threshold === 'number' ? `${p.threshold}%` : null
  const passed = typeof p.passed === 'boolean' ? p.passed : null
  const stage = p.stage ? String(p.stage) : null
  const decision = p.decision ? String(p.decision) : null
  const modeLabel = entry.mode ? ` (${entry.mode} mode)` : ''

  switch (entry.action) {
    case 'screening-passed':
      return `${who}${modeLabel} screened ${candidateName} for ${jobTitle} — they passed${score ? ` with a score of ${score}` : ''}${threshold ? ` (threshold: ${threshold})` : ''}.`
    case 'screening-failed':
      return `${who}${modeLabel} screened ${candidateName} for ${jobTitle} — they did not meet the criteria${score ? ` (score: ${score}` + (threshold ? `, threshold: ${threshold})` : ')') : ''}.`
    case 'shortlist':
    case 'shortlisted':
      return `${who}${modeLabel} shortlisted ${candidateName} for ${jobTitle}.`
    case 'reject':
    case 'rejected':
      return `${who}${modeLabel} rejected ${candidateName} from ${jobTitle}${decision ? ` — reason: ${decision}` : ''}.`
    case 'hire':
    case 'hired':
      return `${who} marked ${candidateName} as hired for ${jobTitle}.`
    case 'interview-scheduled':
      return `An interview was scheduled for ${candidateName} for the ${jobTitle} role.`
    case 'interview-completed':
      return `${candidateName}'s interview for ${jobTitle} was completed${score ? ` — interview score: ${score}` : ''}.`
    case 'assessment-sent':
      return `${who} sent an assessment to ${candidateName} for ${jobTitle}${stage ? ` (${stage} stage)` : ''}.`
    case 'assessment-completed':
      return `${candidateName} completed their assessment for ${jobTitle}${score ? ` — score: ${score}` : ''}${passed !== null ? `, result: ${passed ? 'passed' : 'failed'}` : ''}.`
    case 'decision-override':
      return `A recruiter manually overrode the AI decision${modeLabel} for ${candidateName} on ${jobTitle}${decision ? ` — new decision: ${decision}` : ''}.`
    case 'bias-audit-run':
      return `A fairness/bias audit was run on ${jobTitle} by ${who.toLowerCase()}.`
    case 'email-sent':
    case 'email_sent':
      return `A correspondence email was sent to ${candidateName} regarding ${jobTitle}.`
    case 'job-created':
      return `The job posting ${jobTitle} was created.`
    case 'job-published':
      return `${jobTitle} was published and is now accepting applications.`
    case 'apply':
    case 'applied':
      return `${candidateName} submitted an application for ${jobTitle}.`
    default: {
      const label = entry.action.replace(/[-_]/g, ' ')
      return `${who}${modeLabel} performed "${label}" involving ${candidateName} on ${jobTitle}.`
    }
  }
}

recruiterRouter.get('/audit-log', async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 20)
    const action = String(req.query.action ?? '').toLowerCase()
    const jobs = await JobModel.find({ createdBy: req.user!._id }, { _id: 1 }).lean()
    const jobIds = jobs.map((j) => String(j._id))
    const filter: Record<string, unknown> = { jobId: { $in: jobIds } }
    if (action) filter.action = { $regex: action, $options: 'i' }
    const entries = await AuditLogModel.find(filter).sort({ timestamp: -1 }).lean()
    const enriched = await Promise.all(entries.map(async (e) => ({
      ...e,
      _id: String(e._id),
      narrative: await buildNarrative(e as Parameters<typeof buildNarrative>[0]),
    })))
    res.json(paginate(enriched, page, limit))
  } catch (err) { next(err) }
})

recruiterRouter.get('/pipeline-summary', async (req, res, next) => {
  try {
    const jobs = await JobModel.find({ createdBy: req.user!._id }, { _id: 1 }).lean()
    const jobIds = jobs.map((j) => String(j._id))
    const grouped = await ApplicationModel.aggregate([
      { $match: { job: { $in: jobIds } } },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ])
    const summary: Record<string, number> = {
      applied: 0, screening: 0, assessment: 0, interview: 0, decision: 0, rejected: 0, offered: 0,
    }
    for (const g of grouped) summary[String(g._id)] = Number(g.count)
    res.json(summary)
  } catch (err) { next(err) }
})

recruiterRouter.get('/jobs/:jobId/cvs', async (req, res, next) => {
  try {
    const jobId = String(req.params.jobId)
    const apps = await ApplicationModel.find({ job: jobId }).lean()
    const candidateIds = [...new Set(apps.map((a) => String(a.candidate)))]
    const candidates = await CandidateModel.find({ _id: { $in: candidateIds } }).lean()
    const users = await UserModel.find({ _id: { $in: candidates.map((c) => String(c.user)) } }, { firstName: 1, lastName: 1, email: 1 }).lean()
    const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]))
    const links = await Promise.all(candidates.map(async (c) => {
      const key = c.cvUrl
      const user = userMap[String(c.user)]
      return {
        candidateId: String(c._id),
        name: user ? `${user.firstName} ${user.lastName}` : 'Candidate',
        email: user?.email ?? '',
        cvUrl: key ? await presignedDownloadUrl(key, 3600) : null,
      }
    }))
    res.json({ jobId, count: links.length, cvs: links.map((l) => ({ name: l.name, url: l.cvUrl })).filter((l) => l.url) })
  } catch (err) { next(err) }
})

recruiterRouter.get('/applications/:id/cv', async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(String(req.params.id)).lean()
    if (!app) return res.status(404).json({ message: 'Application not found' })
    const candidate = await CandidateModel.findById(String(app.candidate)).lean()
    if (!candidate?.cvUrl) return res.status(404).json({ message: 'CV not found' })
    const url = await presignedDownloadUrl(candidate.cvUrl, 3600)
    res.json({ applicationId: String(app._id), candidateId: String(candidate._id), url })
  } catch (err) { next(err) }
})

recruiterRouter.get('/jobs/:jobId/triage', async (req, res, next) => {
  try {
    const jobId = String(req.params.jobId)
    const mode = String(req.query.mode ?? 'assist').toLowerCase()
    const apps = await ApplicationModel.find({ job: jobId }).lean()
    const candidateIds = [...new Set(apps.map((a) => String(a.candidate)))]
    const candidates = await CandidateModel.find({ _id: { $in: candidateIds } }).lean()
    const users = await UserModel.find({ _id: { $in: candidates.map((c) => String(c.user)) } }, { firstName: 1, lastName: 1 }).lean()
    const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]))
    const candMap = Object.fromEntries(candidates.map((c) => [String(c._id), c]))

    const rows = apps.map((a) => {
      const score = Number(a.scores?.resume ?? a.scores?.final ?? 0)
      const bucket = score >= 70 ? 'strong' : score >= 45 ? 'review' : 'weak'
      const cand = candMap[String(a.candidate)]
      const usr = cand ? userMap[String(cand.user)] : null
      const candidateName = usr ? `${usr.firstName} ${usr.lastName}` : 'Candidate'
      const rec = mode === 'override'
        ? 'Manual review — AI scores advisory only'
        : mode === 'veto'
          ? (bucket === 'strong' ? 'Auto-shortlist recommended' : bucket === 'weak' ? 'Auto-reject recommended' : 'Requires manual review')
          : (bucket === 'strong' ? 'Recommend shortlisting' : bucket === 'weak' ? 'Recommend rejection' : 'Review before deciding')
      return { applicationId: String(a._id), candidateId: String(a.candidate), candidateName, score, recommendation: rec, bucket }
    })

    res.json({
      jobId, mode,
      strong: rows.filter((r) => r.bucket === 'strong'),
      review: rows.filter((r) => r.bucket === 'review'),
      weak: rows.filter((r) => r.bucket === 'weak'),
      adminGuidance: [
        `${rows.filter((r) => r.bucket === 'strong').length} strong candidates ready for shortlisting.`,
        `${rows.filter((r) => r.bucket === 'review').length} candidates need manual review before advancing.`,
        `${rows.filter((r) => r.bucket === 'weak').length} weak candidates — consider rejection with documented rationale.`,
        'Run fairness gate before confirming any shortlist to check demographic parity.',
      ],
    })
  } catch (err) { next(err) }
})
