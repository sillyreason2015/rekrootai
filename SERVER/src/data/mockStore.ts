import type {
  AiOutput,
  Application,
  Assessment,
  AuditLogEntry,
  BiasAudit,
  Candidate,
  Company,
  Interview,
  Job,
  User,
} from '../domain.js'
import { nowIso } from '../lib/http.js'

const seedNow = nowIso()

export const db: {
  users: User[]
  companies: Company[]
  candidates: Candidate[]
  jobs: Job[]
  applications: Application[]
  assessments: Assessment[]
  interviews: Interview[]
  aiOutputs: AiOutput[]
  biasAudits: BiasAudit[]
  auditLog: AuditLogEntry[]
  refreshTokens: Map<string, string>
  invitations: Array<{ email: string; role: string; sentAt: string }>
} = {
  users: [
    {
      _id: 'mock-admin',
      email: 'admin@rekroot.local',
      password: 'demo1234',
      role: 'admin',
      firstName: 'Ava',
      lastName: 'Stone',
      isVerified: true,
      onboardingComplete: true,
      createdAt: seedNow,
    },
    {
      _id: 'mock-recruiter',
      email: 'recruiter@rekroot.local',
      password: 'demo1234',
      role: 'recruiter',
      firstName: 'Noah',
      lastName: 'Grant',
      isVerified: true,
      onboardingComplete: true,
      createdAt: seedNow,
    },
    {
      _id: 'mock-candidate',
      email: 'candidate@rekroot.local',
      password: 'demo1234',
      role: 'candidate',
      firstName: 'Maya',
      lastName: 'Cole',
      isVerified: true,
      onboardingComplete: true,
      createdAt: seedNow,
    },
  ],
  companies: [
    {
      _id: 'company-1',
      name: 'Rekroot Labs',
      industry: 'Technology',
      size: '51-200',
      website: 'https://rekroot.local',
      mission: 'Hire fairly with clarity.',
      vision: 'Every decision explained.',
      values: ['Transparency', 'Fairness', 'Speed'],
    },
  ],
  candidates: [
    {
      _id: 'candidate-1',
      user: 'mock-candidate',
      headline: 'Product designer and AI enthusiast',
      skills: ['React', 'TypeScript', 'UX', 'Research'],
      experience: [
        {
          title: 'Frontend Engineer',
          company: 'Studio North',
          startDate: '2023-01-01',
          current: true,
          description: 'Built internal recruiting tools.',
        },
      ],
      education: [
        {
          institution: 'Wellspring University',
          degree: 'BSc',
          field: 'Software Engineering',
          startDate: '2019-09-01',
          current: false,
          endDate: '2023-06-30',
        },
      ],
      cvUrl: '/uploads/mock-candidate-cv.pdf',
      cvParsed: { summary: 'Candidate CV parsed successfully' },
      location: 'Lagos, Nigeria',
      availableFrom: '2026-05-01',
    },
  ],
  jobs: [
    {
      _id: 'job-1',
      company: 'company-1',
      title: 'Senior Frontend Engineer',
      department: 'Engineering',
      location: 'Lagos, Nigeria',
      type: 'full-time',
      remote: 'hybrid',
      description: 'Build the recruiter and candidate experience.',
      requirements: ['3+ years frontend experience', 'TypeScript', 'React'],
      responsibilities: ['Ship UI', 'Collaborate with backend', 'Review design systems'],
      skills: ['React', 'TypeScript', 'Tailwind'],
      salaryMin: 3000,
      salaryMax: 5000,
      salaryCurrency: 'USD',
      status: 'published',
      applicationDeadline: '2026-06-30',
      assessmentModules: [
        { type: 'aptitude', timeLimit: 20, weight: 0.25 },
        { type: 'technical', timeLimit: 30, weight: 0.25 },
        { type: 'situational', timeLimit: 15, weight: 0.25 },
        { type: 'personality', timeLimit: 10, weight: 0.25 },
      ],
      thresholds: { tau1: 0.5, tau2: 70 },
      alpha: 0.4,
      createdBy: 'mock-recruiter',
      createdAt: seedNow,
    },
    {
      _id: 'job-2',
      company: 'company-1',
      title: 'AI Product Manager',
      department: 'Product',
      location: 'Remote',
      type: 'full-time',
      remote: 'remote',
      description: 'Own product direction for AI hiring workflows.',
      requirements: ['Product experience', 'Stakeholder management'],
      responsibilities: ['Define roadmap', 'Run experiments', 'Write specs'],
      skills: ['Product Strategy', 'Analytics', 'Communication'],
      salaryCurrency: 'USD',
      status: 'draft',
      assessmentModules: [
        { type: 'aptitude', timeLimit: 20, weight: 0.3 },
        { type: 'technical', timeLimit: 20, weight: 0.2 },
        { type: 'situational', timeLimit: 20, weight: 0.3 },
        { type: 'personality', timeLimit: 10, weight: 0.2 },
      ],
      thresholds: { tau1: 0.55, tau2: 75 },
      alpha: 0.4,
      createdBy: 'mock-recruiter',
      createdAt: seedNow,
    },
  ],
  applications: [
    {
      _id: 'app-1',
      job: 'job-1',
      candidate: 'candidate-1',
      status: 'shortlisted',
      scores: { resume: 88, assessment: 79, penalty: 0, interview: 82, final: 83 },
      stage: 'screening',
      createdAt: seedNow,
    },
  ],
  assessments: [
    {
      _id: 'assessment-1',
      application: 'app-1',
      job: 'job-1',
      modules: [
        { type: 'aptitude', questions: [], score: 78 },
        { type: 'technical', questions: [], score: 82 },
        { type: 'situational', questions: [], score: 80 },
        { type: 'personality', questions: [], score: 0 },
        { type: 'social', questions: [], score: 76 },
      ],
      status: 'completed',
      startedAt: seedNow,
      completedAt: seedNow,
      expiresAt: seedNow,
      score: 79,
    },
  ],
  interviews: [
    {
      _id: 'interview-1',
      application: 'app-1',
      job: 'job-1',
      candidate: 'candidate-1',
      recruiter: 'mock-recruiter',
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      durationMin: 45,
      roomToken: 'room-mock-1',
      transcript: [],
      rubric: [],
      status: 'scheduled',
    },
  ],
  aiOutputs: [
    {
      _id: 'ai-1',
      application: 'app-1',
      type: 'resume_rank',
      input: { jobId: 'job-1' },
      output: { score: 0.88, explanation: ['Strong TypeScript experience', 'Matches frontend stack'] },
      modelVersion: 'mock-1.0',
      createdAt: seedNow,
    },
  ],
  biasAudits: [
    {
      _id: 'bias-1',
      job: 'job-1',
      runAt: seedNow,
      disparateImpact: { gender: 0.92, age: 0.88 },
      flagged: false,
      details: { summary: 'Healthy fairness range' },
    },
  ],
  auditLog: [
    {
      _id: 'audit-1',
      timestamp: seedNow,
      actor: 'ai',
      action: 'screening-rank',
      candidateId: 'candidate-1',
      jobId: 'job-1',
      mode: 'assist',
      modelVersion: 'mock-1.0',
      inputHash: 'hash-1',
    },
  ],
  refreshTokens: new Map<string, string>(),
  invitations: [] as Array<{ email: string; role: string; sentAt: string }>,
}

