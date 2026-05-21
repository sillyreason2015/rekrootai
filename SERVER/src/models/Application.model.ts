import { Schema, model } from 'mongoose'
import type { Application } from '../domain.js'
import { baseSchemaOptions } from './_base.js'

const applicationSchema = new Schema<Omit<Application, 'createdAt'>>(
  {
    job: { type: String, ref: 'Job', required: true, index: true },
    candidate: { type: String, ref: 'Candidate', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'shortlisted', 'assessment_sent', 'interview_scheduled', 'decision_made', 'rejected', 'hired'],
      default: 'pending',
    },
    scores: {
      resume: { type: Number, default: 0 },
      assessment: { type: Number, default: 0 },
      penalty: { type: Number, default: 0 },
      interview: { type: Number, default: 0 },
      final: { type: Number, default: 0 },
    },
    stage: {
      type: String,
      enum: ['applied', 'screening', 'assessment', 'interview', 'decision', 'offered', 'rejected'],
      default: 'applied',
    },
    recruiterNotes: String,
    recruiterNote: String,  // human-in-the-loop feedback shown to candidate in explanation
    aiDecision: { type: String, enum: ['shortlist', 'review', 'reject'] },
    fairnessComputedAt: String,
    assessmentExpiresAt: String,
    assessmentStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'expired'],
    },
    assessmentCheckpoint: {
      modulesCompleted: { type: Number, default: 0 },
      totalModules: { type: Number, default: 0 },
      lastActiveAt: String,
    },
    interviewMissed: { type: Boolean, default: false },
    missedInterviewRecovery: {
      status: { type: String, enum: ['pending', 'approved', 'rejected'] },
      reason: String,
      proposedAt: String,
      requestedAt: String,
      reviewNote: String,
      reviewedAt: String,
    },
    decision: { type: String, enum: ['hire', 'reject', 'hold'] },
    decisionBy: String,
    decisionAt: String,
    offerStatus: { type: String, enum: ['pending', 'accepted', 'declined'] },
    offerRespondedAt: String,
    interviewPreferredTimes: { type: [String], default: [] },
    interviewPreferenceSubmittedAt: String,
    applicationAnswers: {
      type: [
        new Schema(
          {
            question: { type: String, required: true },
            answer: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    correspondence: {
      type: [
        new Schema(
          {
            senderRole: { type: String, enum: ['candidate', 'recruiter', 'admin', 'system'], required: true },
            senderUserId: String,
            senderName: String,
            recipientUserId: String,
            recipientEmail: String,
            channel: { type: String, enum: ['in_app', 'email', 'system'], default: 'in_app' },
            subject: String,
            message: { type: String, required: true },
            deliveryStatus: { type: String, enum: ['pending', 'sent', 'failed'], default: 'sent' },
            sentAt: { type: String, default: () => new Date().toISOString() },
          },
          { _id: true },
        ),
      ],
      default: [],
    },
  },
  baseSchemaOptions,
)

applicationSchema.index({ job: 1, stage: 1 })
applicationSchema.index({ candidate: 1, createdAt: -1 })
applicationSchema.index({ job: 1, createdAt: -1 })
applicationSchema.index({ candidate: 1, job: 1 }, { unique: true })
applicationSchema.index({ interviewMissed: 1, stage: 1 })

export const ApplicationModel = model<Omit<Application, 'createdAt'>>('Application', applicationSchema)
