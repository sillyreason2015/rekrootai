import { Schema, model } from 'mongoose'
import type { OAuthIdentity } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const oauthIdentitySchema = new Schema<Omit<OAuthIdentity, '_id' | 'linkedAt'>>(
  {
    user: { type: String, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['google', 'microsoft'], required: true },
    providerUserId: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
  },
  baseSchemaOptions,
)

oauthIdentitySchema.index({ provider: 1, providerUserId: 1 }, { unique: true })
oauthIdentitySchema.index({ user: 1, provider: 1 }, { unique: true })

export const OAuthIdentityModel = model<Omit<OAuthIdentity, '_id' | 'linkedAt'>>('OAuthIdentity', oauthIdentitySchema)
