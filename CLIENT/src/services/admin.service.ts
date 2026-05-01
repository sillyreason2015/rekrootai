import api from '../lib/axios'
import type { BiasAudit } from '../types'

export const adminService = {
  getDashboard: () =>
    api.get<{
      scope?: 'platform' | 'company'
      totalUsers: number
      totalJobs: number
      totalApplications: number
      pipelineStats: unknown
      recentActivity: unknown[]
    }>('/admin/dashboard').then((r) => r.data),
  getAuditLog: (params?: { page?: number; limit?: number; action?: string }) =>
    api.get('/admin/audit-log', { params }).then((r) => r.data),
  getBiasAudits: () => api.get<BiasAudit[]>('/admin/bias-audits').then((r) => r.data),
  runBiasAudit: (jobId: string) =>
    api.post<BiasAudit>('/admin/bias-audits/run', { jobId }).then((r) => r.data),
  getTeam: () => api.get('/admin/team').then((r) => r.data),
  inviteTeamMember: (email: string, role: string) =>
    api.post('/admin/team/invite', { email, role }).then((r) => r.data),
  acceptInvite: (payload: { token: string; firstName: string; lastName: string; password: string }) =>
    api.post('/admin/team/invite/accept', payload).then((r) => r.data),
  getBilling: () => api.get('/admin/billing').then((r) => r.data),
  getSuperMetrics: () => api.get('/admin/super/metrics').then((r) => r.data),
  getSuperUsers: (params?: { page?: number; limit?: number; role?: string; q?: string }) =>
    api.get('/admin/super/users', { params }).then((r) => r.data),
  deleteSuperUser: (id: string) => api.delete(`/admin/super/users/${id}`).then((r) => r.data),
  getSuperCompanies: (params?: { page?: number; limit?: number; q?: string }) =>
    api.get('/admin/super/companies', { params }).then((r) => r.data),
  verifySuperCompany: (id: string) => api.post(`/admin/super/companies/${id}/verify`).then((r) => r.data),
}
