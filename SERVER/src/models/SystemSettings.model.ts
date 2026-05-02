import { Schema, model } from 'mongoose'
import { baseSchemaOptions } from './_base.js'

const systemSettingsSchema = new Schema(
  {
    maintenance: { type: Boolean, default: false },
    maintenanceMsg: { type: String, default: 'The platform is undergoing scheduled maintenance. We will be back shortly.' },
    aiAssist: { type: Boolean, default: true },
    fairnessGate: { type: Boolean, default: true },
    shapExplain: { type: Boolean, default: true },
    proctoring: { type: Boolean, default: true },
    geminiGen: { type: Boolean, default: true },
    gdprMode: { type: Boolean, default: true },
    auditImmutable: { type: Boolean, default: true },
    candidateExplain: { type: Boolean, default: true },
    retentionDays: { type: Number, default: 730 },
  },
  baseSchemaOptions,
)

export const SystemSettingsModel = model('SystemSettings', systemSettingsSchema)
