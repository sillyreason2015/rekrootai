import { Router } from 'express'
import { requireAuth, requireRole } from '../lib/auth.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { paginate, HttpError } from '../lib/http.js'
import { notify } from '../lib/notify.js'
import { logAction } from '../data/store.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { presignedDownloadUrl } from '../lib/blob.js'
import { UserModel } from '../models/User.model.js'
import { BiasAuditModel } from '../models/BiasAudit.model.js'
import { computeJobBiasAudit } from '../lib/fairness.js'
import { buildTeamScopedJobFilter, resolveEffectiveTeamScope } from '../lib/workspace.js'

export const recruiterRouter = Router()
recruiterRouter.use(requireAuth, requireRole('recruiter', 'admin', 'super_admin'))

async function resolveScopedJobIdsForTeam(userId: string, requestedTeamName?: string) {
  const scope = await resolveEffectiveTeamScope(userId, requestedTeamName)
  const filter = buildTeamScopedJobFilter(scope, userId)
  const jobs = await JobModel.find(filter, { _id: 1 }).lean()
  return jobs.map((job) => String(job._id))
}

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
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
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
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
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
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
    if (!jobIds.includes(jobId)) throw new HttpError(404, 'Job not found')
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
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
    if (!jobIds.includes(String(app.job))) return res.status(404).json({ message: 'Application not found' })
    const candidate = await CandidateModel.findById(String(app.candidate)).lean()
    if (!candidate?.cvUrl) return res.status(404).json({ message: 'CV not found' })
    const url = await presignedDownloadUrl(candidate.cvUrl, 3600)
    res.json({ applicationId: String(app._id), candidateId: String(candidate._id), url })
  } catch (err) { next(err) }
})

recruiterRouter.post('/applications/:id/cv-analysis', async (req, res, next) => {
  try {
    const app = await ApplicationModel.findById(String(req.params.id)).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
    if (!jobIds.includes(String(app.job))) throw new HttpError(404, 'Application not found')
    const candidate = await CandidateModel.findById(String(app.candidate)).lean()
    const job = await JobModel.findById(String(app.job), { title: 1, requirements: 1, skills: 1, description: 1 }).lean()
    const cvText = (candidate?.cvParsed as { maskedCV?: string } | undefined)?.maskedCV ?? ''
    const inferredSkills = (candidate?.cvParsed as { inferredSkills?: string[] } | undefined)?.inferredSkills ?? []
    const jobSkills = job?.skills ?? []
    const matchedSkills = inferredSkills.filter((s) => jobSkills.map((j) => j.toLowerCase()).includes(s.toLowerCase()))
    const missingSkills = jobSkills.filter((s) => !inferredSkills.map((i) => i.toLowerCase()).includes(s.toLowerCase()))

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey || !cvText) {
      return res.json({
        overall: cvText ? `CV extracted. ${inferredSkills.length} skills identified.` : 'CV text could not be extracted from this file.',
        strengths: matchedSkills.length ? [`Matched ${matchedSkills.length} required skills: ${matchedSkills.join(', ')}`] : ['No direct skill matches found in CV text.'],
        gaps: missingSkills.length ? [`Missing required skills: ${missingSkills.join(', ')}`] : ['No obvious skill gaps detected.'],
        score: app.scores?.resume ?? 0,
        suggestedQuestions: ['Can you walk me through your most relevant project for this role?', 'How have you applied your technical skills in a real-world setting?'],
      })
    }

    const prompt = `You are an expert recruiter AI. Analyse this candidate's CV against the job requirements and return a JSON object with these exact keys:
- "overall": 1-2 sentence overall impression
- "strengths": array of 3 bullet strings (what the CV does well for this role)
- "gaps": array of 2-3 bullet strings (skill or experience gaps vs the job)
- "suggestedQuestions": array of 3 specific interview questions tailored to this CV

Job: ${job?.title ?? 'Unknown'}
Required skills: ${jobSkills.join(', ') || 'not specified'}
CV (excerpt, anonymised):
${cvText.slice(0, 1500)}

Respond ONLY with valid JSON. No markdown, no code fences.`.trim()

    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, ''))
    } catch {
      parsed = { overall: text.slice(0, 300), strengths: [], gaps: [], suggestedQuestions: [] }
    }
    res.json({ ...parsed, score: app.scores?.resume ?? 0 })
  } catch (err) { next(err) }
})

