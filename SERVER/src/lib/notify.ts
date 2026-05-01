import { NotificationModel } from '../models/Notification.model.js'

/**
 * Fire-and-forget in-app notification.
 * Never throws — safe to call without await in route handlers.
 */
export function notify(
  userId: string,
  data: { type: string; title: string; body: string; link?: string },
): void {
  NotificationModel.create({ user: userId, ...data, read: false }).catch((err) => {
    console.error('[notify] Failed to create notification:', err)
  })
}
