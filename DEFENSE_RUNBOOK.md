# RekrootAI Defense Runbook

## Quick start

```
# 1. ML API
cd SERVER/ml && uvicorn main:app --host 0.0.0.0 --port 8000

# 2. Backend
cd SERVER && npm run dev

# 3. Frontend
cd CLIENT && npm run dev
```

---

## Login matrix

| Role | Email | Password |
|---|---|---|
| Super Admin | jatstonelimited@gmail.com | rekroot-adm1nistrator |
| Recruiter/Admin | your registered email | your password |
| Candidate | candidate email | candidate password |

---

## Defense flow (end-to-end vertical slice)

### 1. Recruiter — Post a job
- `/recruiter/jobs` → Create Job → fill 4 steps → Publish
- Before publish: ensure question bank has questions (use AI Generate on `/recruiter/question-bank`)

### 2. Candidate — Apply
- `/candidate/jobs` → find role → Apply
- Candidate dashboard shows **Next Action** card immediately

### 3. Recruiter — Shortlist pipeline (`/recruiter/shortlist`)
Each button advances the stage with audit + notification:

| Candidate stage | Available action |
|---|---|
| applied | **Shortlist** → moves to screening |
| screening | **Send Assessment** → moves to assessment, candidate gets email+notification |
| assessment | **Run Fairness** → runs XGBoost fairness gate + SHAP, moves to interview if pass |
| interview (no interview yet) | **Schedule Interview** → inline date/time picker → creates LiveKit room |
| interview (scheduled) | **Join** (opens room) · **Mark Complete** → moves to decision |

### 4. Candidate — Complete assessment
- Candidate dashboard → Next Action card → Start Assessment
- Completes all modules → auto-submits → recruiter gets notification

### 5. Live Interview (`/candidate/interview/:id` or `/recruiter/interview/:id`)
- Full-screen video room ✓ VERIFIED WORKING
- Live transcript panel (AI label, speaker detection)
- Timer running
- Mic/camera controls + hang-up

### 6. Recruiter — Final Decision (`/recruiter/final-selection`)
Shows ALL interview+decision stage candidates (not just decision).

- **Hire** / **Hold** / **Reject** buttons — each writes audit record
- After decision: add **Recruiter Feedback Note** (shown in candidate's AI explanation)
- Link to AI Explanation page for each candidate

### 7. Candidate — Decision Explanation (`/candidate/explanation/:id`)
- Final score (large)
- Score breakdown bars (CV, assessment, interview, fairness penalty)
- SHAP feature importance chart (green = positive, red = negative)
- AI-generated narrative (real, data-driven — not placeholder)
- Recruiter feedback note (amber card, "Human reviewed" badge)

### 8. Recruiter — Correspondence (`/recruiter/correspondence`)
- Select job → candidate dropdown shows **real names** (not Mongo IDs)
- Template presets: Shortlisted / Assessment / Interview / Not Selected / Offer
- Subject + body → sends real email via SMTP + logs to audit

---

## Defense proof pages

### AI Validation (`/admin/ai-validation`)
Live demonstration page for examiners:
1. Select any job + candidate application
2. Click **Run Full AI Pipeline**
3. Shows: Fairness Gate (PASS/FLAGGED) + δ bias correction + disparate impact score
4. Shows: SHAP feature importance bars (deterministic for candidate)
5. Shows: Composite score breakdown after pipeline
6. Shows: Generated AI narrative

**Proof points:**
- XGBoost + Fairlearn fairness gate with configurable threshold
- SHAP-backed explanation per candidate
- Recruiter retains override authority
- Every run logged in audit trail with model version

### LiveKit Smoke Test (`/admin/livekit-test`)
Infrastructure verification:
1. Select any interview
2. **Issue LiveKit Token** → shows JWT (truncated) + room name + wsUrl check
3. **Check Artifact Endpoints** → verifies transcript + recording URLs registered
4. Config reference panel shows required .env vars

---

## Role segregation (examiner checks)

| Check | Expected |
|---|---|
| Candidate tries recruiter route | Redirected |
| Recruiter tries admin route | Redirected |
| Unverified user logs in | Redirect to /check-email |
| No question bank on publish | Error: "not enough questions" |

---

## Human-in-the-loop evidence

1. **Shortlist** — recruiter approves each stage transition manually
2. **Run Fairness** — explicit button, not automatic
3. **Final Selection** — Hire/Hold/Reject buttons, recruiter writes notes
4. **Recruiter Note** — personal feedback added after decision, shown in candidate explanation
5. **Correspondence** — manual email composition with template starting points
6. **Audit log** — every action logged with actor + timestamp

---

## AI pipeline architecture (3-sentence summary for viva)

> Candidate CVs are matched against job requirements using cosine similarity scoring. Assessment responses are aggregated into a weighted score and passed through an XGBoost-based fairness gate (Fairlearn) that checks for demographic disparate impact before allowing progression to interview. SHAP values are computed per candidate to produce a feature-importance breakdown that explains the model's decision in human-readable terms, visible to both recruiters and candidates.
