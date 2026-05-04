import api from '../lib/axios'

export const recruiterService = {
  getAuditLog: (params?: { page?: number; limit?: number; action?: string }) =>
    api.get('/recruiter/audit-log', { params }).then((r) => r.data),
  getPipelineSummary: () =>
    api.get('/recruiter/pipeline-summary').then((r) => r.data),
  getApplicationCv: (applicationId: string) =>
    api.get(`/recruiter/applications/${applicationId}/cv`).then((r) => r.data),
  getJobCvBundle: (jobId: string) =>
    api.get(`/recruiter/jobs/${jobId}/cvs`).then((r) => r.data),
  getJobTriage: (jobId: string, mode: 'assist' | 'veto' | 'override') =>
    api.get('/recruiter/jobs/' + jobId + '/triage', { params: { mode } }).then((r) => r.data),
  askAssistant: (applicationId: string, question: string) =>
    api.post(`/recruiter/applications/${applicationId}/assistant`, { question }).then((r) => r.data),
  approveMissedInterviewRecovery: (applicationId: string, payload: { approved: boolean; note?: string; proposedAt?: string }) =>
    api.post(`/recruiter/applications/${applicationId}/missed-interview/review`, payload).then((r) => r.data),
}
