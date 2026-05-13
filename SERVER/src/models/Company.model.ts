import { Schema, model } from 'mongoose'
import type { Company } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const companySchema = new Schema<Company>(
  {
    name: { type: String, required: true },
    legalName: String,
    industry: String,
    size: String,
    hqCountry: String,
    website: String,
    logoUrl: String,
    description: String,
    tone: String,
    mission: String,
    vision: String,
    values: [String],
    registrationNumber: String,
    taxId: String,
    businessEmail: String,
    isVerified: { type: Boolean, default: false },
    verifiedAt: String,
    verifiedBy: { type: String, ref: 'User' },
    createdBy: { type: String, ref: 'User', index: true },
  },
  baseSchemaOptions,
)

export const CompanyModel = model<Company>('Company', companySchema)
