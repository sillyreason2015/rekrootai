# RekrootAI — System Context for Thesis / Final Year Project Paper

> **Document purpose:** Feed this file to any AI writing assistant to provide complete, accurate context about the system for dissertation, methodology, system analysis, and evaluation sections.

---

## 1. Project Overview

**System name:** RekrootAI (internally also referred to as Integra-Hire)  
**Type:** AI-augmented, explainable recruitment platform  
**Academic context:** Final Year Project / Dissertation — Computer Science / Software Engineering  
**Stack:** MERN (MongoDB · Express · React · Node.js) with TypeScript throughout  

### Core Problem Statement
Traditional recruitment is opaque, time-consuming, and susceptible to unconscious human bias. RekrootAI addresses this by using machine-learning-assisted screening, structured assessment, video interviewing, and SHAP-based explainability to produce fair, auditable hiring decisions — while keeping humans in control through configurable AI oversight modes.

---

## 2. System Architecture

### 2.1 Client (React + Vite + TypeScript)
- **Framework:** React 18 with React Router v6 (file-based role routing)
- **State & data fetching:** TanStack Query (React Query v5)
- **Forms:** React Hook Form + Zod schema validation
- **UI:** Tailwind CSS + shadcn/ui component library + Radix UI primitives
- **Real-time video:** LiveKit SDK (WebRTC-based interview rooms)
- **Design system:** Custom terracotta/cream palette with dark mode; doodle SVG background motif (recruitment-themed icons: briefcases, checklists, tick circles) that adapts stroke colour for both light and dark themes
- **Authentication:** JWT access + refresh tokens stored in localStorage; OAuth2 via Google and Microsoft

### 2.2 Server (Node.js + Express + TypeScript)
- **Database:** MongoDB via Mongoose ODM
- **Auth:** Passport.js (local + Google OAuth + Microsoft OAuth), bcrypt password hashing, JWT signing
- **File storage:** S3-compatible blob storage (presigned URLs for CV, company logo, job banner uploads)
- **Email:** Nodemailer SMTP for verification, invite, and notification emails
- **AI/ML integration:**
  - Google Gemini API — question generation for assessments
  - Custom ML microservice (XGBoost + SHAP) — candidate scoring and explainability
- **Real-time:** LiveKit server SDK for interview room token generation
- **Task scheduling:** Background jobs for interview no-show detection, assessment expiry

### 2.3 Infrastructure
- Server port: 4000 (configurable via `PORT` env var)
- Client dev port: 3000
- CORS locked to `CORS_ORIGIN` env var
- Environment vars validated at startup via Zod schema (fail-fast)

---

## 3. User Roles & Access Control

| Role | Description | Key Capabilities |
|------|-------------|-----------------|
| `candidate` | Job seeker | Browse jobs, apply, complete assessments, join interview rooms, view AI decision explanations |
| `recruiter` | Hiring team member | Manage jobs, shortlist candidates, run AI triage, download CVs, manage correspondence, view audit log |
| `admin` | Company administrator | All recruiter capabilities + team management, billing, bias audit, AI validation, company settings, logo upload |
| `super_admin` | Platform operator | All admin capabilities + platform-wide settings, user/company management, danger zone operations |

**Route protection:** React Router v6 `ProtectedRoute` component checks JWT auth + role. Shared routes (e.g., `/settings`) are extracted into a role-unrestricted authenticated group placed before role-specific groups to prevent first-match redirect bugs.

---

## 4. AI Pipeline

### 4.1 Screening Flow (per candidate per job)
```
Application submitted
  → CV/resume parsing (masked for bias reduction)
  → Skill overlap scoring (profile skills + CV keyword extraction vs job requirements)
  → Fairness gate (demographic parity check via XGBoost model)
  → Assessment invitation (if shortlisted)
  → Structured assessment (MCQ + open-ended + situational, Gemini-generated questions)
  → Interview scheduling (LiveKit WebRTC video room)
  → Interview scoring (rubric: communication, technical, problem-solving, culture fit, motivation)
  → Composite score computation
  → SHAP explainability generation
  → Recruiter final decision (Hire / Hold / Reject)
  → Candidate notification + explanation delivery
```

### 4.2 Composite Score Formula
```
Final Score = (0.30 × CV_match) + (0.30 × assessment_score) + (0.10 × fairness_adjustment) + (0.30 × interview_score)
```
Weights are configurable per job by the recruiter at creation time.

### 4.3 AI Oversight Modes
Three modes configurable per job / per company:

| Mode | Description |
|------|-------------|
| **Assist** | AI scores and recommends; recruiter makes the final call. Real-time AI companion available on the Shortlist page — recruiter can ask natural-language questions about any candidate. |
| **Veto** | AI makes the screening/assessment decisions automatically; recruiter reviews and can override only at final selection. |
| **Override** | Recruiter works fully manually; AI scores are computed but hidden. Used when company policy requires fully human decisions. |

Platform-level default mode can be forced by the super admin (e.g., force Override across all companies if AI Assist is disabled in Platform Settings).

