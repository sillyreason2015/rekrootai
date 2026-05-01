import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { NotificationModel } from '../models/Notification.model.js'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get('/mine', async (req, res, next) => {
  try {
    const notifications = await NotificationModel.find({ user: req.user!._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    const unreadCount = await NotificationModel.countDocuments({ user: req.user!._id, read: false })
    res.json({
      notifications: notifications.map((n) => ({ ...n, _id: String(n._id) })),
      unreadCount,
    })
  } catch (err) {
    next(err)
  }
})

notificationsRouter.patch('/mark-read', async (req, res, next) => {
  try {
    const ids = (req.body as { ids?: string[] })?.ids
    if (ids?.length) {
      await NotificationModel.updateMany({ _id: { $in: ids }, user: req.user!._id }, { read: true })
    } else {
      await NotificationModel.updateMany({ user: req.user!._id, read: false }, { read: true })
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

notificationsRouter.delete('/:id', async (req, res, next) => {
  try {
    await NotificationModel.deleteOne({ _id: String(req.params.id), user: req.user!._id })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
