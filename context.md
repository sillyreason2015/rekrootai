# Integra-Hire (AIRS) Context

Last updated: 2026-05-01 (Codex continuation, pipeline pass)  
Workspace: `C:\Users\Nathan\Documents\Claude\Projects\AIRS`

## Live state (defense mode)

- In-app browser currently at: `http://localhost:8000/` (ML service URL).
- Backend env has been populated with real external service values in `SERVER/.env`.
- Intended runtime:
  - Client: `http://localhost:3000`
  - Server: `http://localhost:4000`
  - ML: `http://localhost:8000`

## Backend completed

- Mongo-backed API bootstraps DB before listen.
- JWT auth + refresh token rotation (Upstash Redis REST).
- OAuth endpoints:
  - `GET /auth/google`, `GET /auth/google/callback`
  - `GET /auth/microsoft`, `GET /auth/microsoft/callback`
- Team invite token flow:
  - `POST /admin/team/invite` creates `EmailToken(kind='invite')`
  - `POST /admin/team/invite/accept` accepts token and provisions role/user.
- Question bank publish validation:
  - `POST /jobs/:id/publish` enforces min category counts.
- LiveKit JWT token issuance:
  - `GET /interviews/:id/token`
- Fairness/SHAP route integration:
  - `POST /applications/:id/fairness-gate`
  - `GET /applications/:id/explanation` reads latest explanation output
- Real correspondence email send:
  - `POST /applications/:id/correspondence/send` sends via SMTP (nodemailer).
- NDPR deletion improvements + protected attribute persistence in onboarding.

## ML completed

- ML service endpoints in `SERVER/ml/main.py`:
  - `GET /health`
  - `GET /metadata`
  - `POST /train`
  - `POST /fairness-gate`
  - `POST /explain`
- Added synthetic bootstrap path (for no-dataset scenario):
  - `scripts/generate_synthetic_dataset.py`
  - `scripts/train_from_csv.py`
- Artifact outputs:
  - `artifacts/fairness_model.joblib`
  - `artifacts/background.joblib`
  - `artifacts/metadata.json`
  - `artifacts/evaluation_report.json`
- Production guard in backend:
  - blocks fairness/explain calls in `NODE_ENV=production` when `metadata.synthetic_data=true`.

## Frontend completed

- Public-first routing added:
  - `/` -> `Landing`
  - `/jobs` -> public board
  - `/jobs/:id` -> public detail
- Apply guard now enforced in UI:
  - unauthenticated apply attempts redirect to `/register`.
- OAuth buttons wired in login page and callback token handoff handled.
- Invite acceptance page added:
  - `/accept-invite`
- Admin team page now surfaces acceptance link after invite creation.
- Recruiter onboarding upgraded to 5 steps and now sends team invites (`/admin/team/invite`) for entered emails.
- Recruiter onboarding hardening added:
  - `registrationNumber` (required)
  - `businessEmail` (required, non-free-domain)
  - `taxId` (optional)
- Candidate applications now show explicit decision/rejection notifications with explanation links.
- Recruiter dashboard includes a notifications panel for defense clarity.
- Profile headshot rendering fixed to use `avatarPreviewUrl` consistently in Settings and Navbar fallback flow.
- Role settings routes are now explicitly reachable for candidate, recruiter, admin, and super_admin through `/settings`.

## Infra/devops added

- Root compose stack added in `docker-compose.yml`:
  - mongo, redis, minio, mailpit, ml, livekit
- LiveKit local config:
  - `infra/livekit/livekit.yaml`
- CI scaffold:
  - `.github/workflows/ci.yml`

## Testing status

- Server type-check passes.
- Client TypeScript compile issues (unused imports and strictness noise) were patched across admin/candidate/recruiter pages.
- Client `vite build` currently fails in this local environment with `spawn EPERM` (esbuild process spawn), which is environment/runtime permission related.
- Server test scaffold added (`SERVER/tests/app.test.ts`) but `npm test` currently hits local `spawn EPERM` in this environment.
- Client Playwright scaffold added (`CLIENT/tests/e2e/auth.spec.ts`).
- Client lint script exists but repo lacks ESLint config, so lint currently fails until config is added.

## Remaining high-priority gaps

1. Full E2E flow execution with all services live (login -> apply -> assessment send -> fairness -> correspondence -> interview).
2. Stable runnable backend test runner in this environment (replace current failing invocation).
3. Add ESLint config for CLIENT to make `npm run lint` pass.
4. Expand integration and E2E coverage beyond smoke tests.
5. Post-defense secret rotation (AWS/SMTP/LiveKit/Redis credentials were shared in session).
6. Replace recruiter notifications placeholder card with live notification feed from server events.

## Latest backend delta (this pass)

- Added recruiter/admin action: `POST /applications/:id/send-assessment`
  - Forces stage to `assessment`
  - Sets `assessment.status='pending'`
  - Sets timed `expiresAt` (default 60m, bounded)
  - Writes audit action `assessment-send`
- Frontend shortlist now has `Send Assessment` button calling this endpoint.
- `/applications/mine` now enriches each application with:
  - `assessmentExpiresAt`
  - `assessmentStatus`
  - `fairnessComputedAt`
  - `explanationComputedAt`
- Candidate Applications page now shows assessment due time and explanation generation timing.
- `/applications/job/:jobId` now also returns:
  - `assessmentExpiresAt`
  - `assessmentStatus`
  - `fairnessComputedAt`
  - `explanationComputedAt`
- Recruiter shortlist now supports one-click `Run Fairness` per candidate and displays fairness/SHAP completion timestamps.
- Candidate assessment flow now calls `POST /assessments/:assessmentId/complete` after final module submit (previously only navigated away), ensuring stage progression persists.
- `GET /admin/dashboard` now returns `scope: 'company' | 'platform'` and the admin dashboard labels are scope-aware (`Team Members`, `Company Jobs`, `Company Applications` for company admin).
- Candidate dashboard now includes computed `nextAction` (assessment/interview) with target route and due timestamp for timeline clarity during demo.
- Recruiter correspondence flow now sends both `subject` and `message` payloads to `/applications/:id/correspondence/send` (template buttons now prefill both).
- Candidate dashboard `nextAction` now uses stage-priority ordering (assessment > interview > decision...) so the most urgent actionable step is always shown first.
- Recruiter shortlist `Run Fairness` is now disabled for early stages (`applied`, `screening`) to prevent out-of-sequence execution during demo.
- Candidate dashboard feed is now sorted deterministically (`applications.createdAt desc`, `interviews.scheduledAt asc`) to avoid inconsistent next-action behavior.
- Recruiter shortlist fairness trigger is now constrained to later stages only (`assessment|interview|decision`).
- Question bank backend is now Mongo-backed (no in-memory loss on restart), with company scoping for recruiter/admin and global access for super_admin.
- Publish-time minimum question validation now scopes by company (super_admin remains global), preventing cross-company leakage in publish checks.

## Quick run commands

### ML
- `cd SERVER/ml`
- `python -m venv .venv`
- `.venv\Scripts\activate`
- `pip install -r requirements.txt`
- `uvicorn main:app --host 0.0.0.0 --port 8000`

### Server
- `cd SERVER`
- `npm run type-check`
- `npm run dev`

### Client
- `cd CLIENT`
- `npm run dev`

## Defense runbook

- Added: `C:\Users\Nathan\Documents\Claude\Projects\AIRS\DEFENSE_RUNBOOK.md`
- Contains: timed end-to-end demo path for super admin, company admin, recruiter, and candidate flows including fairness/SHAP and correspondence proof points.
