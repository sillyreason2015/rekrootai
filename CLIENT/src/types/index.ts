// ─── Auth ────────────────────────────────────────────────────────────────────
export type Role = 'candidate' | 'recruiter' | 'admin' | 'super_admin'

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
  teamName?: string
  permissions?: {
    canCreateJobs?: boolean
    canManageBilling?: boolean
    canManageTeam?: boolean
    canViewAllCandidates?: boolean
  }
  availabilityStatus?: 'available' | 'busy'
  phone?: string
  avatarUrl?: string
  avatarPreviewUrl?: string
  oauthProviders?: Array<'google' | 'microsoft'>
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
  teamName?: string
  assignmentMode?: 'round_robin' | 'manual'
  assignAvailableOnly?: boolean
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
  teamName?: string
  title: string
  department: string
  level?: 'graduate' | 'entry' | 'mid' | 'senior' | 'lead' | 'executive'
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
  aiMode?: 'veto' | 'assist' | 'override'
  assessmentModules: AssessmentModuleConfig[]
  thresholds?: { screening?: number; assessment?: number; fairness?: number; interview?: number; tau1?: number; tau2?: number }
  alpha: number
  createdBy: string | User
  assignedRecruiter?: string | User
  assignedRecruiterAt?: string
  assignmentMethod?: 'round_robin' | 'manual' | 'solo_owner'
  assignmentHistory?: Array<{
    recruiterId?: string
    assignedBy?: string
    method: 'round_robin' | 'manual' | 'solo_owner'
    note?: string
    at: string
  }>
  createdAt: string
}

export interface AssessmentModuleConfig {
  type: 'aptitude' | 'technical' | 'situational' | 'personality' | 'values'
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
  aiDecision?: 'shortlist' | 'review' | 'reject'
  decision?: 'hire' | 'reject' | 'hold'
  decisionBy?: string | User
  decisionAt?: string
  createdAt: string
  interviewId?: string
  interviewStatus?: 'scheduled' | 'live' | 'completed' | 'cancelled'
  interviewScheduledAt?: string
  interviewMode?: 'veto' | 'assist' | 'override'
  interviewMissed?: boolean
  assessmentExpiresAt?: string
  assessmentStatus?: 'pending' | 'in_progress' | 'completed' | 'expired'
  fairnessComputedAt?: string
  explanationComputedAt?: string
  aiRecommendation?: 'shortlist' | 'review' | 'run_fairness' | 'reject' | 'decide'
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
  candidate?: string | Candidate | User
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
  collaborationMode?: 'veto' | 'assist' | 'override'
  aiRecommendation?: 'advance' | 'hold' | 'reject'
  roomToken?: string
  transcript?: TranscriptEntry[]
  rubric?: RubricScore[]
  aiAnalysis?: Record<string, unknown>
  aiAnalysisStatus?: 'idle' | 'pending' | 'completed' | 'failed'
  proctoringEvents?: Array<{
    actor: 'candidate' | 'recruiter' | 'system'
    type: 'tab_switch' | 'window_blur' | 'camera_off' | 'mic_off' | 'other'
    reason: string
    at: string
  }>
  artifacts?: InterviewArtifact[]
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
  downloadUrl?: string | null
  createdAt?: string
}

export interface InterviewArtifactsResponse {
  transcriptUrl?: string | null
  recordingUrl?: string | null
  transcript?: TranscriptEntry[]
  rubric?: RubricScore[]
  score?: number | null
  aiAnalysis?: Record<string, unknown> | null
  aiAnalysisStatus?: 'idle' | 'pending' | 'completed' | 'failed'
  hasTranscript?: boolean
  artifacts?: InterviewArtifact[]
}

export interface LinkedProvider {
  provider: 'google' | 'microsoft'
  email: string
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
