import { Schema, model } from 'mongoose'
import type { Assessment, AssessmentModule, Question, Answer } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const questionSchema = new Schema<Question>(
  {
    _id: { type: String, required: true },
    text: String,
    type: { type: String, enum: ['mcq', 'open', 'code'] },
    options: [String],
    correctIndex: Number,
    points: { type: Number, default: 1 },
  },
  { _id: false },
)

const answerSchema = new Schema<Answer>(
  {
    questionId: String,
    selected: Number,
    text: String,
  },
  { _id: false },
)

const moduleSchema = new Schema<AssessmentModule>(
  {
    type: { type: String, required: true },
    questions: { type: [questionSchema], default: [] },
    answers: { type: [answerSchema], default: [] },
    score: Number,
    timeSpent: Number,
    completedAt: String,
  },
  { _id: false },
)

const assessmentSchema = new Schema<Omit<Assessment, '_id'>>(
  {
    application: { type: String, ref: 'Application', required: true, index: true },
    job: { type: String, ref: 'Job', required: true },
    modules: { type: [moduleSchema], default: [] },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'expired'],
      default: 'pending',
    },
    startedAt: String,
    completedAt: String,
    expiresAt: { type: String, required: true },
    score: Number,
  },
  baseSchemaOptions,
)

export const AssessmentModel = model<Omit<Assessment, '_id'>>('Assessment', assessmentSchema)
