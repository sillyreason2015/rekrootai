import { Schema, model } from 'mongoose'
import { baseSchemaOptions } from './_base.js'

interface ProtectedAttributeDoc {
  _id: string
  candidate: string
  gender?: string
  ageRange?: string
  ethnicity?: string
}

const protectedAttributeSchema = new Schema<ProtectedAttributeDoc>(
  {
    candidate: { type: String, ref: 'Candidate', required: true, unique: true, index: true },
    gender: String,
    ageRange: String,
    ethnicity: String,
  },
  baseSchemaOptions,
)

export const ProtectedAttributeModel = model<ProtectedAttributeDoc>('ProtectedAttribute', protectedAttributeSchema)
