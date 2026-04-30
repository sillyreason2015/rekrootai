/**
 * Idempotent seed script.
 * Run with: npx tsx src/db/seed.ts
 * Safe to run multiple times — checks existence before inserting.
 */
import argon2 from 'argon2'
import { connectDB, disconnectDB } from './mongoose.js'
import { UserModel } from '../models/User.model.js'
import { CandidateModel } from '../models/Candidate.model.js'
import { CompanyModel } from '../models/Company.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { AssessmentModel } from '../models/Assessment.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { AuditLogModel } from '../models/AuditLog.model.js'
import { QuestionBankModel } from '../models/QuestionBank.model.js'
import { nowIso } from '../lib/http.js'

async function seed() {
  await connectDB()
  console.log('[seed] connected to MongoDB')

  // ── Users ─────────────────────────────────────────────────────────────────
  const hashedPassword = await argon2.hash('demo1234')

  const [admin, recruiter, candidate] = await Promise.all([
    UserModel.findOneAndUpdate(
      { email: 'admin@rekroot.local' },
      {
        $setOnInsert: {
          email: 'admin@rekroot.local',
          password: hashedPassword,
          role: 'admin',
          firstName: 'Ava',
          lastName: 'Stone',
          isVerified: true,
          onboardingComplete: true,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ),
    UserModel.findOneAndUpdate(
      { email: 'recruiter@rekroot.local' },
      {
        $setOnInsert: {
          email: 'recruiter@rekroot.local',
          password: hashedPassword,
          role: 'recruiter',
          firstName: 'Noah',
          lastName: 'Grant',
          isVerified: true,
          onboardingComplete: true,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ),
    UserModel.findOneAndUpdate(
      { email: 'candidate@rekroot.local' },
      {
        $setOnInsert: {
          email: 'candidate@rekroot.local',
          password: hashedPassword,
          role: 'candidate',
          firstName: 'Maya',
          lastName: 'Cole',
          isVerified: true,
          onboardingComplete: true,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ),
  ])

  console.log('[seed] users ok:', admin?.email, recruiter?.email, candidate?.email)

  // ── Company ───────────────────────────────────────────────────────────────
  const company = await CompanyModel.findOneAndUpdate(
    { name: 'Rekroot Labs' },
    {
      $setOnInsert: {
        name: 'Rekroot Labs',
        industry: 'Technology',
        size: '51-200',
        website: 'https://rekroot.local',
        mission: 'Hire fairly with clarity.',
        vision: 'Every decision explained.',
        values: ['Transparency', 'Fairness', 'Speed'],
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  )
  console.log('[seed] company ok:', company?.name)

  // ── Candidate profile ─────────────────────────────────────────────────────
  const candidateProfile = await CandidateModel.findOneAndUpdate(
    { user: String(candidate!._id) },
    {
      $setOnInsert: {
        user: String(candidate!._id),
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
        location: 'Lagos, Nigeria',
        availableFrom: '2026-05-01',
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  )
  console.log('[seed] candidate profile ok:', candidateProfile?._id)

  // ── Jobs ──────────────────────────────────────────────────────────────────
  const companyId = String(company!._id)
  const recruiterId = String(recruiter!._id)

  const [job1, job2] = await Promise.all([
    JobModel.findOneAndUpdate(
      { title: 'Senior Frontend Engineer', createdBy: recruiterId },
      {
        $setOnInsert: {
          company: companyId,
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
          thresholds: { screening: 0.5, assessment: 70, fairness: 0.5, interview: 70 },
          alpha: 0.4,
          createdBy: recruiterId,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ),
    JobModel.findOneAndUpdate(
      { title: 'AI Product Manager', createdBy: recruiterId },
      {
        $setOnInsert: {
          company: companyId,
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
          thresholds: { screening: 0.55, assessment: 75, fairness: 0.55, interview: 75 },
          alpha: 0.4,
          createdBy: recruiterId,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ),
  ])
  console.log('[seed] jobs ok:', job1?.title, job2?.title)

  // ── Application ───────────────────────────────────────────────────────────
  const candidateProfileId = String(candidateProfile!._id)
  const job1Id = String(job1!._id)

  const application = await ApplicationModel.findOneAndUpdate(
    { job: job1Id, candidate: candidateProfileId },
    {
      $setOnInsert: {
        job: job1Id,
        candidate: candidateProfileId,
        status: 'shortlisted',
        scores: { resume: 88, assessment: 79, penalty: 0, interview: 82, final: 83 },
        stage: 'screening',
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  )
  console.log('[seed] application ok:', application?._id)

  // ── Assessment ────────────────────────────────────────────────────────────
  const applicationId = String(application!._id)
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()

  await AssessmentModel.findOneAndUpdate(
    { application: applicationId },
    {
      $setOnInsert: {
        application: applicationId,
        job: job1Id,
        modules: [
          { type: 'aptitude', questions: [], score: 78 },
          { type: 'technical', questions: [], score: 82 },
          { type: 'situational', questions: [], score: 80 },
          { type: 'personality', questions: [], score: 0 },
        ],
        status: 'completed',
        startedAt: nowIso(),
        completedAt: nowIso(),
        expiresAt,
        score: 79,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  )
  console.log('[seed] assessment ok')

  // ── Interview ─────────────────────────────────────────────────────────────
  await InterviewModel.findOneAndUpdate(
    { application: applicationId },
    {
      $setOnInsert: {
        application: applicationId,
        job: job1Id,
        candidate: candidateProfileId,
        recruiter: recruiterId,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        durationMin: 45,
        roomToken: 'room-seed-1',
        transcript: [],
        rubric: [],
        status: 'scheduled',
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  )
  console.log('[seed] interview ok')

  // ── Audit log entry ───────────────────────────────────────────────────────
  const auditCount = await AuditLogModel.countDocuments()
  if (auditCount === 0) {
    await AuditLogModel.create({
      actor: 'ai',
      action: 'screening-rank',
      candidateId: candidateProfileId,
      jobId: job1Id,
      mode: 'assist',
      modelVersion: 'seed-1.0',
    })
    console.log('[seed] audit log seeded')
  }

  // ── Question bank ─────────────────────────────────────────────────────────
  const qCount = await QuestionBankModel.countDocuments()
  if (qCount === 0) {
    await QuestionBankModel.insertMany([
      {
        text: 'Which React hook is used to manage side effects?',
        type: 'mcq',
        options: ['useState', 'useEffect', 'useContext', 'useRef'],
        correctIndex: 1,
        points: 1,
        category: 'technical',
        difficulty: 'easy',
        tags: ['react', 'hooks'],
      },
      {
        text: 'What does SOLID stand for in software engineering?',
        type: 'open',
        points: 2,
        category: 'technical',
        difficulty: 'medium',
        tags: ['software-design', 'principles'],
      },
      {
        text: 'A colleague disagrees with your technical approach. How do you handle it?',
        type: 'open',
        points: 2,
        category: 'situational',
        difficulty: 'medium',
        tags: ['communication', 'teamwork'],
      },
    ])
    console.log('[seed] question bank seeded')
  }

  console.log('[seed] ✅ complete')
  await disconnectDB()
}

seed().catch((err) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
