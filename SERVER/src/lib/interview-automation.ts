import { InterviewModel } from '../models/Interview.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { logAction } from '../data/store.js'
import { notify } from './notify.js'
import { env } from '../config/env.js'
import { computeCompositeScore } from './scoring.js'

export type PersistedTranscriptLine = { speaker: 'candidate' | 'recruiter'; text: string; timestamp: string }

export function mergeTranscriptEntries(
  existing: PersistedTranscriptLine[] | undefined,
  incoming: PersistedTranscriptLine[],
  speaker: 'candidate' | 'recruiter'
) {
  const preserved = Array.isArray(existing) ? existing.filter((line) => line.speaker !== speaker) : []
  return [...preserved, ...incoming].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

function buildRuleBasedAnalysis(interview: {
  rubric?: Array<{ criterion?: string; score?: number; notes?: string }>
  transcript?: PersistedTranscriptLine[]
  score?: number
  collaborationMode?: 'veto' | 'assist' | 'override'
  aiRecommendation?: 'advance' | 'hold' | 'reject'
}) {
  const rubric = Array.isArray(interview.rubric) ? interview.rubric : []
  const transcript = Array.isArray(interview.transcript) ? interview.transcript : []
  const score = Number(interview.score ?? 0)
  const strengths = rubric
    .filter((item) => Number(item.score ?? 0) >= 4)
    .map((item) => item.criterion)
    .filter(Boolean)
  const concerns = rubric
    .filter((item) => Number(item.score ?? 0) > 0 && Number(item.score ?? 0) <= 2)
    .map((item) => item.criterion)
    .filter(Boolean)
  const candidateTurns = transcript.filter((line) => line.speaker === 'candidate')
  const recruiterTurns = transcript.filter((line) => line.speaker === 'recruiter')

  let recommendation: 'advance' | 'hold' | 'reject' = interview.aiRecommendation ?? 'hold'
  if (!interview.aiRecommendation) {
    if (score >= 70) recommendation = 'advance'
    else if (score <= 39) recommendation = 'reject'
  }

  return {
    provider: 'rule-based',
    modelVersion: 'interview-summary-v1',
    generatedAt: new Date().toISOString(),
    recommendation,
    collaborationMode: interview.collaborationMode ?? 'assist',
    summary:
      score >= 70
        ? 'Interview indicates a strong overall fit based on rubric performance and discussion quality.'
        : score >= 40
          ? 'Interview indicates a mixed outcome that may require recruiter review before a final decision.'
          : 'Interview indicates notable gaps that should block progression unless manually overridden.',
    scoreBand: score >= 70 ? 'strong' : score >= 40 ? 'mixed' : 'weak',
    strengths,
    concerns,
    transcriptStats: {
      totalEntries: transcript.length,
      candidateTurns: candidateTurns.length,
      recruiterTurns: recruiterTurns.length,
    },
  }
}

export async function buildInterviewAnalysis(interview: {
  rubric?: Array<{ criterion?: string; score?: number; notes?: string }>
  transcript?: PersistedTranscriptLine[]
  score?: number
  collaborationMode?: 'veto' | 'assist' | 'override'
  aiRecommendation?: 'advance' | 'hold' | 'reject'
}) {
  const fallback = buildRuleBasedAnalysis(interview)
  if (!env.GEMINI_API_KEY) return fallback

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const prompt = [
      'You are an interview analysis assistant for a hiring system.',
      'Return compact JSON only with keys: summary, strengths, concerns, recommendation.',
      `Collaboration mode: ${interview.collaborationMode ?? 'assist'}`,
      `Score: ${Number(interview.score ?? 0)}`,
      `Rubric: ${JSON.stringify(interview.rubric ?? [])}`,
      `Transcript: ${JSON.stringify((interview.transcript ?? []).slice(-40))}`,
    ].join('\n')
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) return fallback
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      summary?: string
      strengths?: string[]
      concerns?: string[]
      recommendation?: 'advance' | 'hold' | 'reject'
    }
    return {
      ...fallback,
      provider: 'gemini',
      modelVersion: 'gemini-2.5-flash',
      summary: parsed.summary ?? fallback.summary,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : fallback.strengths,
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : fallback.concerns,
      recommendation: parsed.recommendation ?? fallback.recommendation,
    }
  } catch {
    return fallback
  }
}

export async function reconcileInterviewState(interviewId: string) {
  const interview = await InterviewModel.findById(interviewId).lean()
  if (!interview || interview.status !== 'scheduled') return interview
  const scheduledEnd = new Date(interview.scheduledAt).getTime() + ((interview.durationMin ?? 45) * 60 * 1000)
  if (Number.isNaN(scheduledEnd) || Date.now() < scheduledEnd) return interview

  await InterviewModel.findByIdAndUpdate(interview._id, { status: 'cancelled', score: 0 })
  const application = await ApplicationModel.findById(interview.application, { scores: 1 }).lean()
  const currentScores = application?.scores ?? {}
  await ApplicationModel.findByIdAndUpdate(interview.application, {
    interviewMissed: true,
    stage: 'rejected',
    status: 'rejected',
    decision: 'reject',
    decisionAt: new Date().toISOString(),
    'scores.interview': 0,
    'scores.final': computeCompositeScore({
      resume: currentScores.resume,
      assessment: currentScores.assessment,
      penalty: currentScores.penalty,
      interview: 0,
    }, 'rejected'),
  })
  await logAction({
    actor: 'ai',
    action: 'interview-missed-auto-reject',
    candidateId: String(interview.candidate),
    jobId: String(interview.job),
    mode: interview.collaborationMode ?? 'assist',
    payload: { reason: 'Interview window elapsed without completion', score: 0 },
  })
  notify(String(interview.candidate), {
    type: 'warning',
    title: 'Interview Missed',
    body: 'Your scheduled interview window elapsed without completion. You may submit a recovery request if appropriate.',
  })
  return InterviewModel.findById(interviewId).lean()
}

export async function reconcileExpiredInterviews(limit = 50) {
  const nowIso = new Date().toISOString()
  const candidates = await InterviewModel.find(
    { status: 'scheduled', scheduledAt: { $lte: nowIso } },
    { _id: 1 }
  )
    .sort({ scheduledAt: 1 })
    .limit(limit)
    .lean()

  let processed = 0
  for (const item of candidates) {
    const before = await InterviewModel.findById(item._id, { status: 1 }).lean()
    const after = await reconcileInterviewState(String(item._id))
    if (before?.status === 'scheduled' && after?.status === 'cancelled') processed += 1
  }
  return processed
}

export async function ensureInterviewAccess(interviewId: string, userId: string, role: string) {
  const interview = await InterviewModel.findById(interviewId).lean()
  if (!interview) return null
  if (role === 'admin' || role === 'super_admin') return interview
  const candidate = await CandidateModel.findOne({ user: userId }, { _id: 1 }).lean()
  const isRecruiter = String(interview.recruiter) === String(userId)
  const isCandidate = candidate ? String(interview.candidate) === String(candidate._id) : false
  if (!isRecruiter && !isCandidate) return null
  return interview
}
