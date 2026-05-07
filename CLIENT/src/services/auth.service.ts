import api from '../lib/axios'
import type { User } from '../types'

export const authService = {
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  oauthGoogleUrl: () => `${api.defaults.baseURL}/auth/google`,
  oauthMicrosoftUrl: () => `${api.defaults.baseURL}/auth/microsoft`,
  verifyEmail: (otp: string) => api.post('/auth/verify-email', { otp }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (email: string, otp: string, password: string) =>
    api.post('/auth/reset-password', { email, otp, password }),
}
