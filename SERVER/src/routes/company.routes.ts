import { Router } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { CompanyModel } from '../models/Company.model.js'
import { UserModel } from '../models/User.model.js'
import { EmailTokenModel } from '../models/EmailToken.model.js'
import { JobModel } from '../models/Job.model.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { sendInviteEmail } from '../lib/mail.js'
import { logoKey, bannerKey, uploadBlob, presignedDownloadUrl } from '../lib/blob.js'
import { env } from '../config/env.js'
import { buildTeamScopedUserFilter, resolveWorkspaceScope } from '../lib/workspace.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } })

export const companyRouter = Router()

companyRouter.use(requireAuth, requireRole('recruiter', 'admin'))

async function resolveCompanyContext(userId: string) {
  return resolveWorkspaceScope(userId)
}

// GET /companies/mine - returns null (not 404) when no company exists yet
companyRouter.get('/mine', async (req, res, next) => {
  try {
    const { company } = await resolveCompanyContext(req.user!._id)
    if (!company) return res.json(null)
    res.json({ ...company, _id: String(company._id) })
  } catch (err) { next(err) }
})

// PATCH /companies/mine
companyRouter.patch('/mine', async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>
    const { company: existingCompany, companyNames, teamName } = await resolveCompanyContext(req.user!._id)
    const canonicalCompanyName =
      (typeof body.name === 'string' && body.name.trim()) ||
      companyNames[0] ||
      'My Company'
    const canonicalTeamName =
      (typeof body.teamName === 'string' && body.teamName.trim()) ||
      teamName ||
      canonicalCompanyName

    const company = await CompanyModel.findOneAndUpdate(
      existingCompany?._id ? { _id: existingCompany._id } : { name: canonicalCompanyName },
      { $set: { ...body, teamName: canonicalTeamName }, $setOnInsert: { createdBy: req.user!._id } },
      { new: true, upsert: true },
    ).lean()

    await UserModel.findByIdAndUpdate(req.user!._id, {
      companyName: canonicalCompanyName,
      teamName: canonicalTeamName,
    })

    res.json({ ...company, _id: String(company!._id) })
  } catch (err) { next(err) }
})

// GET /companies/team - list team members sharing same company context
companyRouter.get('/team', async (req, res, next) => {
  try {
    const scope = await resolveCompanyContext(req.user!._id)
    const { companyNames } = scope
    if (!companyNames.length) return res.json({ members: [] })
    const members = await UserModel.find(buildTeamScopedUserFilter(scope), { password: 0 }).lean()
    res.json({ members: members.map((member) => ({ ...member, _id: String(member._id) })) })
  } catch (err) { next(err) }
})

companyRouter.get('/teams', async (req, res, next) => {
  try {
    const scope = await resolveCompanyContext(req.user!._id)
    if (!scope.companyNames.length) return res.json({ teams: [], currentTeam: scope.teamName ?? null })
    const [userTeams, jobTeams] = await Promise.all([
      UserModel.distinct('teamName', { companyName: { $in: scope.companyNames } }),
      scope.company?._id ? JobModel.distinct('teamName', { company: scope.company._id }) : [],
    ])
    const teams = [...new Set([...userTeams, ...jobTeams].map((value) => String(value ?? '').trim()).filter(Boolean))]
    res.json({ teams, currentTeam: scope.teamName ?? null })
  } catch (err) { next(err) }
})

// POST /companies/mine/logo - upload company logo (creates company doc if needed)
companyRouter.post('/mine/logo', upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'No file uploaded')
    const { me, company: resolvedCompany, companyNames } = await resolveCompanyContext(req.user!._id)
    let company = resolvedCompany
    if (!company) {
      const created = await CompanyModel.create({
        name: companyNames[0] ?? me?.companyName ?? 'My Company',
        teamName: me?.teamName ?? companyNames[0] ?? me?.companyName ?? 'My Company',
        industry: 'Other',
        size: '1-10',
        createdBy: req.user!._id,
      })
      company = created.toObject()
    }
    const key = logoKey(String(company._id), req.file.originalname)
    await uploadBlob(key, req.file.buffer, req.file.mimetype)
    const url = await presignedDownloadUrl(key, 86400 * 7)
    await CompanyModel.findByIdAndUpdate(company._id, { logoUrl: key })
    res.json({ logoUrl: key, previewUrl: url })
  } catch (err) { next(err) }
})

// POST /companies/jobs/:jobId/banner - upload job banner
companyRouter.post('/jobs/:jobId/banner', upload.single('banner'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'No file uploaded')
    const job = await JobModel.findById(req.params.jobId).lean()
    if (!job) throw new HttpError(404, 'Job not found')
    if (String(job.createdBy) !== String(req.user!._id)) throw new HttpError(403, 'Not your job')
    const key = bannerKey(String(job._id), req.file.originalname)
    await uploadBlob(key, req.file.buffer, req.file.mimetype)
    const url = await presignedDownloadUrl(key, 86400 * 7)
    await JobModel.findByIdAndUpdate(job._id, { bannerUrl: key })
    res.json({ bannerUrl: key, previewUrl: url })
  } catch (err) { next(err) }
})

// GET /companies/mine/logo - get presigned logo URL
companyRouter.get('/mine/logo', async (req, res, next) => {
  try {
    const { company } = await resolveCompanyContext(req.user!._id)
    if (!company?.logoUrl) return res.json({ url: null })
    const url = await presignedDownloadUrl(company.logoUrl, 86400 * 7)
    res.json({ url })
  } catch (err) { next(err) }
})

// POST /companies/invite - send team invite email
companyRouter.post('/invite', async (req, res, next) => {
  try {
    const { email, teamName: requestedTeamName } = req.body as { email?: string; teamName?: string }
    if (!email) throw new HttpError(400, 'email is required')
    const { me, company, companyNames, teamName } = await resolveCompanyContext(req.user!._id)
    const companyName = company?.name ?? company?.legalName ?? companyNames[0]
    const inviteTeamName = (typeof requestedTeamName === 'string' && requestedTeamName.trim()) || teamName || companyName
    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    await EmailTokenModel.create({
      email: email.toLowerCase(),
      kind: 'invite',
      role: 'recruiter',
      token,
      companyName,
      teamName: inviteTeamName,
      invitedBy: req.user!._id,
      expiresAt,
    })
    const frontendBase = env.CORS_ORIGINS[0] ?? 'http://localhost:3000'
    const inviteUrl = `${frontendBase}/accept-invite?token=${encodeURIComponent(token)}`
    let emailSent = true
    let emailError: string | undefined
    try {
      await sendInviteEmail(email.toLowerCase(), inviteUrl, me ? `${me.firstName} ${me.lastName}` : 'A RekrootAI recruiter')
    } catch (mailErr: unknown) {
      emailSent = false
      const msg = (mailErr as { message?: string })?.message ?? String(mailErr)
      emailError = msg
      console.error('[invite] MailerSend error:', msg)
    }
    res.status(201).json({ ok: true, inviteUrl, expiresAt, emailSent, emailError })
  } catch (err) { next(err) }
})