recruiterRouter.post('/applications/:id/assistant', async (req, res, next) => {
  try {
    const { question } = req.body as { question?: string }
    if (!question?.trim()) throw new HttpError(400, 'question is required')

    const app = await ApplicationModel.findById(req.params.id).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
    if (!jobIds.includes(String(app.job))) throw new HttpError(404, 'Application not found')

    const candidate = await CandidateModel.findById(String(app.candidate)).lean()
    const candidateUser = candidate?.user ? await UserModel.findById(String(candidate.user), { firstName: 1, lastName: 1 }).lean() : null
    const job = await JobModel.findById(String(app.job), { title: 1, requirements: 1, skills: 1 }).lean()

    const name = candidateUser ? `${candidateUser.firstName} ${candidateUser.lastName}` : 'The candidate'
    const scores = app.scores ?? {}
    const skillList = (candidate?.skills ?? []).join(', ') || 'not listed'
    const expCount = (candidate?.experience ?? []).length
    const cvText = (candidate?.cvParsed as { maskedCV?: string } | undefined)?.maskedCV?.slice(0, 800) ?? ''

    const context = `
You are an AI hiring assistant helping a recruiter evaluate a candidate in Assist mode.
Candidate: ${name}
Role applied for: ${job?.title ?? 'Unknown'}
Required skills: ${(job?.skills ?? []).join(', ') || 'not specified'}
Candidate skills: ${skillList}
Experience entries: ${expCount}
CV excerpt: ${cvText || 'Not available'}
Assessment score: ${scores.assessment ?? 0}%
Resume match score: ${scores.resume ?? 0}%
Interview score: ${scores.interview ?? 0}%
Composite score: ${scores.final ?? 0}%
Current pipeline stage: ${app.stage}

Recruiter's question: ${question.trim()}

Respond in 2-4 concise sentences. Be direct, professional, and evidence-based. Reference scores and skills where relevant.
    `.trim()

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      const score = scores.final ?? 0
      let answer = ''
      if (/strength|strong|good/i.test(question)) {
        answer = score >= 70
          ? `${name} is performing strongly with a composite score of ${score.toFixed(0)}%. Their skills (${skillList.slice(0, 80)}) align well with the role requirements. The assessment and resume scores both indicate solid capability. I'd recommend progressing them to the next stage.`
          : score >= 45
          ? `${name} shows some relevant skills including ${skillList.slice(0, 80)}. Their composite score of ${score.toFixed(0)}% is borderline - the assessment performance may be the limiting factor. Consider a closer review of their CV before deciding.`
          : `${name}'s profile shows limited alignment with role requirements at this stage (score: ${score.toFixed(0)}%). Their listed skills are: ${skillList.slice(0, 80)}. Further manual review of their CV would help clarify potential.`
      } else if (/risk|concern|weak/i.test(question)) {
        answer = score < 50
          ? `The primary concern with ${name} is their low composite score of ${score.toFixed(0)}%. This may reflect limited skill overlap or weaker assessment performance. The resume match score (${scores.resume ?? 0}%) suggests the CV doesn't closely align with the role's requirements.`
          : `${name}'s score of ${score.toFixed(0)}% is acceptable but the interview score (${scores.interview ?? 0}%) and assessment score (${scores.assessment ?? 0}%) should be reviewed carefully before making a decision.`
      } else if (/progress|next|recommend/i.test(question)) {
        answer = score >= 65
          ? `I recommend progressing ${name} - their composite score of ${score.toFixed(0)}% clears the typical 60% threshold. You can proceed to schedule an interview or move to the decision stage.`
          : `${name}'s current score of ${score.toFixed(0)}% is below the recommended 65% progression threshold. I'd suggest reviewing their CV manually or waiting for the assessment result before progressing.`
      } else {
        answer = `${name} currently has a composite score of ${score.toFixed(0)}% at the ${app.stage} stage. Their skills include: ${skillList.slice(0, 100)}. Resume match: ${scores.resume ?? 0}%, Assessment: ${scores.assessment ?? 0}%, Interview: ${scores.interview ?? 0}%.`
      }
      return res.json({ answer })
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(context)
    const answer = result.response.text().trim()
    res.json({ answer })
  } catch (err) { next(err) }
})

