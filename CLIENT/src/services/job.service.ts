import api from '../lib/axios'
import type { Job, PaginatedResponse } from '../types'

export const jobService = {
  list: (params?: { page?: number; limit?: number; search?: string; type?: string; remote?: string }) =>
    api.get<PaginatedResponse<Job>>('/jobs', { params }).then((r) => r.data),
  get: (id: string) => api.get<Job>(`/jobs/${id}`).then((r) => r.data),
  create: (data: Partial<Job>) => api.post<Job>('/jobs', data).then((r) => r.data),
  update: (id: string, data: Partial<Job>) =>
    api.patch<Job>(`/jobs/${id}`, data).then((r) => r.data),
  publish: (id: string) => api.post(`/jobs/${id}/publish`).then((r) => r.data),
  close: (id: string) => api.post(`/jobs/${id}/close`).then((r) => r.data),
  myJobs: (params?: { page?: number; status?: string }) =>
    api.get<PaginatedResponse<Job>>('/jobs/mine', { params }).then((r) => r.data),
  updateAssignment: (id: string, payload: { recruiterId?: string | null; note?: string }) =>
    api.patch<Job>(`/jobs/${id}/assignment`, payload).then((r) => r.data),
  updateThresholds: (id: string, thresholds: { assessment?: number; fairness?: number; interview?: number }) =>
    api.patch(`/jobs/${id}/thresholds`, thresholds).then((r) => r.data),
  delete: (id: string) => api.delete(`/jobs/${id}`).then((r) => r.data),
  getTemplates: () => api.get<Job[]>('/jobs/templates').then((r) => r.data),
  saveAsTemplate: (id: string, name?: string) => api.post(`/jobs/${id}/save-as-template`, { name }).then((r) => r.data),
}
