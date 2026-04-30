# AIRS Project Context and Handoff

Last updated: 2026-04-30
Workspace root: `AIRS`
GitHub: https://github.com/sillyreason2015/rekrootai.git (branch: main)

---

## 1) Current State — Both Apps Are Running

### Ports
| App    | Port | Start command           |
|--------|------|-------------------------|
| CLIENT | 3000 | `cd CLIENT && npm run dev` |
| SERVER | 4000 | `cd SERVER && npm run dev` |

Vite proxy: `CLIENT/vite.config.ts` rewrites `/api/*` → `http://localhost:4000/*` (strips `/api` prefix).

### Mock login credentials (all password: `demo1234`)
| Role      | Email                       | Token                         |
|-----------|-----------------------------|-------------------------------|
| Admin     | admin@rekroot.local         | mock-token:mock-admin         |
| Recruiter | recruiter@rekroot.local     | mock-token:mock-recruiter     |
| Candidate | candidate@rekroot.local     | mock-token:mock-candidate     |

Quick-login buttons are present on the login page.

---

## 2) What Is Complete

### CLIENT (React 18 + Vite + TypeScript + Tailwind)
- Full 22-page application covering all three personas (candidate, recruiter, admin)
- Auth: mock auth in `AuthContext` (localStorage mock tokens) + real API fallback
- All routes wired in `App.tsx` with role-based `ProtectedRoute` guards
- Service layer: `src/lib/axios.ts` (base URL `/api`, 401 interceptor with silent refresh)
- Design tokens: `--primary: 18 71% 32%` (terracotta), `--background: 33 75% 95%` (cream)
- All pages: Login, Register, Onboarding, CandidateDashboard, Jobs, JobDetail,
  MyApplications, Assessment, Interview, Explanation, RecruiterDashboard,
  RecruiterJobs, CreateJob, Shortlist, QuestionBank, RecruiterInterview,
  FinalSelection, Correspondence, AdminDashboard, AuditLog, BiasAudit, Team,
  Billing, Settings, 404

### SERVER (Node 20 + Express 4 + TypeScript — zero type errors)
Route modules and sample endpoints:

| Mount        | Key routes                                                         |
|--------------|--------------------------------------------------------------------|
| `/auth`      | POST /login, /register, /refresh, /logout, /me, PATCH /me, POST /change-password |
| `/candidates`| GET/PATCH /me, POST /me/cv, POST /me/onboarding, GET /me/dashboard |
| `/jobs`      | GET / (public), GET/POST /mine, GET/PATCH /:id, POST /:id/publish, /:id/close |
| `/applications` | POST /, GET /mine, GET /:id, GET /job/:jobId, POST /:id/shortlist, /reject, /decision, /explanation, /correspondence/send |
| `/assessments` | GET /:applicationId, POST /:id/start, /:id/modules/:type/submit, /:id/complete |
| `/interviews` | GET /mine, GET /:id, POST /, GET /:id/token, POST /:id/rubric, /:id/complete, /:id/artifacts |
| `/admin`     | GET /dashboard, /audit-log, /bias-audits, /team, /billing; POST /bias-audits/run, /team/invite |
| `/question-bank` | GET /, POST /, DELETE /:id                                    |

In-memory seed data (resets on restart):
- 3 users (admin, recruiter, candidate)
- 2 jobs (1 published, 1 draft)
- 1 application (app-1, shortlisted, scores 0–100 scale)
- 1 assessment (completed), 1 interview (scheduled), AI outputs, bias audits, audit log

All passwords stripped from API responses. `satisfies` removed from seed arrays (replaced with explicit `db` object type). All `req.params` wrapped in `String()`.

---

## 3) Known Gaps (In Priority Order)

### P0 — Candidate auto-profile creation
When a new candidate registers via `/auth/register`, a `User` is created but no `Candidate` profile is inserted into `db.candidates`. The `GET /candidates/me` endpoint will return 404 for any newly registered candidate. Fix: in `createUser()` (mockStore.ts) or in the register route, auto-create a `Candidate` entry when `role === 'candidate'`.

### P0 — Assessment creation on application
There is no route that creates an `Assessment` record when a candidate applies. The candidate journey expects `GET /assessments/:applicationId` to return an assessment. Currently only the seed `app-1` has one. Fix: in `POST /applications`, auto-create an `Assessment` entry and link it to the application.

### P1 — Persistent database (MongoDB)
Replace in-memory `db` object in `mockStore.ts` with MongoDB + Mongoose models. Collections mirror the `db` keys. No schema changes needed — the `domain.ts` interfaces map cleanly to Mongoose schemas.

