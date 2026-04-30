import { Schema, model } from 'mongoose'
import type { Application } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const applicationSchema = new Schema<Omit<Application, 'createdAt'>>(
  {
    job: { type: String, ref: 'Job', required: true, index: true },
    candidate: { type: String, ref: 'Candidate', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'shortlisted', 'assessment_sent', 'interview_scheduled', 'decision_made', 'rejected', 'hired'],
      default: 'pending',
    },
    scores: {
      resume: { type: Number, default: 0 },
      assessment: { type: Number, default: 0 },
      penalty: { type: Number, default: 0 },
      interview: { type: Number, default: 0 },
      final: { type: Number, default: 0 },
    },
    stage: {
      type: String,
      enum: ['applied', 'screening', 'assessment', 'interview', 'decision', 'offered', 'rejected'],
      default: 'applied',
    },
    recruiterNotes: String,
    decision: { type: String, enum: ['hire', 'reject', 'hold'] },
    decisionBy: String,
    decisionAt: String,
  },
  baseSchemaOptions,
)

applicationSchema.index({ job: 1, stage: 1 })

export const ApplicationModel = model<Omit<Application, 'createdAt'>>('Application', applicationSchema)
