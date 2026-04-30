import { Schema, model } from 'mongoose'
import type { AuditLogEntry } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const auditLogSchema = new Schema<Omit<AuditLogEntry, '_id' | 'timestamp'>>(
  {
    actor: { type: String, enum: ['user', 'ai'], required: true },
    action: { type: String, required: true, index: true },
    candidateId: String,
    jobId: String,
    mode: { type: String, enum: ['veto', 'assist', 'override'] },
    modelVersion: String,
    inputHash: String,
    payload: { type: Schema.Types.Mixed },
  },
  {
    ...baseSchemaOptions,
    // Use createdAt as the audit timestamp
    timestamps: { createdAt: 'timestamp', updatedAt: false },
  },
)

auditLogSchema.index({ timestamp: -1 })

export const AuditLogModel = model<Omit<AuditLogEntry, '_id' | 'timestamp'>>('AuditLog', auditLogSchema)
