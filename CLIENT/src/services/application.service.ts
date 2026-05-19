import api from '../lib/axios'
import type { Application, PaginatedResponse } from '../types'

export interface ScoreBreakdown {
  resumeScore: number
  assessmentScore: number
  penaltyApplied: number
  interviewScore: number
  finalScore: number
  weights: { w1: number; w2: number; w3: number; w4: number }
  explanation: string
  shapValues?: Record<string, number>
  recruiterNote?: string | null
  stage?: string
  decision?: string
}

export interface ExplanationResponse {
  explanation: string
  scores: ScoreBreakdown
}

export const applicationService = {
  apply: (jobId: string, applicationAnswers?: Array<{ question: string; answer: string }>) =>
    api.post<Application>('/applications', { jobId, applicationAnswers }).then((r) => r.data),
  myApplications: () =>
    api.get<Application[]>('/applications/mine').then((r) => r.data),
  get: (id: string) => api.get<Application>(`/applications/${id}`).then((r) => r.data),
  // recruiter
  listForJob: (jobId: string, params?: { stage?: string; page?: number }) =>
    api.get<PaginatedResponse<Application>>(`/applications/job/${jobId}`, { params }).then((r) => r.data),
  shortlist: (id: string, mode?: string) => api.post(`/applications/${id}/shortlist`, { mode }).then((r) => r.data),
  sendAssessment: (id: string, durationMinutes = 60) =>
    api.post(`/applications/${id}/send-assessment`, { durationMinutes }).then((r) => r.data),
  undoAssessment: (id: string) =>
    api.post(`/applications/${id}/undo-assessment`).then((r) => r.data),
  reject: (id: string, reason?: string, mode?: string) =>
    api.post(`/applications/${id}/reject`, { reason, mode }).then((r) => r.data),
  makeDecision: (id: string, decision: 'hire' | 'reject' | 'hold', notes?: string) =>
    api.post(`/applications/${id}/decision`, { decision, notes }).then((r) => r.data),
  getExplanation: (id: string) =>
    api.get<ExplanationResponse>(`/applications/${id}/explanation`).then((r) => r.data),
  runFairnessGate: (id: string) =>
    api.post(`/applications/${id}/fairness-gate`).then((r) => r.data),
  aiDecide: (payload: { jobId: string; shortlistThreshold?: number; rejectThreshold?: number }) =>
    api.post('/applications/ai-decide', payload).then((r) => r.data),
  undoVeto: (id: string) =>
    api.post(`/applications/${id}/undo-veto`).then((r) => r.data),
  sendCorrespondence: (id: string, payload: { subject?: string; message: string }) =>
    api.post(`/applications/${id}/correspondence/send`, payload).then((r) => r.data),
  getCorrespondenceThread: (id: string) =>
    api.get<{ thread: Array<Record<string, unknown>> }>(`/applications/${id}/correspondence/thread`).then((r) => r.data),
  replyCorrespondence: (id: string, payload: { subject?: string; message: string }) =>
    api.post(`/applications/${id}/correspondence/reply`, payload).then((r) => r.data),
  saveNotes: (id: string, notes: string) =>
    api.patch(`/applications/${id}/notes`, { notes }).then((r) => r.data),
  bulkAction: (ids: string[], action: 'shortlist' | 'reject' | 'send-assessment') =>
    api.post('/applications/bulk-action', { ids, action }).then((r) => r.data),
}
