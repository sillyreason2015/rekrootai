import api from '../lib/axios'
import type { Interview } from '../types'

export const interviewService = {
  getMine: () => api.get<Interview[]>('/interviews/mine').then((r) => r.data),
  get: (id: string) => api.get<Interview>(`/interviews/${id}`).then((r) => r.data),
  getArtifacts: (id: string) => api.get<Interview>(`/interviews/${id}/artifacts`).then((r) => r.data),
  schedule: (applicationId: string, scheduledAt: string, durationMin: number, mode?: 'veto' | 'assist' | 'override') =>
    api.post<Interview>('/interviews', { applicationId, scheduledAt, durationMin, mode }).then((r) => r.data),
  getJoinToken: (id: string) =>
    api.get<{ token: string; roomName: string }>(`/interviews/${id}/token`).then((r) => r.data),
  submitRubric: (id: string, rubric: unknown[]) =>
    api.post(`/interviews/${id}/rubric`, { rubric }).then((r) => r.data),
  complete: (id: string, score = 0, mode?: 'veto' | 'assist' | 'override', aiRecommendation?: 'advance' | 'hold' | 'reject') =>
    api.post(`/interviews/${id}/complete`, { score, mode, aiRecommendation }).then((r) => r.data),
  uploadRecording: (id: string, file: Blob, filename: string) => {
    const form = new FormData()
    form.append('recording', file, filename)
    return api.post(`/interviews/${id}/artifacts/recording`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  reschedule: (id: string, payload: { scheduledAt: string; durationMin: number; reason?: string }) =>
    api.post(`/interviews/${id}/reschedule`, payload).then((r) => r.data),
  requestMissedInterviewRecovery: (id: string, payload: { reason: string; proposedAt?: string }) =>
    api.post(`/interviews/${id}/missed-recovery-request`, payload).then((r) => r.data),
}
