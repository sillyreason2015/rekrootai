import api from '../lib/axios'
import type { LinkedProvider, User } from '../types'

export const authService = {
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  providerStatus: () => api.get<{ googleEnabled: boolean; microsoftEnabled: boolean }>('/auth/provider-status').then((r) => r.data),
  linkedProviders: () => api.get<{ providers: LinkedProvider[] }>('/auth/linked-providers').then((r) => r.data),
  unlinkProvider: (provider: 'google' | 'microsoft') => api.delete(`/auth/linked-providers/${provider}`).then((r) => r.data),
  oauthGoogleUrl: () => `${api.defaults.baseURL}/auth/google`,
  oauthMicrosoftUrl: () => `${api.defaults.baseURL}/auth/microsoft`,
  linkGoogleUrl: () => `${api.defaults.baseURL}/auth/link/google`,
  linkMicrosoftUrl: () => `${api.defaults.baseURL}/auth/link/microsoft`,
  verifyEmail: (otp: string) => api.post('/auth/verify-email', { otp }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (email: string, otp: string, password: string) =>
    api.post('/auth/reset-password', { email, otp, password }),
}
