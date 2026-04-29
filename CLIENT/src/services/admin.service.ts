import api from '../lib/axios'
import type { BiasAudit } from '../types'

export const adminService = {
  getDashboard: () =>
    api.get<{
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
  getBilling: () => api.get('/admin/billing').then((r) => r.data),
}
