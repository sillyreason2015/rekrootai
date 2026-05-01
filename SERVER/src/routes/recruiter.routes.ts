import { Router } from 'express'
import { requireAuth, requireRole } from '../lib/auth.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { paginate } from '../lib/http.js'

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
