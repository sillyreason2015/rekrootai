import api from '../lib/axios'
import type { Candidate } from '../types'

export const candidateService = {
  getProfile: () => api.get<Candidate>('/candidates/me').then((r) => r.data),
  updateProfile: (data: Partial<Candidate>) =>
    api.patch<Candidate>('/candidates/me', data).then((r) => r.data),
  uploadCv: (file: File) => {
    const form = new FormData()
    form.append('cv', file)
    return api.post<{ cvUrl: string; parsed: Record<string, unknown> }>('/candidates/me/cv', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  completeOnboarding: (data: unknown) =>
    api.post('/candidates/me/onboarding', data).then((r) => r.data),
  getDashboard: () =>
    api.get<{
      applications: number
      assessmentsPending: number
      interviewsScheduled: number
      nextAction?: { type: 'assessment' | 'interview'; label: string; href: string; dueAt?: string; jobTitle?: string } | null
      recentApplications: unknown[]
    }>('/candidates/me/dashboard').then((r) => r.data),
  deleteAccount: () => api.delete('/candidates/me').then((r) => r.data),
  getRecommendations: () => api.get<{
    recommendations: Array<{
      _id: string; title: string; department: string; level?: string; location: string
      type: string; remote: string; salaryCurrency: string; salaryMin?: number; salaryMax?: number
      matchScore: number; matchedSkills: number; cvKeywordHits: number; totalSkills: number; reasons: string[]
      matchSources: { profileSkills: boolean; cvContent: boolean; experience: boolean }
    }>
    candidateSkillCount: number; cvAnalysed: boolean; cvKeywordCount: number; matchNote: string
  }>('/candidates/recommendations').then((r) => r.data),
}
