# Integra-Hire (AIRS) Context

Last updated: 2026-04-30  
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

- OAuth buttons wired in login page and callback token handoff handled.
- Invite acceptance page added:
  - `/accept-invite`
- Admin team page now surfaces acceptance link after invite creation.

## Infra/devops added

- Root compose stack added in `docker-compose.yml`:
  - mongo, redis, minio, mailpit, ml, livekit
- LiveKit local config:
  - `infra/livekit/livekit.yaml`
- CI scaffold:
  - `.github/workflows/ci.yml`

## Testing status

- Server type-check passes.
- Server test scaffold added (`SERVER/tests/app.test.ts`) but `npm test` currently hits local `spawn EPERM` in this environment.
- Client Playwright scaffold added (`CLIENT/tests/e2e/auth.spec.ts`).
- Client lint script exists but repo lacks ESLint config, so lint currently fails until config is added.

## Remaining high-priority gaps

1. Full E2E flow execution with all services live (login -> apply -> fairness -> correspondence -> interview).
2. Stable runnable backend test runner in this environment (replace current failing invocation).
3. Add ESLint config for CLIENT to make `npm run lint` pass.
4. Expand integration and E2E coverage beyond smoke tests.
5. Post-defense secret rotation (AWS/SMTP/LiveKit/Redis credentials were shared in session).

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
