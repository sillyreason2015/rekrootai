import { Schema, model } from 'mongoose'
import type { User } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

// Omit createdAt — handled by Mongoose timestamps
type UserDoc = Omit<User, 'createdAt'>

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['candidate', 'recruiter', 'admin', 'super_admin'], required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    isVerified: { type: Boolean, default: false },
    onboardingComplete: { type: Boolean, default: false },
    companyName: { type: String, trim: true },
    teamName: { type: String, trim: true },
    permissions: {
      canCreateJobs: { type: Boolean, default: false },
      canManageBilling: { type: Boolean, default: false },
      canManageTeam: { type: Boolean, default: false },
      canViewAllCandidates: { type: Boolean, default: false },
    },
    availabilityStatus: { type: String, enum: ['available', 'busy'], default: 'available' },
    phone: { type: String, trim: true },
    avatarUrl: { type: String, trim: true },
    avatarDataUrl: { type: String },
    oauthProviders: { type: [String], enum: ['google', 'microsoft'], default: [] },
  },
  baseSchemaOptions,
)

// Note: email already has a unique index via the schema field definition

export const UserModel = model<UserDoc>('User', userSchema)
