import { Schema, model } from 'mongoose'
import type { Company } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const companySchema = new Schema<Company>(
  {
    name: { type: String, required: true },
    industry: String,
    size: String,
    website: String,
    logoUrl: String,
    description: String,
    mission: String,
    vision: String,
    values: [String],
  },
  baseSchemaOptions,
)

export const CompanyModel = model<Company>('Company', companySchema)
