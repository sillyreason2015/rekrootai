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
    res.json(paginate(entries.map((e) => ({ ...e, _id: String(e._id) })), page, limit))
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
