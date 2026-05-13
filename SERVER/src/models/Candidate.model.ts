import { Schema, model } from 'mongoose'
import type { Candidate, ExperienceEntry, EducationEntry } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const experienceSchema = new Schema<ExperienceEntry>(
  {
    title: String,
    company: String,
    startDate: String,
    endDate: String,
    current: Boolean,
    description: String,
  },
  { _id: false },
)

const educationSchema = new Schema<EducationEntry>(
  {
    institution: String,
    degree: String,
    field: String,
    startDate: String,
    endDate: String,
    current: Boolean,
  },
  { _id: false },
)

const candidateSchema = new Schema<Candidate>(
  {
    user: { type: String, ref: 'User', required: true },
    headline: { type: String, default: '' },
    skills: { type: [String], default: [] },
    experience: { type: [experienceSchema], default: [] },
    education: { type: [educationSchema], default: [] },
    cvUrl: String,
    cvParsed: { type: Schema.Types.Mixed },
    linkedIn: String,
    portfolio: String,
    location: String,
    availableFrom: String,
  },
  baseSchemaOptions,
)

candidateSchema.index({ user: 1 }, { unique: true })

export const CandidateModel = model<Candidate>('Candidate', candidateSchema)
