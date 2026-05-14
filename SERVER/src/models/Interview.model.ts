import { Schema, model } from 'mongoose'
import type { Interview, TranscriptEntry, RubricScore } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const transcriptEntrySchema = new Schema<TranscriptEntry>(
  {
    speaker: { type: String, enum: ['candidate', 'recruiter'] },
    text: String,
    timestamp: String,
  },
  { _id: false },
)

const rubricScoreSchema = new Schema<RubricScore>(
  {
    criterion: String,
    score: Number,
    maxScore: Number,
    notes: String,
  },
  { _id: false },
)

const interviewSchema = new Schema<Interview>(
  {
    application: { type: String, ref: 'Application', required: true, index: true },
    job: { type: String, ref: 'Job', required: true },
    candidate: { type: String, ref: 'Candidate', required: true, index: true },
    recruiter: { type: String, ref: 'User', required: true },
    scheduledAt: { type: String, required: true },
    durationMin: { type: Number, default: 45 },
    collaborationMode: { type: String, enum: ['veto', 'assist', 'override'], default: 'assist' },
    aiRecommendation: { type: String, enum: ['advance', 'hold', 'reject'] },
    roomToken: String,
    transcript: { type: [transcriptEntrySchema], default: [] },
    rubric: { type: [rubricScoreSchema], default: [] },
    aiAnalysis: { type: Schema.Types.Mixed },
    aiAnalysisStatus: { type: String, enum: ['idle', 'pending', 'completed', 'failed'], default: 'idle' },
    proctoringEvents: {
      type: [
        new Schema(
          {
            actor: { type: String, enum: ['candidate', 'recruiter', 'system'], required: true },
            type: { type: String, enum: ['tab_switch', 'window_blur', 'camera_off', 'mic_off', 'other'], required: true },
            reason: { type: String, required: true },
            at: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    score: Number,
    status: {
      type: String,
      enum: ['scheduled', 'live', 'completed', 'cancelled'],
      default: 'scheduled',
    },
  },
  baseSchemaOptions,
)

interviewSchema.index({ status: 1, scheduledAt: 1 })
interviewSchema.index({ recruiter: 1, scheduledAt: 1 })
interviewSchema.index({ application: 1, createdAt: -1 })
interviewSchema.index({ candidate: 1, status: 1 })

export const InterviewModel = model<Interview>('Interview', interviewSchema)
