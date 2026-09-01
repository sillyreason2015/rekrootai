# RekrootAI deployment runbook

## Target topology

`https://rekrootai.vercel.app` serves the Vite client from `CLIENT/dist`. Vercel proxies `/api/*` to the authenticated Render API at `https://rekroot-ai-bck.onrender.com`. The API calls the private ML service using `ML_SERVICE_TOKEN`; browser clients never receive that token.

## First deployment / rename

Run from the repository root after authenticating the Vercel CLI:

```powershell
npx vercel login
npx vercel whoami
npx vercel link --yes --project rekrootai
npx vercel deploy --prod --yes --name rekrootai
```

If the Vercel account already owns a different project, link that project rather than creating a duplicate. The project name controls the `rekrootai.vercel.app` hostname; `vercel.json` controls the client build and API proxy.

## Required configuration

Vercel:

- `VITE_API_BASE_URL` should be unset so the client uses same-origin `/api`.
- Confirm the production deployment is built from the repository root.

Render API:

- `CORS_ORIGIN=https://rekrootai.vercel.app`
- `ML_SERVICE_URL=<private ML service URL>`
- `ML_SERVICE_TOKEN=<random secret of at least 32 characters>`
- `NODE_ENV=production`

Render ML service:

- `NODE_ENV=production`
- `ML_SERVICE_TOKEN=<the same random secret>`
- Deploy a non-synthetic model artifact before enabling production traffic.

## Smoke-test gate

After deployment, verify:

1. `https://rekrootai.vercel.app/` loads and refreshes on a nested route.
2. `https://rekrootai.vercel.app/api/health` reaches the API.
3. `https://rekrootai.vercel.app/api/ready` returns HTTP 200 and reports MongoDB and Redis as `ok`.
4. Candidate CV processing does not send raw CV text to enrichment or ML.
5. A new application receives either a production model score or a visible 503 (never a silent production heuristic fallback).
6. Fairness review reports cohort size, per-attribute status, and insufficient-data states.
7. SHAP output includes the model version when the ML service is enabled.
8. Final hire/reject requires a human rationale and is recorded in the audit log.
9. Synthetic artifacts are rejected by the production API.

## Load and performance gate

Run the bounded, non-mutating production check from `SERVER`:

```powershell
npm run test:load
```

The default run sends 30 requests per scenario at concurrency 5 to health,
readiness, public jobs, and invalid-login validation endpoints. Before a major
release, repeat with a controlled ramp:

```powershell
$env:LOAD_TEST_TOTAL = '100'
$env:LOAD_TEST_CONCURRENCY = '20'
npm run test:load
```

Record status distribution and p50/p95/p99 latency. The test must have zero
unexpected responses or transport errors. The current observed baseline at
concurrency 20 is approximately 2.5 seconds p95 and 4.2 seconds p99 for
public jobs; investigate regressions above that baseline. This is a bounded
read-path test, not a maximum-capacity or destructive saturation test.

Do not publish thesis claims about production accuracy, bias elimination, or universal SHAP coverage until these checks and a held-out evaluation on representative data are complete.