export function getUserById(userId: string) {
  return db.users.find((user) => user._id === userId) ?? null
}

export function getUserByEmail(email: string) {
  return db.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null
}

export function getCandidateByUserId(userId: string) {
  const user = getUserById(userId)
  if (!user) return null
  return db.candidates.find((candidate) => candidate.user === userId) ?? null
}

export function getJobById(jobId: string) {
  return db.jobs.find((job) => job._id === jobId) ?? null
}

export function getApplicationById(applicationId: string) {
  return db.applications.find((application) => application._id === applicationId) ?? null
}

export function getAssessmentByApplicationId(applicationId: string) {
  return db.assessments.find((assessment) => assessment.application === applicationId) ?? null
}

export function getInterviewById(interviewId: string) {
  return db.interviews.find((interview) => interview._id === interviewId) ?? null
}

export function logAction(entry: Omit<AuditLogEntry, '_id' | 'timestamp'>) {
  const auditEntry: AuditLogEntry = {
    _id: `audit-${db.auditLog.length + 1}`,
    timestamp: nowIso(),
    ...entry,
  }
  db.auditLog.unshift(auditEntry)
  return auditEntry
}

export function createUser(payload: Pick<User, 'email' | 'password' | 'role' | 'firstName' | 'lastName'>) {
  const user: User = {
    _id: `user-${db.users.length + 1}`,
    ...payload,
    isVerified: true,
    onboardingComplete: payload.role === 'candidate' ? false : true,
    createdAt: nowIso(),
  }
  db.users.push(user)
  return user
}
