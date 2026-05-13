# Integra-Hire (AIRS) Context

Last updated: 2026-05-13  
Workspace: `C:\Users\Nathan\Documents\Claude\Projects\AIRS`

## Project baseline from thesis

- Chapter 3 defines RekrootAI as a four-stage sequential evaluation system:
  1. Resume-job fit using hybrid TF-IDF + semantic similarity
  2. Structured assessment with proctoring
  3. Fairness-adjusted AI ranking
  4. Live interview with recruiter human review in `veto`, `assist`, or `override` mode
- Chapter 4 describes the implemented architecture as:
  - React + TypeScript frontend
  - Node/Express + MongoDB + Redis application layer
  - Python FastAPI ML microservice
  - LiveKit-backed WebRTC interview infrastructure
- Interview expectations from the thesis:
  - Recruiter schedules a live room
  - System issues time-limited room access tokens
  - Recruiter scores by rubric
  - Collaboration mode is recorded with the decision
  - Audit log captures human/AI interaction

## Current verified app state

- Candidate onboarding endpoint exists at `POST /candidates/me/onboarding`.
- Recruiter onboarding now exists at `POST /auth/onboarding`.
- Recruiter onboarding invite flow now uses `POST /companies/invite` instead of the admin-only invite route.
- Account management routes now exist and are wired to the client:
  - `PATCH /auth/me`
  - `POST /auth/change-password`
  - `POST /auth/me/avatar`
- Auth refresh handling in the client has been hardened so concurrent `401` responses no longer hang queued requests indefinitely.
- A route contract simulator exists at `SERVER/scripts/route-contract-check.mjs` and currently reports no missing client/server route contracts.
- Unsupported social login is now gated:
  - `GET /auth/provider-status` exposes whether Google/Microsoft providers are actually configured.
  - Login only renders social-login buttons when the provider is enabled.
  - When provider credentials are configured, `/auth/google` and `/auth/microsoft` now perform real OAuth redirects and callback token exchange instead of returning placeholder `501`s.

## Interview module: current truthful status

- The interview module is partially aligned to the thesis, not fully.
- Recent alignment fixes completed:
  - `GET /interviews/:id/token` now returns `wsUrl` and generates a real LiveKit JWT when `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_HOST` are configured.
  - Interview access checks now restrict `GET /interviews/:id`, `GET /interviews/:id/token`, and artifacts access to the owning recruiter, owning candidate, or admins.
  - Interview scheduling now persists `collaborationMode`.
  - Interview completion now persists `collaborationMode` and optional `aiRecommendation`.
  - Application listing routes now expose `interviewId`, `interviewStatus`, `interviewScheduledAt`, and `interviewMode` so the shortlist UI can reflect actual interview state.
  - Recruiter shortlist now passes the active mode into scheduling and the recruiter interview room URL.
  - Interview transcript snapshots can now be persisted from the interview rooms through `POST /interviews/:id/transcript`, and speaker-specific updates are merged instead of overwriting the whole transcript.
  - Both recruiter and candidate interview rooms now restore previously persisted transcript lines when reloading the room.
  - Interview completion now stores a lightweight `aiAnalysis` artifact derived from rubric score, transcript stats, and recommendation state so artifacts are no longer empty after completion.
  - Expired scheduled interviews are now auto-reconciled server-side into a missed/cancelled state with candidate notification and rejection handling.
  - A background scheduler now sweeps for expired interviews every minute so missed-interview handling no longer depends only on user read/access traffic.
  - Final recruiter decision audit entries now derive mode from the linked interview collaboration mode instead of hard-coding `assist`.
  - Final decisions now keep `hold` in `decision`, move `reject` to `rejected`, and move `hire` to `offered`.
- Still not fully aligned to the thesis:
  - No real post-call interview recording pipeline is implemented.
  - Transcript capture still relies on browser speech recognition rather than a dedicated server-side speech-to-text pipeline.
  - No real speaker diarisation pipeline is implemented.
  - The saved `aiAnalysis` artifact uses Gemini when configured and otherwise falls back to a lightweight rules-based summary, so it is still not a dedicated interview analyser service.

## Performance and reliability findings

- Health and forgot-password no longer block for ~10 seconds when Mongo is disconnected.
- Global request slowness from settings-cache DB waits was reduced by:
  - bypassing maintenance checks on `/health`
  - short-circuiting settings fetches when Mongo is not connected
  - reducing Mongoose buffer timeout behavior
- Mongo connection handling is now more production-like:
  - centralized DB connect path in `SERVER/src/db/mongoose.ts`
  - `bufferCommands` disabled
  - lower server selection/connect timeouts
  - tuned socket and pool settings
- Additional indexes now exist for the most common route filters:
  - jobs by `status/createdAt` and `createdBy/createdAt`
  - applications by `candidate`, `job`, `stage`, and duplicate-prevention on `candidate+job`
  - interviews by `status/scheduledAt`, `recruiter/scheduledAt`, and recent application lookup
  - notifications by `user/read/createdAt`
- DB-backed routes can still take ~3 seconds to fail when Mongo is unavailable. That is much better than before, but production latency still needs real database profiling.

## Testing status

- `SERVER`: `npm run type-check` passes.
- `SERVER`: `npm run contract-check` passes.
- `SERVER`: API test suite `SERVER/tests/app.test.ts` passes `8/8` after adding `supertest`.
- `CLIENT`: `npm exec tsc --noEmit` passes.
- `CLIENT`: full Vite production build is still blocked in this environment by `spawn EPERM` from `esbuild`, so local compile verification is TypeScript-only here.

## Important corrections to older project notes

- OAuth is not fully implemented.
  - Provider callback flow now exists for Google and Microsoft when credentials are configured.
  - The current implementation auto-provisions new OAuth sign-ins as candidate accounts; recruiter/admin OAuth onboarding is still not a complete enterprise identity flow.
- The current system should not be described as having complete LiveKit interview infrastructure unless the environment variables are configured and tested live.
- The current system should not be described as having completed recording review, diarisation, or a production-grade AI interview analysis service.

## Recommended defense-safe wording

- Safe to claim:
  - role-based onboarding
  - hybrid screening pipeline
  - assessment workflow with proctoring signals
  - fairness gate and explanation endpoints
  - live interview room integration path using LiveKit
  - audit-oriented human-AI collaboration design
- Avoid overclaiming:
  - fully operational OAuth social login
  - complete automated interview transcription/diarisation/recording analysis
  - production-proven low-latency performance across all environments

## Immediate next engineering priorities

1. Finish the interview module to match the thesis:
   - replace browser-only transcript capture with a more reliable STT pipeline
   - add real recording capture and diarisation
   - upgrade lightweight interview analysis into a defensible analyser service
   - keep expanding collaboration mode visibility across recruiter review screens
2. Harden OAuth account lifecycle:
   - support recruiter/admin-first OAuth onboarding deliberately instead of defaulting new OAuth sign-ins to candidate
   - add provider account linking and clearer callback error handling
3. Run a true end-to-end test with LiveKit configured:
   - recruiter schedules interview
   - candidate joins
   - recruiter joins
   - rubric saved
   - interview completed
   - application advances to decision
4. Profile production slowness:
   - Mongo query timings
   - external SMTP/Redis/Object Storage waits
   - any ML-service blocking calls

## Useful commands

- Server type-check: `cd SERVER && npm run type-check`
- Server contract simulation: `cd SERVER && npm run contract-check`
- Server tests: `cd SERVER && node --import tsx --test tests\\app.test.ts`
- Client TypeScript check: `cd CLIENT && npm exec tsc --noEmit`
