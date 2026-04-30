import api from '../lib/axios'
import type { User } from '../types'

export const authService = {
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  oauthGoogleUrl: () => `${api.defaults.baseURL}/auth/google`,
  oauthMicrosoftUrl: () => `${api.defaults.baseURL}/auth/microsoft`,
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
}
