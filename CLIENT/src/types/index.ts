// ─── Auth ────────────────────────────────────────────────────────────────────
export type Role = 'candidate' | 'recruiter' | 'admin'

export interface User {
  _id: string
  email: string
  role: Role
  firstName: string
  lastName: string
  isVerified: boolean
  onboardingComplete: boolean
  createdAt: string
  companyName?: string
  phone?: string
}

// ─── Candidate ───────────────────────────────────────────────────────────────
export interface Candidate {
  _id: string
  user: string | User
  headline: string
  skills: string[]
  experience: ExperienceEntry[]
  education: EducationEntry[]
  cvUrl?: string
  cvParsed?: Record<string, unknown>
  linkedIn?: string
  portfolio?: string
  location?: string
  availableFrom?: string
}

export interface ExperienceEntry {
  title: string
  company: string
  startDate: string
  endDate?: string
  current: boolean
  description: string
}

export interface EducationEntry {
  institution: string
  degree: string
  field: string
  startDate: string
  endDate?: string
  current: boolean
}

// ─── Company ──────────────────────────────────────────────────────────────────
export interface Company {
  _id: string
  name: string
  industry: string
  size: string
  website?: string
  logoUrl?: string
  description?: string
}

// ─── Job ─────────────────────────────────────────────────────────────────────
export interface Job {
  _id: string
  company: string | Company
  title: string
  department: string
  location: string
  type: 'full-time' | 'part-time' | 'contract' | 'internship'
  remote: 'on-site' | 'hybrid' | 'remote'
  description: string
  requirements: string[]
  responsibilities: string[]
  skills: string[]
  salaryMin?: number
  salaryMax?: number
  salaryCurrency: string
  status: 'draft' | 'published' | 'closed'
  applicationDeadline?: string
  assessmentModules: AssessmentModuleConfig[]
  thresholds: { tau1: number; tau2: number }
  alpha: number
  createdBy: string | User
  createdAt: string
}

export interface AssessmentModuleConfig {
  type: 'aptitude' | 'technical' | 'situational' | 'personality'
  timeLimit: number
  weight: number
}

// ─── Application ─────────────────────────────────────────────────────────────
export interface Application {
  _id: string
  job: string | Job
  candidate: string | Candidate
  status: ApplicationStatus
  scores: {
    resume?: number
    assessment?: number
    penalty?: number
    interview?: number
    final?: number
  }
  stage: 'applied' | 'screening' | 'assessment' | 'interview' | 'decision' | 'offered' | 'rejected'
  recruiterNotes?: string
  decision?: 'hire' | 'reject' | 'hold'
  decisionBy?: string | User
  decisionAt?: string
  createdAt: string
  interviewId?: string
}

export type ApplicationStatus =
  | 'pending'
  | 'shortlisted'
  | 'assessment_sent'
  | 'interview_scheduled'
  | 'decision_made'
  | 'rejected'
  | 'hired'

// ─── Assessment ───────────────────────────────────────────────────────────────
export interface Assessment {
  _id: string
  application: string | Application
  job: string | Job
  modules: AssessmentModule[]
  status: 'pending' | 'in_progress' | 'completed' | 'expired'
  startedAt?: string
  completedAt?: string
  expiresAt: string
  score?: number
}

export interface AssessmentModule {
  type: string
  questions: Question[]
  answers?: Answer[]
  score?: number
  timeSpent?: number
  completedAt?: string
}

export interface Question {
  _id: string
  text: string
  type: 'mcq' | 'open' | 'code'
  options?: string[]
  correctIndex?: number
  points: number
}

export interface Answer {
  questionId: string
  selected?: number
  text?: string
}

// ─── Interview ────────────────────────────────────────────────────────────────
export interface Interview {
  _id: string
  application: string | Application
  job: string | Job
  candidate: string | Candidate | User
  recruiter: string | User
  scheduledAt: string
  durationMin: number
  roomToken?: string
  transcript?: TranscriptEntry[]
  rubric?: RubricScore[]
  aiAnalysis?: Record<string, unknown>
  score?: number
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'
}

export interface TranscriptEntry {
  speaker: 'candidate' | 'recruiter'
  text: string
  timestamp: string
}

export interface RubricScore {
  criterion: string
  score: number
  maxScore: number
  notes?: string
}

// ─── AI Output ───────────────────────────────────────────────────────────────
export interface AiOutput {
  _id: string
  application: string
  type: 'resume_rank' | 'assessment_score' | 'interview_analysis' | 'bias_audit' | 'explanation'
  input: Record<string, unknown>
  output: Record<string, unknown>
  modelVersion: string
  createdAt: string
}

// ─── Bias Audit ───────────────────────────────────────────────────────────────
export interface BiasAudit {
  _id: string
  job: string | Job
  runAt: string
  disparateImpact: Record<string, number>
  flagged: boolean
  details: Record<string, unknown>
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ─── API helpers ──────────────────────────────────────────────────────────────
export interface ApiError {
  message: string
  code?: string
  field?: string
}
