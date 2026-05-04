import api from '../lib/axios'
import type { Interview } from '../types'

export const interviewService = {
  getMine: () => api.get<Interview[]>('/interviews/mine').then((r) => r.data),
  get: (id: string) => api.get<Interview>(`/interviews/${id}`).then((r) => r.data),
  schedule: (applicationId: string, scheduledAt: string, durationMin: number) =>
    api.post<Interview>('/interviews', { applicationId, scheduledAt, durationMin }).then((r) => r.data),
  getJoinToken: (id: string) =>
    api.get<{ token: string; roomName: string }>(`/interviews/${id}/token`).then((r) => r.data),
  submitRubric: (id: string, rubric: unknown[]) =>
    api.post(`/interviews/${id}/rubric`, { rubric }).then((r) => r.data),
  complete: (id: string) =>
    api.post(`/interviews/${id}/complete`).then((r) => r.data),
  reschedule: (id: string, payload: { scheduledAt: string; durationMin: number; reason?: string }) =>
    api.post(`/interviews/${id}/reschedule`, payload).then((r) => r.data),
  requestMissedInterviewRecovery: (id: string, payload: { reason: string; proposedAt?: string }) =>
    api.post(`/interviews/${id}/missed-recovery-request`, payload).then((r) => r.data),
}
