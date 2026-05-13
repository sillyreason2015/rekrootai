import { Schema, model } from 'mongoose'
import { baseSchemaOptions } from './_base.js'

export interface NotificationDoc {
  user: string
  type: string
  title: string
  body: string
  link?: string
  read: boolean
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    user: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: String,
    read: { type: Boolean, default: false, index: true },
  },
  baseSchemaOptions,
)

notificationSchema.index({ user: 1, createdAt: -1 })
notificationSchema.index({ user: 1, read: 1, createdAt: -1 })

export const NotificationModel = model<NotificationDoc>('Notification', notificationSchema)
