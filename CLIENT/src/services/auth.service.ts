import api from '../lib/axios'
import type { User } from '../types'

export const authService = {
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
}
