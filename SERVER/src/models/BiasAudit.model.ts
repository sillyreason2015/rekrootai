import { Schema, model } from 'mongoose'
import type { BiasAudit } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const biasAuditSchema = new Schema<BiasAudit>(
  {
    job: { type: String, ref: 'Job', required: true, index: true },
    runAt: String,
    disparateImpact: { type: Map, of: Number },
    flagged: { type: Boolean, default: false },
    details: { type: Schema.Types.Mixed },
  },
  baseSchemaOptions,
)

export const BiasAuditModel = model<BiasAudit>('BiasAudit', biasAuditSchema)
