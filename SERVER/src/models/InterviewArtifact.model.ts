import { Schema, model } from 'mongoose'
import type { InterviewArtifact } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const interviewArtifactSchema = new Schema<Omit<InterviewArtifact, '_id' | 'createdAt'>>(
  {
    interview: { type: String, ref: 'Interview', required: true, index: true },
    application: { type: String, ref: 'Application', required: true, index: true },
    job: { type: String, ref: 'Job', required: true, index: true },
    candidate: { type: String, ref: 'Candidate', required: true, index: true },
    kind: { type: String, enum: ['recording', 'transcript', 'analysis'], required: true },
    status: { type: String, enum: ['pending', 'uploaded', 'processing', 'completed', 'failed'], default: 'pending' },
    storageKey: String,
    mimeType: String,
    sizeBytes: Number,
    uploadedBy: String,
    startedAt: String,
    completedAt: String,
    metadata: { type: Schema.Types.Mixed },
  },
  baseSchemaOptions,
)

interviewArtifactSchema.index({ interview: 1, kind: 1, createdAt: -1 })

export const InterviewArtifactModel = model<Omit<InterviewArtifact, '_id' | 'createdAt'>>('InterviewArtifact', interviewArtifactSchema)
