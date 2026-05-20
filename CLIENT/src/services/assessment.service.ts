import api from '../lib/axios'
import type { Assessment } from '../types'

export const assessmentService = {
  getMine: (applicationId: string) =>
    api.get<Assessment>(`/assessments/${applicationId}`).then((r) => r.data),
  start: (assessmentId: string) =>
    api.post<Assessment>(`/assessments/${assessmentId}/start`).then((r) => r.data),
  submitModule: (assessmentId: string, moduleIndex: number, answers: unknown[]) =>
    api.post<Assessment>(`/assessments/${assessmentId}/modules/${moduleIndex}/submit`, { answers }).then((r) => r.data),
  complete: (assessmentId: string) =>
    api.post(`/assessments/${assessmentId}/complete`).then((r) => r.data),
}