recruiterRouter.get('/jobs/:jobId/triage', async (req, res, next) => {
  try {
    const jobId = String(req.params.jobId)
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
    if (!jobIds.includes(jobId)) throw new HttpError(404, 'Job not found')
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
        ? 'Manual review - AI scores advisory only'
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
        `${rows.filter((r) => r.bucket === 'weak').length} weak candidates - consider rejection with documented rationale.`,
        'Run fairness gate before confirming any shortlist to check demographic parity.',
      ],
    })
  } catch (err) { next(err) }
})

recruiterRouter.post('/jobs/:jobId/bias-audit', async (req, res, next) => {
  try {
    const jobId = String(req.params.jobId)
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
    if (!jobIds.includes(jobId)) throw new HttpError(404, 'Job not found')
    const computation = await computeJobBiasAudit(jobId)

    const audit = await BiasAuditModel.create({
      job: jobId,
      runAt: new Date().toISOString(),
      disparateImpact: computation.disparateImpact,
      flagged: computation.flagged,
      details: computation.details,
    })

    await logAction({ actor: 'user', action: 'bias-audit-run', jobId, mode: 'assist', payload: { flagged: computation.flagged } })
    res.status(201).json({ ...audit.toObject(), _id: String(audit._id) })
  } catch (err) { next(err) }
})

recruiterRouter.get('/jobs/:jobId/bias-audit/latest', async (req, res, next) => {
  try {
    const jobId = String(req.params.jobId)
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
    if (!jobIds.includes(jobId)) throw new HttpError(404, 'Job not found')
    const audit = await BiasAuditModel.findOne({ job: jobId }).sort({ runAt: -1 }).lean()
    if (!audit) return res.json(null)
    res.json({ ...audit, _id: String(audit._id) })
  } catch (err) { next(err) }
})

recruiterRouter.post('/applications/:id/missed-interview/review', async (req, res, next) => {
  try {
    const { approved, note } = req.body as { approved?: boolean; note?: string }
    if (approved === undefined) throw new HttpError(400, 'approved is required')

    const app = await ApplicationModel.findById(String(req.params.id)).lean()
    if (!app) throw new HttpError(404, 'Application not found')
    const requestedTeamName = typeof req.header('x-team-scope') === 'string' ? req.header('x-team-scope') : undefined
    const jobIds = await resolveScopedJobIdsForTeam(req.user!._id, requestedTeamName)
    if (!jobIds.includes(String(app.job))) throw new HttpError(404, 'Application not found')

    if (approved) {
      await ApplicationModel.findByIdAndUpdate(String(app._id), {
        stage: 'interview',
        interviewMissed: false,
        decision: null,
        'missedInterviewRecovery.status': 'approved',
        'missedInterviewRecovery.reviewNote': note ?? '',
        'missedInterviewRecovery.reviewedAt': new Date().toISOString(),
      })
      notify(String(app.candidate), { type: 'info', title: 'Recovery Approved', body: 'Your missed interview recovery request has been approved. You will receive a new interview invitation.' })
    } else {
      await ApplicationModel.findByIdAndUpdate(String(app._id), {
        'missedInterviewRecovery.status': 'rejected',
        'missedInterviewRecovery.reviewNote': note ?? '',
        'missedInterviewRecovery.reviewedAt': new Date().toISOString(),
      })
      notify(String(app.candidate), { type: 'warning', title: 'Recovery Request Reviewed', body: 'Your missed interview recovery request was reviewed but could not be approved at this time.' })
    }

    await logAction({
      actor: 'user',
      action: approved ? 'missed-interview-recovery-approved' : 'missed-interview-recovery-rejected',
      candidateId: String(app.candidate),
      jobId: String(app.job),
      mode: 'assist',
      payload: { approved, note },
    })

    res.json({ ok: true, approved })
  } catch (err) { next(err) }
})
