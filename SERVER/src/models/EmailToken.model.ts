import { Schema, model } from 'mongoose'
import { baseSchemaOptions } from './_base.js'

interface EmailTokenDoc {
  email: string
  kind: 'verify' | 'reset' | 'invite'
  token: string
  role?: 'candidate' | 'recruiter' | 'admin'
  expiresAt: string
  usedAt?: string
}

const emailTokenSchema = new Schema<EmailTokenDoc>(
  {
    email: { type: String, required: true, index: true },
    kind: { type: String, enum: ['verify', 'reset', 'invite'], required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ['candidate', 'recruiter', 'admin'] },
    expiresAt: { type: String, required: true },
    usedAt: String,
  },
  baseSchemaOptions,
)

export const EmailTokenModel = model<EmailTokenDoc>('EmailToken', emailTokenSchema)
