import { Schema, model } from 'mongoose'
import type { AiOutput } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const aiOutputSchema = new Schema<Omit<AiOutput, 'createdAt'>>(
  {
    application: { type: String, ref: 'Application', required: true, index: true },
    type: {
      type: String,
      enum: ['resume_rank', 'assessment_score', 'interview_analysis', 'bias_audit', 'explanation'],
    },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    modelVersion: String,
  },
  baseSchemaOptions,
)

export const AiOutputModel = model<Omit<AiOutput, 'createdAt'>>('AiOutput', aiOutputSchema)
