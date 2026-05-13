import { InterviewModel } from '../models/Interview.model.js'
import { InterviewArtifactModel } from '../models/InterviewArtifact.model.js'
import { AiOutputModel } from '../models/AiOutput.model.js'
import { buildInterviewAnalysis } from './interview-automation.js'
import { notify } from './notify.js'

let analysisSweepTimer: NodeJS.Timeout | null = null

export async function enqueueInterviewAnalysis(interviewId: string) {
  await InterviewModel.findByIdAndUpdate(interviewId, { aiAnalysisStatus: 'pending' })
}

async function processInterviewAnalysis(interviewId: string) {
  const interview = await InterviewModel.findById(interviewId).lean()
  if (!interview || interview.status !== 'completed') return false

  const analysis = await buildInterviewAnalysis({
    rubric: interview.rubric,
    transcript: interview.transcript,
    score: interview.score,
    collaborationMode: interview.collaborationMode,
    aiRecommendation: interview.aiRecommendation,
  })

  await Promise.all([
    InterviewModel.findByIdAndUpdate(interviewId, {
      aiAnalysis: analysis,
      aiAnalysisStatus: 'completed',
    }),
    InterviewArtifactModel.findOneAndUpdate(
      { interview: interviewId, kind: 'analysis' },
      {
        $set: {
          application: String(interview.application),
          job: String(interview.job),
          candidate: String(interview.candidate),
          status: 'completed',
          completedAt: new Date().toISOString(),
          metadata: analysis,
        },
        $setOnInsert: {
          startedAt: new Date().toISOString(),
        },
      },
      { upsert: true, new: true },
    ),
    AiOutputModel.create({
      application: String(interview.application),
      type: 'interview_analysis',
      input: {
        interviewId,
        rubric: interview.rubric ?? [],
        transcriptCount: Array.isArray(interview.transcript) ? interview.transcript.length : 0,
        collaborationMode: interview.collaborationMode ?? 'assist',
      },
      output: analysis,
      modelVersion: String((analysis as { modelVersion?: string }).modelVersion ?? 'interview-summary-v1'),
    }),
  ])

  notify(String(interview.recruiter), {
    type: 'interview_analysis_ready',
    title: 'Interview Analysis Ready',
    body: 'The interview analysis artifact has been generated and saved.',
    link: `/recruiter/final-selection`,
  })
  return true
}

export function startInterviewAnalysisWorker() {
  if (analysisSweepTimer) return
  analysisSweepTimer = setInterval(() => {
    void drainInterviewAnalysisQueue().catch((err) => {
      console.error('[analysis-worker] failed:', err)
    })
  }, 30_000)
  if (typeof analysisSweepTimer.unref === 'function') analysisSweepTimer.unref()
  void drainInterviewAnalysisQueue().catch((err) => {
    console.error('[analysis-worker] initial drain failed:', err)
  })
}

export function stopInterviewAnalysisWorker() {
  if (analysisSweepTimer) {
    clearInterval(analysisSweepTimer)
    analysisSweepTimer = null
  }
}

export async function drainInterviewAnalysisQueue(limit = 20) {
  const pending = await InterviewModel.find({ aiAnalysisStatus: 'pending', status: 'completed' }, { _id: 1 })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean()

  let processed = 0
  for (const item of pending) {
    const ok = await processInterviewAnalysis(String(item._id)).catch(async () => {
      await InterviewModel.findByIdAndUpdate(item._id, { aiAnalysisStatus: 'failed' })
      await InterviewArtifactModel.findOneAndUpdate(
        { interview: String(item._id), kind: 'analysis' },
        { $set: { status: 'failed', completedAt: new Date().toISOString() } },
        { upsert: true },
      )
      return false
    })
    if (ok) processed += 1
  }
  return processed
}
