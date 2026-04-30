/**
 * Async data-access helpers — thin wrappers over Mongoose models.
 * Routes import from here instead of calling Model.find*() directly
 * to keep controllers clean and centralise query patterns.
 */
import { UserModel } from '../models/User.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { AssessmentModel } from '../models/Assessment.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { nowIso } from '../lib/http.js'
import type { AuditLogEntry } from '../domain.js'

// ── Users ─────────────────────────────────────────────────────────────────

export async function getUserById(id: string) {
  return UserModel.findById(id).lean()
}

export async function getUserByEmail(email: string) {
  return UserModel.findOne({ email: email.toLowerCase() }).lean()
}

// ── Candidates ─────────────────────────────────────────────────────────────

export async function getCandidateByUserId(userId: string) {
  return CandidateModel.findOne({ user: userId }).lean()
}

export async function getCandidateById(id: string) {
  return CandidateModel.findById(id).lean()
}

// ── Jobs ───────────────────────────────────────────────────────────────────

export async function getJobById(id: string) {
  return JobModel.findById(id).lean()
}

// ── Applications ───────────────────────────────────────────────────────────

export async function getApplicationById(id: string) {
  return ApplicationModel.findById(id).lean()
}

// ── Assessments ────────────────────────────────────────────────────────────

export async function getAssessmentByApplicationId(applicationId: string) {
  return AssessmentModel.findOne({ application: applicationId }).lean()
}

export async function getAssessmentById(id: string) {
  return AssessmentModel.findById(id).lean()
}

// ── Interviews ─────────────────────────────────────────────────────────────

export async function getInterviewById(id: string) {
  return InterviewModel.findById(id).lean()
}

// ── Audit log ──────────────────────────────────────────────────────────────

export async function logAction(entry: Omit<AuditLogEntry, '_id' | 'timestamp'>): Promise<void> {
  await AuditLogModel.create(entry).catch((err) => console.error('[audit] failed to log:', err))
}

// ── User creation ──────────────────────────────────────────────────────────

export async function createUser(payload: {
  email: string
  password: string
  role: 'candidate' | 'recruiter' | 'admin'
  firstName: string
  lastName: string
}) {
  const user = await UserModel.create({
    ...payload,
    isVerified: true,
    onboardingComplete: payload.role !== 'candidate',
  })
  return user.toJSON()
}

// ── Candidate auto-create ──────────────────────────────────────────────────

export async function ensureCandidateProfile(userId: string) {
  const existing = await CandidateModel.findOne({ user: userId }).lean()
  if (existing) return existing
  const created = await CandidateModel.create({
    user: userId,
    headline: '',
    skills: [],
    experience: [],
    education: [],
  })
  return created.toJSON()
}

// ── Assessment auto-create ─────────────────────────────────────────────────

export async function ensureAssessment(applicationId: string, jobId: string) {
  const existing = await AssessmentModel.findOne({ application: applicationId }).lean()
  if (existing) return existing
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const created = await AssessmentModel.create({
    application: applicationId,
    job: jobId,
    modules: [
      { type: 'aptitude', questions: [] },
      { type: 'technical', questions: [] },
      { type: 'situational', questions: [] },
      { type: 'personality', questions: [] },
    ],
    status: 'pending',
    expiresAt,
  })
  return created.toJSON()
}

export { nowIso }