### 4.4 Explainability (SHAP + XGBoost)
- Every score is accompanied by SHAP feature importance values
- Candidates can view their own breakdown (positive/negative contributing features shown as bar chart)
- Recruiters see the same breakdown per candidate
- Explainability can be toggled off globally by super admin (GDPR Article 22 compliance note applies)
- Explanations are generated asynchronously and polled by the frontend every 10 seconds

### 4.5 Fairness / Bias Audit
- XGBoost fairness gate applies a penalty score based on demographic parity
- `BiasAudit` model records disparate impact metrics (gender, age) per job run
- Admin bias audit page shows historical audit runs with flagged/unflagged status
- Super admin can disable the fairness gate globally (action is audit-logged)

### 4.6 CV Manual Review Queue
- Applications with low CV match scores are flagged into a "Needs Manual Review" section on the Shortlist page
- AI groups candidates into: **Strong** / **Review** / **Weak** with plain-English reasoning per group
- Recruiter can promote any candidate from the Weak/Review queue to shortlisted

### 4.7 Candidate Recommendations Engine
- Server endpoint: `GET /candidate/recommendations`
- Extracts keywords from candidate's CV (`cvParsed.maskedCV`) and profile skills
- Scores each active job by skill overlap, title match, description keyword hits
- Returns match percentage, matched skills, CV keyword hits, human-readable reasons
- Displayed on the Candidate Dashboard as "Recommended for You" cards

---

## 5. Key Features

### 5.1 Candidate-facing
- **Dashboard:** Welcome, stat cards (applications, assessments pending, interviews scheduled), recommended jobs with match %, recent applications with pipeline stage
- **Job Board:** Browse active jobs with filters; public job board at `/jobs` (no auth required)
- **Job Detail:** Full job description, responsibilities, requirements, skills, salary; application questionnaire if required
- **Applications:** Per-application pipeline tracker (Applied → Screening → Assessment → Interview → Decision); missed interview shown with red blocked node + InfoTip; "Next action" buttons only rendered when there is an actual next action
- **Assessment:** Timed multi-stage assessment with proctoring (tab-switch monitoring)
- **Interview Room:** LiveKit WebRTC video room with real-time transcript
- **Decision Explanation:** Full SHAP breakdown, composite score, stage-by-stage bars, recruiter note, message recruiter thread
- **Profile/Settings:** Personal info, password change, CV upload, notification preferences, GDPR data deletion request

### 5.2 Recruiter-facing
- **Dashboard:** Pipeline summary, recent activity, job metrics
- **My Jobs:** Create, edit, publish, save-as-draft jobs; multi-location tag input; salary undisclosed toggle; job banner upload
- **Shortlist:** Filter by job (shows title + department + level); per-candidate CV download; bulk CV download (ZIP); AI Triage panel (Strong/Review/Weak groupings with plain-English guidance); AI companion chat (Assist mode only) — ask questions about selected candidate
- **Final Selection:** Hire / Hold / Reject with override note
- **Interviews:** Scheduled interview list
- **Question Bank:** Manage reusable assessment questions (Gemini AI generation)
- **Correspondence:** Email thread per candidate
- **Audit Log:** Plain-English narrative per entry (who did what, to whom, on which job, with score/threshold/result); AI vs human actor badges; collapsible technical details

### 5.3 Admin-facing
- All recruiter features, plus:
- **Candidates:** Search across company candidates
- **Team:** Invite team members by email, manage roles
- **Audit Log:** Company-scoped version of the plain-English audit log
- **Bias Audit:** Run and review fairness audits per job
- **AI Validation:** How the pipeline works (methodology transparency)
- **Company Settings:** Company profile, logo upload (S3-stored, presigned URL), industry, size, website
- **Billing:** Plan and subscription management
- **My Profile:** Personal settings (shared `/settings` route accessible to all roles except super_admin)

### 5.4 Super Admin-facing
- **Platform Dashboard:** System-wide metrics (users, companies, jobs, applications)
- **Users:** Search, filter, delete any user
- **Companies:** List companies, verify/approve companies
- **Audit Log:** Platform-wide log (all companies, all users)
- **Platform Settings:**
  - Maintenance mode (with custom message)
  - AI pipeline policy toggles (Assist mode, Fairness gate, SHAP, Proctoring, Gemini generation)
  - Compliance controls (GDPR erasure, Immutable audit log, Candidate explanations, Retention period)
  - Live provider key status (GEMINI_API_KEY, LIVEKIT_API_KEY, SMTP_HOST, BLOB, ML_SERVICE_URL, JWT)
  - Danger Zone: Purge expired assessments, Reset AI caches, Archive closed jobs (two-click confirm, all logged)

---

## 6. Data Models (MongoDB)

