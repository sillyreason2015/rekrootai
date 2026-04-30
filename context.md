# AIRS Project Context and Handoff

Last updated: 2026-04-30
Workspace root: `AIRS`

## 1) What has been completed so far

### Client (already present)
- React + TypeScript + Vite app scaffold is in place.
- Role-based route structure exists for:
  - Candidate flows
  - Recruiter flows
  - Admin flows
- Auth/onboarding route guards are wired through `ProtectedRoute` and `AuthContext`.
- Service-layer files exist for auth, jobs, applications, assessments, interviews, candidate, and admin domains.
- Shared UI component primitives exist (`button`, `card`, `input`, `tabs`, etc.).

### Server (new scaffold work currently in uncommitted changes)
A full TypeScript/Express backend scaffold has been added under `SERVER/` with:
- Runtime and config:
  - Express app setup with CORS, Helmet, Morgan, body parsing, cookie parsing
  - Env parsing/validation via Zod
  - Health endpoint
- Domain models:
  - Shared interfaces for users, candidates, jobs, applications, assessments, interviews, AI outputs, bias audits, audit logs
- In-memory data store:
  - Seed users, company, candidate profile, jobs, applications, assessments, interviews, audit/bias data
- Auth utilities:
  - Mock bearer-token authentication (`mock-token:<userId>`)
  - Role checks and request typing
- Route groups implemented:
  - `/auth`
  - `/candidates`
  - `/jobs`
  - `/applications`
  - `/assessments`
  - `/interviews`
  - `/admin`
- Ops/dev setup:
  - `package.json` with dev/build/type-check scripts
  - `tsconfig.json`
  - `.env.example`
  - `.gitignore`
  - Scaffold `README.md`

## 2) Current app state

### Frontend state
- The frontend has broad page coverage across all major personas.
- Routing is organized and role-gated.
- Frontend appears ready to consume real backend APIs, but behavior quality depends on service endpoint alignment and error handling completeness.

### Backend state
- Backend is a functional scaffold, not production-ready.
- Current persistence is fully in-memory (process restart resets data).
- Auth is mock-token based (no JWT signing/verification, no real session hardening).
- Several business operations intentionally return placeholder or simulated values (for example random assessment/interview scoring in some endpoints).

### Repository state snapshot
- There are uncommitted additions in `SERVER/` and root lockfile changes.
- This means backend scaffold work exists locally but still needs validation and commit strategy.

## 3) Known gaps and risks

- No persistent database integration yet (MongoDB/Postgres not wired).
- No object/file storage integration for CV or media artifacts.
- No queue/background worker for async tasks (scoring, parsing, notifications, audits).
- No test suites are present for server routes/domain logic in this scaffold.
- Security is scaffold-level only:
  - mock auth tokens
  - no hardened auth/session strategy
  - no rate limiting/abuse controls
- Validation is partial and route-specific, not yet consistently enforced across all DTOs.
- API contract parity between client service layer and server endpoints still needs a full compatibility pass.

## 4) Remaining deliverables (priority order)

### P0: Make scaffold reliably runnable end-to-end
- Ensure `CLIENT` and `SERVER` can run together locally with documented ports/base URLs.
- Add/confirm API base URL config in client env and axios instance.
- Run type-check and basic smoke tests for critical user flows.

### P0: API contract alignment
- Compare each client service call against server route shape:
  - method
  - path
  - request body/query
  - response contract
- Fix mismatches and standardize error payload format.

### P1: Persistence + auth hardening
- Replace in-memory store with real persistence layer.
- Introduce proper auth implementation:
  - signed JWT access tokens
  - secure refresh token storage/rotation/invalidation
  - secure cookie settings by environment

### P1: Data and domain integrity
- Add schema validation for all incoming payloads (Zod DTOs per route).
- Add business rule enforcement (ownership checks, role constraints, status transitions).
- Replace simulated/random scoring placeholders with deterministic or service-driven logic.

### P1: Reliability and observability
- Add structured logging and request IDs.
- Add centralized error codes and trace-safe error responses.
- Add basic metrics and health/readiness checks suitable for deployment.

### P2: Test coverage
- Add unit tests for core domain utilities.
- Add integration tests for critical route flows:
  - auth login/refresh/logout
  - candidate apply flow
  - assessment lifecycle
  - interview lifecycle
  - admin audit/bias endpoints

### P2: Production concerns
- Add rate limiting, input size guards, and security headers tuning.
- Add CI checks (type-check, lint, tests).
- Add deployment manifests and environment documentation.

## 5) Execution checklist for next agent (Claude or Codex)

Use this as a working checklist and mark status as work progresses.

- [ ] Install dependencies and run both apps (`CLIENT`, `SERVER`)
- [ ] Confirm port and CORS compatibility
- [ ] Verify auth flow end-to-end from frontend
- [ ] Verify candidate core journey:
  - [ ] browse jobs
  - [ ] view job details
  - [ ] submit application
  - [ ] view applications
  - [ ] start/complete assessment
- [ ] Verify recruiter journey:
  - [ ] create/edit/publish jobs
  - [ ] shortlist/reject/decision actions
  - [ ] schedule/complete interviews
- [ ] Verify admin journey:
  - [ ] dashboard stats
  - [ ] audit log filters/pagination
  - [ ] bias audit run/list
  - [ ] team invite and billing views
- [ ] Build API contract matrix (client services vs server routes)
- [ ] Implement/fix any contract mismatches
- [ ] Add schema validation coverage for all write routes
- [ ] Add at least one integration test per critical flow
- [ ] Replace mock auth/persistence with production-ready implementation plan
- [ ] Commit in logical slices with clear messages

## 6) Suggested immediate next 3 tasks

1. Run and verify local boot for both apps, then document exact run commands and env values.
2. Build API contract diff document and fix high-impact mismatches first (auth + jobs + applications).
3. Add initial automated integration tests for auth and application submission flow.

## 7) Important implementation notes

- This server is intentionally a scaffold to unblock frontend integration quickly.
- Keep incremental commits small and isolated by concern (contract fixes, validation, auth, persistence, tests).
- Do not treat seeded in-memory behavior as final product behavior.
