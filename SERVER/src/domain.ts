export type Role = 'candidate' | 'recruiter' | 'admin' | 'super_admin'

export interface User {
  _id: string
  email: string
  password: string
  role: Role
  firstName: string
  lastName: string
  isVerified: boolean
  onboardingComplete: boolean
  createdAt: string
  companyName?: string
  phone?: string
  avatarUrl?: string
  avatarDataUrl?: string
  oauthProviders?: Array<'google' | 'microsoft'>
}

export interface Candidate {
  _id: string
  user: string
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

export interface Company {
  _id: string
  name: string
  legalName?: string
  industry: string
  size: string
  hqCountry?: string
  website?: string
  logoUrl?: string
  description?: string
  tone?: string
  mission?: string
  vision?: string
  values?: string[]
  registrationNumber?: string
  taxId?: string
  businessEmail?: string
  isVerified?: boolean
  verifiedAt?: string
  verifiedBy?: string
  createdBy?: string
}

export interface AssessmentModuleConfig {
  type: 'aptitude' | 'technical' | 'situational' | 'personality' | 'values'
  timeLimit: number
  weight: number
}

export interface Job {
  _id: string
  company: string | Company
  title: string
  department: string
  level?: 'graduate' | 'entry' | 'mid' | 'senior' | 'lead' | 'executive'
  departments?: string[]
  hiringPlan?: {
    cohortName?: string
    seats?: number
    windowStart?: string
    windowEnd?: string
  }
  positionsCount?: number
  departmentHiring?: Array<{ department: string; seats: number }>
  requiresQuestionnaire?: boolean
  applicationQuestions?: Array<{ question: string; required: boolean }>
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
  bannerUrl?: string
  assessmentModules: AssessmentModuleConfig[]
  thresholds: {
    screening: number
    assessment: number
    fairness: number
    interview: number
  }
  alpha: number
  createdBy: string
  createdAt: string
}

export type ApplicationStatus =
  | 'pending'
  | 'shortlisted'
  | 'assessment_sent'
  | 'interview_scheduled'
  | 'decision_made'
  | 'rejected'
  | 'hired'

export interface Application {
  _id: string
  job: string
  candidate: string
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
  recruiterNote?: string
  aiDecision?: 'shortlist' | 'review' | 'reject'
  fairnessComputedAt?: string
  assessmentExpiresAt?: string
  assessmentStatus?: 'pending' | 'in_progress' | 'completed' | 'expired'
  interviewMissed?: boolean
  missedInterviewRecovery?: {
    status?: 'pending' | 'approved' | 'rejected'
    reason?: string
    proposedAt?: string
    requestedAt?: string
    reviewNote?: string
    reviewedAt?: string
  }
  decision?: 'hire' | 'reject' | 'hold'
  decisionBy?: string
  decisionAt?: string
  createdAt: string
  applicationAnswers?: Array<{ question: string; answer: string }>
  correspondence?: Array<{
    _id?: string
    senderRole: 'candidate' | 'recruiter' | 'admin' | 'system'
    senderUserId?: string
    senderName?: string
    recipientUserId?: string
    recipientEmail?: string
    channel?: 'in_app' | 'email' | 'system'
    subject?: string
    message: string
    deliveryStatus?: 'pending' | 'sent' | 'failed'
    sentAt?: string
  }>
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

export interface AssessmentModule {
  type: string
  questions: Question[]
  answers?: Answer[]
  score?: number
  timeSpent?: number
  completedAt?: string
}

export interface Assessment {
  _id: string
  application: string
  job: string
  candidate?: string
  modules: AssessmentModule[]
  status: 'pending' | 'in_progress' | 'completed' | 'expired'
  startedAt?: string
  completedAt?: string
  expiresAt: string
  score?: number
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

export interface Interview {
  _id: string
  application: string
  job: string
  candidate: string
  recruiter: string
  scheduledAt: string
  durationMin: number
  collaborationMode?: 'veto' | 'assist' | 'override'
  aiRecommendation?: 'advance' | 'hold' | 'reject'
  roomToken?: string
  transcript?: TranscriptEntry[]
  rubric?: RubricScore[]
  aiAnalysis?: Record<string, unknown>
  aiAnalysisStatus?: 'idle' | 'pending' | 'completed' | 'failed'
  score?: number
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'
}

export interface OAuthIdentity {
  _id: string
  user: string
  provider: 'google' | 'microsoft'
  providerUserId: string
  email: string
  linkedAt: string
}

export interface InterviewArtifact {
  _id: string
  interview: string
  application: string
  job: string
  candidate: string
  kind: 'recording' | 'transcript' | 'analysis'
  status: 'pending' | 'uploaded' | 'processing' | 'completed' | 'failed'
  storageKey?: string
  mimeType?: string
  sizeBytes?: number
  uploadedBy?: string
  startedAt?: string
  completedAt?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface AiOutput {
  _id: string
  application: string
  type: 'resume_rank' | 'assessment_score' | 'interview_analysis' | 'bias_audit' | 'explanation'
  input: Record<string, unknown>
  output: Record<string, unknown>
  modelVersion: string
  createdAt: string
}

export interface BiasAudit {
  _id: string
  job: string
  runAt: string
  disparateImpact: Record<string, number>
  flagged: boolean
  details: Record<string, unknown>
}

export interface AuditLogEntry {
  _id: string
  timestamp: string
  actor: 'user' | 'ai'
  action: string
  candidateId?: string
  jobId?: string
  mode?: 'veto' | 'assist' | 'override'
  modelVersion?: string
  inputHash?: string
  payload?: Record<string, unknown>
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface AuthSession {
  userId: string
  refreshToken: string
}
