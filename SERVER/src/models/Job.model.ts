import { Schema, model } from 'mongoose'
import type { Job, AssessmentModuleConfig } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const moduleConfigSchema = new Schema<AssessmentModuleConfig>(
  {
    type: { type: String, enum: ['aptitude', 'technical', 'situational', 'personality'] },
    timeLimit: Number,
    weight: Number,
  },
  { _id: false },
)

const jobSchema = new Schema<Omit<Job, 'createdAt'>>(
  {
    company: { type: String, ref: 'Company', required: true },
    title: { type: String, required: true },
    department: String,
    location: String,
    type: { type: String, enum: ['full-time', 'part-time', 'contract', 'internship'] },
    remote: { type: String, enum: ['on-site', 'hybrid', 'remote'] },
    description: { type: String, default: '' },
    requirements: { type: [String], default: [] },
    responsibilities: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    salaryMin: Number,
    salaryMax: Number,
    salaryCurrency: { type: String, default: 'USD' },
    status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
    applicationDeadline: String,
    assessmentModules: { type: [moduleConfigSchema], default: [] },
    thresholds: {
      screening: { type: Number, default: 0.5 },
      assessment: { type: Number, default: 70 },
      fairness: { type: Number, default: 0.5 },
      interview: { type: Number, default: 70 },
    },
    alpha: { type: Number, default: 0.4 },
    createdBy: { type: String, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

jobSchema.index({ status: 1 })
jobSchema.index({ createdBy: 1 })

export const JobModel = model<Omit<Job, 'createdAt'>>('Job', jobSchema)
