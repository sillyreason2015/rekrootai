import api from '../lib/axios'

export const recruiterService = {
  getAuditLog: (params?: { page?: number; limit?: number; action?: string }) =>
    api.get('/recruiter/audit-log', { params }).then((r) => r.data),
}