| Model | Purpose |
|-------|---------|
| `User` | Auth + profile for all roles |
| `Candidate` | Extended profile (skills, experience, education, CV URL, parsed CV) |
| `Company` | Organisation profile (name, logo, industry, size) |
| `Job` | Job posting (title, description, requirements, skills, salary, questions, banner) |
| `Application` | Candidate ↔ Job link with stage, scores, decision, `interviewMissed` flag |
| `Assessment` | Multi-module timed assessment with answers, scores, proctoring events |
| `Interview` | LiveKit room metadata, scheduled time, transcript, rubric scores |
| `AuditLog` | Immutable action log (actor, action, candidateId, jobId, mode, payload) |
| `AiOutput` | Stored AI outputs (SHAP values, explanations, recommendations) |
| `BiasAudit` | Per-job fairness audit results |
| `Notification` | In-app notification per user |
| `EmailToken` | Verification / password-reset / invite tokens |
| `SystemSettings` | Global platform settings (single document, super admin only) |

---

## 7. Audit Trail & Explainability

Every significant action writes to the `AuditLog` collection:
- **Actor:** `ai` (automated decision) or `user` (human action)
- **Mode:** `assist` / `veto` / `override`
- **Action:** e.g., `screening-passed`, `shortlisted`, `rejected`, `interview-completed`, `bias-audit-run`, `decision-override`
- **Payload:** Score, threshold, result, stage, decision reason

The frontend renders each entry as a plain-English narrative sentence (server-generated per entry type), with a collapsible "Technical details" section. This fulfils GDPR Article 22 requirements for human-intelligible explanations of automated decisions.

---

## 8. Technical Design Decisions

| Decision | Rationale |
|----------|-----------|
| Role-unrestricted shared `/settings` route placed before role groups | React Router v6 first-match behaviour — `/settings` inside candidate group would redirect admins to their dashboard |
| Single root `Tooltip.Provider` in App.tsx | Multiple nested providers cause tooltip state conflicts in Radix UI |
| `interviewMissed` boolean on Application | Decoupled from `stage` so the pipeline tracker can show the blocked state even after `stage` has moved to `rejected` |
| Presigned S3 URLs (7-day expiry) for logos/banners/CVs | Avoids exposing raw S3 bucket; content served through time-limited tokens |
| Zod schema validation at server startup for env vars | Fail-fast on misconfiguration; avoids runtime `undefined` errors in production |
| `getValues()` for Save Draft in CreateJob | Bypasses React Hook Form validation so partial drafts can be saved without triggering required-field errors |
| Narrative generation on server for audit logs | Avoids sending raw MongoDB field names to the client; server has access to job/candidate names for lookup |

---

## 9. Fairness & Ethics

- **Bias mitigation:** CV parsing uses a masked/anonymised representation to reduce demographic signal leakage
- **Fairness gate:** XGBoost model checks for disparate impact before decisions are confirmed
- **Explainability:** SHAP values expose exactly which features drove a score — candidate-visible
- **Override mode:** Recruiters can take full manual control; AI is purely advisory
- **Audit immutability:** Platform setting prevents deletion of audit records; every override is logged
- **GDPR Article 22:** Candidate has right to explanation; configurable right-to-erasure endpoint removes PII while retaining anonymised decision records
- **Two-click confirmation:** Danger zone operations require explicit confirmation click to prevent accidental execution

---

## 10. System Limitations & Future Work

- The XGBoost + SHAP ML microservice is currently a stub/simulation; integration with a trained model on real recruitment data is required for production
- LiveKit interview transcription uses server-side processing; speaker diarisation is not yet implemented
- Gemini question generation requires an active API key; falls back to static templates when disabled
- The bias audit currently uses simulated disparate impact metrics; real demographic data collection (with explicit consent) is needed
- CV parsing is keyword-based; a full NLP/transformer-based CV parser would improve matching accuracy
- Real-time AI assistant on the Shortlist page uses rule-based candidate profiling; integration with a proper LLM (e.g., Gemini) would significantly improve response quality

---

## 11. Technology Stack Summary

**Frontend**
- React 18, TypeScript, Vite
- React Router v6, TanStack Query v5
- React Hook Form, Zod
- Tailwind CSS, shadcn/ui, Radix UI
- LiveKit React SDK
- Lucide React (icons)

**Backend**
- Node.js, Express, TypeScript
- Mongoose (MongoDB ODM)
- Passport.js (auth strategies)
- Multer (file uploads)
- Nodemailer (email)
- LiveKit Node SDK
- Google Generative AI SDK (Gemini)
- Zod (env validation)
- bcrypt, jsonwebtoken

**Infrastructure / Services**
- MongoDB Atlas (database)
- Upstash Redis (session/cache)
- AWS S3 / compatible blob storage (files)
- LiveKit Cloud (WebRTC video)
- Google Cloud (Gemini API, OAuth)
- Microsoft Azure (OAuth)
- SMTP (email delivery)

---

*Last updated: May 2026. Reflects all features implemented through the final development sprint including: plain-English audit narratives, AI oversight modes, CV download (individual + bulk), AI triage groupings, missed interview pipeline blocking, dark-mode doodle theming, login panel transition, super admin platform settings (fully wired), and candidate recommendations engine.*
