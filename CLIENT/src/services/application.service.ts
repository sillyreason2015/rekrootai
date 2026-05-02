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
  apply: (jobId: string) =>
    api.post<Application>('/applications', { jobId }).then((r) => r.data),
  myApplications: () =>
    api.get<Application[]>('/applications/mine').then((r) => r.data),
  get: (id: string) => api.get<Application>(`/applications/${id}`).then((r) => r.data),
  // recruiter
  listForJob: (jobId: string, params?: { stage?: string; page?: number }) =>
    api.get<PaginatedResponse<Application>>(`/applications/job/${jobId}`, { params }).then((r) => r.data),
  shortlist: (id: string) => api.post(`/applications/${id}/shortlist`).then((r) => r.data),
  sendAssessment: (id: string, durationMinutes = 60) =>
    api.post(`/applications/${id}/send-assessment`, { durationMinutes }).then((r) => r.data),
  reject: (id: string, reason?: string) =>
    api.post(`/applications/${id}/reject`, { reason }).then((r) => r.data),
  makeDecision: (id: string, decision: 'hire' | 'reject' | 'hold', notes?: string) =>
    api.post(`/applications/${id}/decision`, { decision, notes }).then((r) => r.data),
  getExplanation: (id: string) =>
    api.get<ExplanationResponse>(`/applications/${id}/explanation`).then((r) => r.data),
  runFairnessGate: (id: string) =>
    api.post(`/applications/${id}/fairness-gate`).then((r) => r.data),
  aiDecide: (payload: { jobId: string; shortlistThreshold?: number; rejectThreshold?: number }) =>
    api.post('/applications/ai-decide', payload).then((r) => r.data),
  sendCorrespondence: (id: string, payload: { subject?: string; message: string }) =>
    api.post(`/applications/${id}/correspondence/send`, payload).then((r) => r.data),
  getCorrespondenceThread: (id: string) =>
    api.get(`/applications/${id}/correspondence/thread`).then((r) => r.data),
  replyCorrespondence: (id: string, payload: { message: string }) =>
    api.post(`/applications/${id}/correspondence/reply`, payload).then((r) => r.data),
}
