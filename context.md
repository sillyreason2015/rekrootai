# RekrootAI Final Context

Last updated: 2026-05-14
Workspace: `C:\Users\Nathan\Documents\Claude\Projects\AIRS`

## Current project state

RekrootAI is now in a much stronger pre-completion state. The largest correctness issues in workflow behavior, composite scoring, interview room resilience, and AI mode semantics have been addressed in code.

The app now has:

- Stable multi-stage candidate progression
- Persisted AI oversight mode at the job level
- Explicit, non-destructive mode switching
- Correct composite score recomputation
- Safer interview scheduling/completion flow
- Mobile-improved interview room layouts
- Better recording mime fallback handling
- Camera reacquisition after failed/off video states
- Persisted interview proctoring events with recruiter visibility

## What was fixed in this stabilization pass

### 1. Composite score correctness

The composite score bug is fixed.

Before:

- `scores.final` could remain frozen at the original resume score
- candidates could incorrectly show `100%` composite despite weak assessment/interview results

Now:

- composite score is recomputed from stage scores consistently
- read-side responses also derive the correct final score for existing records

Relevant files:

- [scoring.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/SERVER/src/lib/scoring.ts)
- [applications.routes.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/SERVER/src/routes/applications.routes.ts)
- [assessments.routes.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/SERVER/src/routes/assessments.routes.ts)
- [interviews.routes.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/SERVER/src/routes/interviews.routes.ts)

### 2. AI mode semantics are now persistent and non-destructive

Before:

- the mode selector in shortlist was just local React state
- switching to `Veto` immediately triggered automated backend mutation
- users could accidentally change candidate stages just by exploring modes

Now:

- `aiMode` is persisted on the job
- switching mode requires confirmation
- changing mode does not mutate candidate stages
- auto-processing in veto mode is now an explicit `Run Auto-Triage` action

Relevant files:

- [Job.model.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/SERVER/src/models/Job.model.ts)
- [jobs.routes.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/SERVER/src/routes/jobs.routes.ts)
- [Shortlist.tsx](C:/Users/Nathan/Documents/Claude/Projects/AIRS/CLIENT/src/pages/recruiter/Shortlist.tsx)
- [types/index.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/CLIENT/src/types/index.ts)

### 3. Stage regression protections are in place

Before:

- mode-driven actions could move candidates backward
- undo paths were too permissive
- several endpoints trusted the current stage too loosely

Now:

- `/applications/:id/ai-decide` refuses to mutate candidates who are no longer in `applied`
- `undo-veto` only works while the candidate is still at the immediate veto outcome
- workflow endpoints now guard allowed stages more strictly

Added backend protections cover:

- shortlist only from `applied`
- send assessment only from `screening`
- undo assessment only from `assessment`
- fairness gate only from `assessment`, `interview`, or `decision`
- final decision only from `decision`
- interview scheduling only after assessment review
- interview completion only before completed/cancelled terminal state

Relevant files:

- [applications.routes.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/SERVER/src/routes/applications.routes.ts)
- [interviews.routes.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/SERVER/src/routes/interviews.routes.ts)

## Important workflow rules now reflected in code

These rules are now mostly true in implementation:

1. Changing AI mode affects future behavior, not past stage history.
2. Auto-triage is an explicit action, not a side effect of changing tabs/toggles.
3. Candidates should not move backward unless the recruiter explicitly invokes a rollback path.
4. Invalid stage transitions are rejected by the server instead of silently mutating state.

## Interview module status

### What is now working better

- Interview rooms are more mobile-friendly
  - video panes stack more cleanly on small screens
  - right-side panels are no longer forced into a fixed desktop-only layout
- Recording setup is more resilient
  - tries WebM and MP4-compatible mime options instead of WebM-only assumptions
- Camera recovery is better
  - when a local video track dies, the room can reacquire a fresh track instead of leaving the user stuck
- Proctoring is more complete
  - client-side violations can be posted to the backend
  - interviewer can see persisted proctoring alerts in the recruiter room

Relevant files:

- [candidate/InterviewRoom.tsx](C:/Users/Nathan/Documents/Claude/Projects/AIRS/CLIENT/src/pages/candidate/InterviewRoom.tsx)
- [recruiter/InterviewRoom.tsx](C:/Users/Nathan/Documents/Claude/Projects/AIRS/CLIENT/src/pages/recruiter/InterviewRoom.tsx)
- [interviewRecording.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/CLIENT/src/lib/interviewRecording.ts)
- [useProctoringMonitor.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/CLIENT/src/hooks/useProctoringMonitor.ts)
- [interview.service.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/CLIENT/src/services/interview.service.ts)
- [interviews.routes.ts](C:/Users/Nathan/Documents/Claude/Projects/AIRS/SERVER/src/routes/interviews.routes.ts)

### What is still not fully production-grade

- Proctoring is still rule/event-based, not computer-vision-based
- No face detection / multi-face detection / identity assurance
- No robust server-side STT pipeline
- Recording/browser behavior still needs real-device validation, especially on Safari/iOS

## User experience impact after fixes

### Recruiters should no longer experience

- candidates disappearing from Final Selection just because mode changed
- candidates being silently pushed backward by switching between Assist/Veto/Override
- the mode toggle acting like a destructive command
- camera failing permanently after a single off/on cycle in many common cases

### Candidates should no longer experience as often

- seemingly irrational state changes caused by recruiter mode exploration
- hidden proctoring violations with no backend trace
- some camera recovery failures after toggling video

## Remaining risks

The biggest remaining risks are no longer basic logic bugs. They are validation and polish risks.

### 1. Real-browser/device validation is still needed

Type-checking passes, but this environment has not fully verified:

- iPhone Safari interview recording behavior
- Android Chrome recording behavior
- weak-network reconnect behavior during live interviews
- long-session performance in transcript/recording flows

### 2. Some rollback semantics are still product-policy sensitive

The platform now blocks many invalid transitions, but product decisions may still be needed for:

- whether a recruiter should be able to reopen rejected candidates later by explicit action
- whether fairness reruns should be allowed after final decision
- whether there should be a dedicated “reopen decision” action

### 3. Proctoring is auditable but still lightweight

The system now stores and displays proctoring events, but it should not be overclaimed as advanced anti-cheat monitoring.

## Testing status

Verified in this workspace:

- `cd SERVER && npm run type-check` passes
- `cd CLIENT && npm exec tsc --noEmit` passes

This means the current server/client integration compiles cleanly after the stabilization pass.

## Defense-safe wording

Safe to claim:

- RekrootAI supports configurable human-AI oversight modes with persisted job-level behavior.
- Candidate progression is stage-based and now guarded against accidental regressions.
- Composite scoring is weighted and recalculated correctly across stages.
- Live interview rooms support transcript capture, recording, rubric scoring, and proctoring event logging.
- Recruiters can review proctoring alerts during the interview workflow.

Avoid overclaiming:

- fully production-validated mobile/browser interview compatibility
- advanced AI proctoring with facial analysis or identity verification
- fully complete forensic-grade interview recording pipeline across all browsers

## Best next step after this point

The next highest-value step is live QA, not broad new feature work.

Recommended sequence:

1. Run full recruiter/candidate walkthroughs on desktop
2. Run actual mobile-browser interview tests
3. Validate notification wording and final-selection behavior with seeded scenarios
4. Only after that, add any remaining product-policy actions like explicit reopen flows

## High-confidence summary

The app is now much closer to completion.

The most dangerous logic bugs were:

- destructive mode switching
- stale composite scoring
- weak stage-transition safeguards

Those are now fixed or strongly mitigated in code.
