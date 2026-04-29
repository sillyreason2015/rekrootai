import api from '../lib/axios'
import type { Application, PaginatedResponse } from '../types'

export const applicationService = {
  apply: (jobId: string) =>
    api.post<Application>('/applications', { jobId }).then((r) => r.data),
  myApplications: () =>
    api.get<Application[]>('/applications/mine').then((r) => r.data),
  get: (id: string) => api.get<Application>(`/applications/${id}`).then((r) => r.data),
  // recruiter
  listForJob: (jobId: string, params?: { stage?: string; page?: number }) =>
    api.get<PaginatedResponse<Application>>(`/applications/job/${jobId}`, { params }).then((r) => r.data),
  shortlist: (id: string) => api.post(`/applications/${id}/shortlist`).then((r) => r.data),
  reject: (id: string, reason?: string) =>
    api.post(`/applications/${id}/reject`, { reason }).then((r) => r.data),
  makeDecision: (id: string, decision: 'hire' | 'reject' | 'hold', notes?: string) =>
    api.post(`/applications/${id}/decision`, { decision, notes }).then((r) => r.data),
  getExplanation: (id: string) =>
    api.get<{ explanation: unknown; scores: unknown }>(`/applications/${id}/explanation`).then((r) => r.data),
  sendCorrespondence: (id: string, message: string) =>
    api.post(`/applications/${id}/correspondence/send`, { message }).then((r) => r.data),
}
