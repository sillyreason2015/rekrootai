import { Router } from 'express'
import { CompanyModel } from '../models/Company.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'

export const companyRouter = Router()

companyRouter.use(requireAuth, requireRole('recruiter', 'admin'))

// GET /companies/mine
companyRouter.get('/mine', async (req, res, next) => {
  try {
    const company = await CompanyModel.findOne({ createdBy: req.user!._id }).lean()
    if (!company) throw new HttpError(404, 'Company profile not found')
    res.json({ ...company, _id: String(company._id) })
  } catch (err) { next(err) }
})

// PATCH /companies/mine
companyRouter.patch('/mine', async (req, res, next) => {
  try {
    const company = await CompanyModel.findOneAndUpdate(
      { createdBy: req.user!._id },
      req.body,
      { new: true, upsert: true },
    ).lean()
    res.json({ ...company, _id: String(company!._id) })
  } catch (err) { next(err) }
})
