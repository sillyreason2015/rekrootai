# RekrootAI — High-Priority Fixes for Codex

## Context
MERN + TypeScript recruitment platform. Server: `SERVER/src/`, Client: `CLIENT/src/`.
All routes use Express + Mongoose. Client uses React 18 + TanStack Query + Tailwind + shadcn/ui.

---

## Task 1 — Final Selection Page (recruiter)

**Gap:** There is no dedicated "Final Selection" page. Recruiters must find decision-stage candidates buried in the Shortlist. This is a core workflow step.

**Build:** `CLIENT/src/pages/recruiter/FinalSelection.tsx`

Requirements:
- Query: `GET /applications?jobId=&stage=decision` (use existing `applicationService.listForJob`)
- Filter for `app.stage === 'decision'` client-side
- Per-candidate card showing: name, composite score, stage breakdown scores (resume/assessment/interview)
- Three action buttons: **Hire** / **Hold** / **Reject** — each calls `POST /applications/:id/decide` with `{ decision: 'hire'|'hold'|'reject', note?: string }`
- Optional override note textarea (shown when any button is clicked, before confirming)
- After action: invalidate query, show inline success state
- Override mode: if job's AI mode is `override`, label buttons "Manual: Hire/Hold/Reject" and show a note "AI scores advisory only"

**Server route** `POST /applications/:id/decide` already exists at `SERVER/src/routes/applications.routes.ts` — search for `decide` to confirm exact path.

**Register route** in `CLIENT/src/App.tsx` under the recruiter/admin group:
```
<Route path="/recruiter/final-selection" element={<FinalSelection />} />
```

**Add nav link** in the recruiter sidebar/nav (find where `/recruiter/shortlist` is linked and add adjacent entry).

---

## Task 2 — Recruiter Dashboard pipeline summary widget

**Gap:** Recruiter dashboard (`CLIENT/src/pages/recruiter/Dashboard.tsx`) shows stats but no visual pipeline funnel showing how many candidates are at each stage across all jobs.

**Build:** Add a "Pipeline Funnel" card to the recruiter dashboard.

- Query: `GET /recruiter/pipeline-summary` (already implemented, returns `{ applied, screening, assessment, interview, decision, rejected, offered }`)
- Render as horizontal bar chart or simple stage-count row
- Each stage pill is clickable → navigates to `/recruiter/shortlist` (no deep filter needed)
- Use existing `useQuery` + `Card` pattern from the file

---

## Task 3 — Candidate CV upload visible on Settings Profile tab

**Gap:** Candidates can upload a CV at onboarding but there is no CV upload UI on the Settings page. The `candidateService.uploadCv()` method exists.

**Add to** `CLIENT/src/pages/Settings.tsx` inside the Profile `<TabsContent value="profile">` card, after the avatar section:

```tsx
{user?.role === 'candidate' && (
  <div className="space-y-1.5">
    <Label>CV / Resume</Label>
    {/* show current CV filename from candidateProfile?.cvParsed?.fileName */}
    {/* file input that calls candidateService.uploadCv() on change */}
    {/* show upload spinner + success message */}
  </div>
)}
```

Use the existing `candidateProfile` query (already in the component at `queryKey: ['candidate-profile']`).

---

## Task 4 — Protect `PATCH /candidates/me` from overwriting reserved fields

**Gap:** `SERVER/src/routes/candidate.routes.ts` line 48 passes `req.body` directly to `findByIdAndUpdate`. A candidate could overwrite `cvUrl`, `cvParsed`, or `user` field.

**Fix:** Add a field allowlist before the update:

```ts
const ALLOWED = ['headline','skills','experience','education','linkedIn','portfolio','location','availableFrom']
const safeUpdate = Object.fromEntries(
  Object.entries(req.body).filter(([k]) => ALLOWED.includes(k))
)
const updated = await CandidateModel.findByIdAndUpdate(candidate._id, safeUpdate, { new: true }).lean()
```

---

## Task 5 — Job `close` route restricted to admin only — recruiters locked out

**Gap:** `SERVER/src/routes/jobs.routes.ts` — `POST /:id/close` and `DELETE /:id` require `admin` or `super_admin`. But recruiters also see these buttons in the UI (`CLIENT/src/pages/recruiter/Jobs.tsx`). Recruiters get a 403.

**Fix:** Add `'recruiter'` to the `requireRole` call on both routes:
```ts
jobsRouter.post('/:id/close', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), ...)
jobsRouter.delete('/:id', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), ...)
```

---

## Task 6 — `GET /jobs/mine` returns all jobs not scoped to the recruiter's company

**Check:** `SERVER/src/routes/jobs.routes.ts` — find the `/mine` route and verify it filters by `createdBy: req.user._id`. If it queries all jobs, scope it to the user.

Expected filter:
```ts
{ createdBy: req.user!._id }
// or for admin: { companyName: req.user!.companyName }
```

---

## Notes
- Do not touch migration files or seed data
- Do not change auth middleware
- All new components must pass `npx tsc --noEmit` cleanly
- Follow existing patterns: TanStack Query for data fetching, shadcn `Card`/`Button`/`Input` components, Tailwind for styling
