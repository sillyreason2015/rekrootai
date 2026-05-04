# AIRS System Context (Thesis + Implementation)

## Product Summary
AIRS is an AI-assisted recruitment platform with candidate, recruiter, and admin experiences.

## Core Pipeline
1. applied -> CV review
2. screening -> shortlist review
3. assessment -> test completion
4. interview -> scheduled/live/completed or missed
5. decision -> hire/hold/reject
6. offered/rejected -> terminal

## Modes
- Assist: AI recommends, recruiter approves.
- Veto: AI auto-decides, recruiter can reverse.
- Override: manual recruiter decisions.

## Implemented Focus
- Doodly background styling utility for recruiter review blocks.
- Recruiter CV downloads: single candidate + all candidates.
- AI triage grouping: Strong, Needs Review, Weak.
- Assist-only recruiter AI companion interaction.
- Interview missed/cancelled no longer treated as active interview action.

## Rules
- Next action UI should render only when a valid transition exists.
- Missed interview should stop showing interview as active.
- AI assistant chat should run only in Assist mode.
