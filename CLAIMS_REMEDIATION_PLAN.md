# RekrootAI claims remediation plan

## Target system design

1. **Privacy boundary**: extract CV text, load only the candidate's protected-attribute and identity values needed for redaction, then produce one masked representation. No scorer, Gemini prompt, SHAP request, or persisted derived profile may receive the raw CV.
2. **Scoring contract**: the application service owns one scoring request containing job-relevant features only. It stores model version, inputs, output, and explanation together as an auditable AI output.
3. **Fairness service**: calculate demographic-parity and equal-opportunity metrics over the full job cohort, require minimum group sample sizes, return metric definitions and uncertainty/insufficient-data states, and never claim a pass from a single candidate's attribute.
4. **Mitigation**: fairness findings become a review gate. Any score adjustment must be explicit, bounded, reproducible, and separately recorded; a flag is not described as a correction.
5. **Explainability**: generate SHAP only from the same feature vector used for the model decision. Persist the top contributions and expose them to recruiter and candidate views with a model version.
6. **Human control**: enforce assist, veto, and override semantics server-side. Final hire/reject remains human-owned, with a required rationale and an immutable decision event.
7. **Evidence discipline**: distinguish synthetic model metrics from production performance. Every thesis number must map to a checked-in artifact, reproducible command, and test scope.

## Implementation order

- [x] Centralize anonymization and route all CV enrichment through masked text.
- [x] Add cohort fairness metrics and explicit review flags; retain the heuristic audit as a transparent fallback until the production model is validated.
- [x] Call the ML service for model scoring and SHAP, with fail-closed behavior in production.
- [x] Add equal-opportunity metric reporting with insufficient-data status.
- [x] Enforce final-decision rationale validation, veto constraints, and override decisions.
- [x] Protect ML scoring, training, and explainability endpoints with a service token.
- [x] Exclude all declared protected-attribute columns from API-trained classifier features and record model provenance.
- [ ] Add integration tests for live ML privacy, fairness, explainability, and human override invariants once the ML runtime is available in CI.

## Current evidence boundary

The checked-in model artifact is synthetic and remains blocked in production. A production deployment requires an authenticated training run with representative, consented records, held-out evaluation by protected attribute, and a successful live `/health`, `/score`, `/fairness-gate`, and `/explain` smoke test. Until those gates pass, the application must not claim production model accuracy, bias elimination, or guaranteed SHAP coverage.
