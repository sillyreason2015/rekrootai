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
    roomToken: String,
    transcript: { type: [transcriptEntrySchema], default: [] },
    rubric: { type: [rubricScoreSchema], default: [] },
    aiAnalysis: { type: Schema.Types.Mixed },
    score: Number,
    status: {
      type: String,
      enum: ['scheduled', 'live', 'completed', 'cancelled'],
      default: 'scheduled',
    },
  },
  baseSchemaOptions,
)

export const InterviewModel = model<Interview>('Interview', interviewSchema)
