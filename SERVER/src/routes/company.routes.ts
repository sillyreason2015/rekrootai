import { Router } from 'express'
import { CompanyModel } from '../models/Company.model.js'
import { UserModel } from '../models/User.model.js'
import { EmailTokenModel } from '../models/EmailToken.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { sendInviteEmail } from '../lib/mail.js'
import { env } from '../config/env.js'
import crypto from 'crypto'

export const companyRouter = Router()

companyRouter.use(requireAuth, requireRole('recruiter', 'admin'))

// GET /companies/mine
companyRouter.get('/mine', async (req, res, next) => {
  try {
    const me = await UserModel.findById(req.user!._id).lean()
    const company = await CompanyModel.findOne({
      $or: [
        { createdBy: req.user!._id },
        ...(me?.companyName ? [{ name: me.companyName }, { legalName: me.companyName }] : []),
      ],
    }).lean()
    if (!company) throw new HttpError(404, 'Company profile not found')
    res.json({ ...company, _id: String(company._id) })
  } catch (err) { next(err) }
})

// PATCH /companies/mine
companyRouter.patch('/mine', async (req, res, next) => {
  try {
    const me = await UserModel.findById(req.user!._id).lean()
    const company = await CompanyModel.findOneAndUpdate(
      {
        $or: [
          { createdBy: req.user!._id },
          ...(me?.companyName ? [{ name: me.companyName }, { legalName: me.companyName }] : []),
        ],
      },
      req.body,
      { new: true, upsert: true },
    ).lean()
    res.json({ ...company, _id: String(company!._id) })
  } catch (err) { next(err) }
})

// GET /companies/team — list team members sharing same companyName
companyRouter.get('/team', async (req, res, next) => {
  try {
    const me = await UserModel.findById(req.user!._id).lean()
    if (!me?.companyName) throw new HttpError(404, 'No company associated with this account')
    const members = await UserModel.find({ companyName: me.companyName }, { password: 0 }).lean()
    res.json({ members: members.map((m) => ({ ...m, _id: String(m._id) })) })
  } catch (err) { next(err) }
})

// POST /companies/invite — send team invite email
companyRouter.post('/invite', async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string }
    if (!email) throw new HttpError(400, 'email is required')
    const me = await UserModel.findById(req.user!._id).lean()
    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    await EmailTokenModel.create({ email: email.toLowerCase(), kind: 'invite', role: 'recruiter', token, expiresAt })
    const frontendBase = env.CORS_ORIGIN ?? 'http://localhost:3000'
    const inviteUrl = `${frontendBase}/accept-invite?token=${encodeURIComponent(token)}`
    sendInviteEmail(email.toLowerCase(), inviteUrl, me ? `${me.firstName} ${me.lastName}` : 'A RekrootAI recruiter').catch(console.error)
    res.status(201).json({ ok: true, inviteUrl, expiresAt })
  } catch (err) { next(err) }
})
