import { Router } from 'express'
import { NotificationModel } from '../models/Notification.model.js'
import { requireAuth } from '../lib/auth.js'

export const notificationsRouter = Router()

// GET /notifications/mine
notificationsRouter.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      NotificationModel.find({ user: String(req.user!._id) })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      NotificationModel.countDocuments({ user: String(req.user!._id), read: false }),
    ])
    res.json({
      notifications: notifications.map((n) => ({ ...n, _id: String(n._id) })),
      unreadCount,
    })
  } catch (err) {
    next(err)
  }
})

// PATCH /notifications/mark-read  — pass { ids: [...] } to mark specific, or empty body to mark all
notificationsRouter.patch('/mark-read', requireAuth, async (req, res, next) => {
  try {
    const { ids } = req.body as { ids?: string[] }
    const filter = ids?.length
      ? { _id: { $in: ids }, user: String(req.user!._id) }
      : { user: String(req.user!._id) }
    await NotificationModel.updateMany(filter, { read: true })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /notifications/:id
notificationsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await NotificationModel.deleteOne({ _id: String(req.params.id), user: String(req.user!._id) })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
