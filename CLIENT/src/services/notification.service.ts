import api from '../lib/axios'

export interface Notification {
  _id: string
  type: string
  title: string
  body: string
  link?: string
  read: boolean
  createdAt: string
}

export interface NotificationSummary {
  notifications: Notification[]
  unreadCount: number
}

export const notificationService = {
  getMine: () =>
    api.get<NotificationSummary>('/notifications/mine').then((r) => r.data),
  markRead: (ids?: string[]) =>
    api.patch('/notifications/mark-read', ids ? { ids } : {}).then((r) => r.data),
  dismiss: (id: string) =>
    api.delete(`/notifications/${id}`).then((r) => r.data),
}
