# RekrootAI Defense Runbook (60-minute execution)

## 1) Start services

1. ML API  
   - `cd C:\Users\Nathan\Documents\Claude\Projects\AIRS\SERVER\ml`
   - activate venv
   - `uvicorn main:app --host 0.0.0.0 --port 8000`
2. Backend  
   - `cd C:\Users\Nathan\Documents\Claude\Projects\AIRS\SERVER`
   - `npm run dev`
3. Frontend  
   - `cd C:\Users\Nathan\Documents\Claude\Projects\AIRS\CLIENT`
   - `npm run dev`

## 2) Login matrix

1. Super Admin: `jatstonelimited@gmail.com / rekroot-adm1nistrator`
2. Company Admin: first recruiter of a company (auto-promoted at onboarding)
3. Recruiter: invited user (non-admin)
4. Candidate: normal candidate account

## 3) Company admin flow

1. Login as company admin.
2. Open `/admin/team`, invite recruiter.
3. Open `/admin/jobs/create`, create + publish a job.
4. Confirm question-bank minimums before publish (validation should enforce).

## 4) Candidate flow

1. Open public board `/jobs`.
2. Open a job, click apply (if logged out -> redirect to register/login).
3. Candidate dashboard should show pipeline and `Next Action` card.
4. Candidate applications page should show stage and assessment due time when sent.

## 5) Recruiter flow (pipeline core)

1. Open `/recruiter/shortlist?job=<jobId>`.
2. Click `Send Assessment` for a candidate.
3. Candidate completes all modules.
4. Recruiter clicks `Run Fairness` (enabled only in valid stages).
5. Confirm fairness + SHAP timestamps appear.
6. Schedule interview and test join-token endpoint:
   - `GET /interviews/:id/token` (LiveKit JWT)

## 6) Decision + correspondence

1. Recruiter/admin makes final decision.
2. Open recruiter correspondence page and send subject+message.
3. Candidate views explanation page with score breakdown and SHAP features.

## 7) Super admin flow

1. Open internal routes:
   - `/internal/super-admin/dashboard`
   - `/internal/super-admin/users`
   - `/internal/super-admin/companies`
   - `/internal/super-admin/audit-log`
2. Verify company from super-admin companies page.
3. Confirm company admin dashboard remains company-scoped.

## 8) Expected proof points for examiners

1. Role segregation:
   - Recruiter cannot create jobs.
   - Company admin can create jobs for own company.
   - Super admin has platform-wide controls.
2. AI pipeline:
   - Assessment -> fairness gate -> SHAP explanation.
3. Human-in-loop:
   - Recruiter/admin decision action remains explicit.
4. Auditability:
   - Recruiter audit is scoped; admin sees company-level.
5. Explainability:
   - Candidate explanation page shows component scores and SHAP signals.
