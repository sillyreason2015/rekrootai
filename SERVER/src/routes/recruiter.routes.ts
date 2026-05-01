import { Router } from 'express'
import { requireAuth, requireRole } from '../lib/auth.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { JobModel } from '../models/Job.model.js'
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