Connection string: `MONGODB_URI=mongodb://localhost:27017/airs` (add to `.env`)

### P1 — Real JWT auth (replace mock tokens)
Current mock tokens are plain strings `mock-token:<userId>`. Replace with:
- `jsonwebtoken` package, RS256 or HS256
- Short-lived access tokens (15 min), rotating refresh tokens in httpOnly cookie
- `argon2` for password hashing (replace plain-text passwords in seed)
- `POST /auth/verify-email` and `POST /auth/forgot-password` need real email dispatch

### P1 — File storage for CV uploads
Currently `POST /candidates/me/cv` uses `multer` memory storage and only saves a mock URL. Wire up:
- MinIO (local dev) or S3 (prod) for CV PDF storage
- CV text extraction (PDF.js or Apache Tika) to populate `cvParsed`

### P1 — Zod DTO validation on all write routes
No input validation exists on route bodies beyond optional chaining and nullish coalescing. Add Zod schemas as Express middleware for all POST/PATCH routes.

### P2 — Email (SMTP / Mailpit)
`POST /applications/:id/correspondence/send` only logs. Wire up Nodemailer + Mailpit (dev) for:
- Correspondence emails to candidates
- Invitation emails from `/admin/team/invite`
- Assessment links and interview reminders

### P2 — Redis (session store / queue)
- Store refresh tokens in Redis (TTL = 7 days) instead of `Map<string, string>`
- Bull/BullMQ for async CV parsing and scoring jobs

### P2 — AI scoring pipeline
The `explanation` endpoint returns hardcoded values. Implement:
- Resume keyword/semantic scoring (`alpha` blending)
- Assessment module scoring aggregation
- Final score formula: `S_final = w1·r_s + w2·a_s + w3·p_s + w4·h_s`
- SHAP-style explainability per feature

### P2 — Tests
No test coverage. Add:
- Vitest unit tests for domain helpers (mockStore functions, scoring utilities)
- Supertest integration tests for critical flows (auth, apply, assess, interview)

---

## 4) Services Needed for Production

| Service       | Purpose                        | Dev option           | Prod option          |
|---------------|-------------------------------|----------------------|----------------------|
| MongoDB       | Primary database               | Docker / Atlas free  | MongoDB Atlas        |
| Redis         | Token store, job queue         | Docker               | Upstash / Redis Cloud |
| MinIO / S3    | CV and media file storage      | Docker MinIO         | AWS S3 / Cloudflare R2 |
| SMTP          | Transactional email            | Mailpit (Docker)     | SendGrid / Resend    |
| Video (optional) | Interview room tokens       | Daily.co / Agora     | Daily.co             |
| Reverse proxy | TLS + routing                  | Caddy (Docker)       | Nginx / Cloudflare   |

---

## 5) Execution Checklist

### Already done ✅
- [x] CLIENT fully built (22 pages, all routes, auth context, service layer)
- [x] SERVER fully scaffolded (8 route modules, zero TypeScript errors)
- [x] Vite proxy port + path rewrite fixed
- [x] Auth responses strip password field
- [x] Admin audit-log shape aligned to client
- [x] Admin team endpoint returns `{ members }` shape
- [x] Explanation endpoint returns `{ scores: { resumeScore, assessmentScore, ... } }`
- [x] Question bank routes created
- [x] Application seed scores in 0–100 scale
- [x] Committed and pushed to GitHub

### Immediate next tasks
- [ ] Auto-create `Candidate` profile on register (P0)
- [ ] Auto-create `Assessment` on application submit (P0)
- [ ] Add Zod validation middleware to all write routes (P1)
- [ ] Wire MongoDB with Mongoose (replace mockStore) (P1)
- [ ] Real JWT implementation with argon2 passwords (P1)
- [ ] CV upload to MinIO/S3 (P1)
- [ ] Email via Nodemailer + Mailpit (P2)
- [ ] Redis for refresh token store (P2)
- [ ] Integration test suite with Supertest (P2)
- [ ] CI config (GitHub Actions: type-check + lint + test) (P2)

---

## 6) Architecture Notes

- **Score storage:** All scores stored as integers 0–100 in `Application.scores.*`
- **Pagination:** All list endpoints return `{ data, total, page, limit, totalPages }`
- **Error format:** All errors return `{ message: string }` with appropriate HTTP status
- **Auth header:** `Authorization: Bearer <token>` — verified in `requireAuth` middleware
- **Role guard:** `requireRole(...roles)` checks `req.user.role` after `requireAuth`
- **Candidate link:** `Candidate.user` = `User._id`; `Application.candidate` = `Candidate._id`
