import os
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any
import numpy as np
import pandas as pd
import joblib
import json
from pathlib import Path
import shap
from xgboost import XGBClassifier
from fairlearn.metrics import demographic_parity_difference, equal_opportunity_difference

app = FastAPI(title="RekrootAI ML Service")
ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts"
MODEL_PATH = ARTIFACTS / "fairness_model.joblib"
BACKGROUND_PATH = ARTIFACTS / "background.joblib"
METADATA_PATH = ARTIFACTS / "metadata.json"

_model: Optional[XGBClassifier] = None
_background: Optional[pd.DataFrame] = None
_explainer: Optional[Any] = None
SERVICE_TOKEN = os.getenv("ML_SERVICE_TOKEN")
NODE_ENV = os.getenv("NODE_ENV", "development")


def _require_service_token(token: Optional[str]) -> None:
    if SERVICE_TOKEN and token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid ML service token")
    if NODE_ENV == "production" and not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="ML service authentication is not configured")


class FairnessPayload(BaseModel):
    applicationId: str
    jobId: str
    candidateId: str
    protectedAttributes: Dict[str, Optional[str]]
    features: Dict[str, float]
    threshold: float = Field(ge=0.0, le=1.0)
    cohort: List[Dict[str, Any]] = Field(default_factory=list)
    minimumGroupSize: int = Field(default=5, ge=1, le=10000)


class ExplainPayload(BaseModel):
    applicationId: str
    modelInput: Dict[str, float]

class ScorePayload(BaseModel):
    applicationId: str
    modelInput: Dict[str, float]

class TrainPayload(BaseModel):
    records: List[Dict[str, Any]]
    labelKey: str = "label"
    sensitiveKey: str = "group"


def _ensure_model_loaded():
    global _model, _background, _explainer
    if _model is not None and _background is not None and _explainer is not None:
        return
    if not MODEL_PATH.exists() or not BACKGROUND_PATH.exists():
        raise HTTPException(status_code=503, detail="Model artifacts missing. Call /train or provide artifacts.")
    try:
        _model = joblib.load(MODEL_PATH)
        _background = joblib.load(BACKGROUND_PATH)
        _explainer = shap.TreeExplainer(_model, _background)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Model load failed: {exc}") from exc


@app.get("/health")
def health():
    return {"ok": True, "modelReady": MODEL_PATH.exists() and BACKGROUND_PATH.exists()}


@app.get("/metadata")
def metadata():
    if not METADATA_PATH.exists():
        return {"model_version": "unknown", "synthetic_data": True}
    return json.loads(METADATA_PATH.read_text(encoding="utf-8"))


@app.post("/train")
def train(payload: TrainPayload, token: Optional[str] = Header(default=None, alias="x-ml-service-token")):
    _require_service_token(token)
    if not payload.records:
        raise HTTPException(status_code=400, detail="records must not be empty")
    frame = pd.DataFrame(payload.records)
    if payload.labelKey not in frame.columns:
        raise HTTPException(status_code=400, detail=f"missing label key: {payload.labelKey}")
    y = frame[payload.labelKey].astype(int)
    protected_columns = {
        payload.sensitiveKey,
        "group",
        "gender",
        "age",
        "ageRange",
        "ethnicity",
        "disability",
        "disabilityStatus",
        "religion",
        "nationality",
    }
    drop_cols = [payload.labelKey, *[column for column in protected_columns if column in frame.columns and column != payload.labelKey]]
    X = frame.drop(columns=drop_cols)
    if X.empty:
        raise HTTPException(status_code=400, detail="no feature columns after dropping label/sensitive keys")

    model = XGBClassifier(
        n_estimators=120,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X, y)

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    background = X.sample(min(len(X), 200), random_state=42)
    joblib.dump(model, MODEL_PATH)
    joblib.dump(background, BACKGROUND_PATH)

    global _model, _background, _explainer
    _model = model
    _background = background
    _explainer = shap.TreeExplainer(_model, _background)
    METADATA_PATH.write_text(json.dumps({
        "model_version": "xgb-v1-trained",
        "synthetic_data": False,
        "training_source": "authenticated_api_records",
        "trained_rows": int(len(X)),
        "feature_cols": list(X.columns),
        "protected_columns_excluded": sorted(protected_columns),
        "metrics_scope": "not_evaluated",
    }, indent=2), encoding="utf-8")
    return {"ok": True, "rows": int(len(X)), "features": list(X.columns), "synthetic_data": False}


@app.post("/fairness-gate")
def fairness_gate(payload: FairnessPayload, token: Optional[str] = Header(default=None, alias="x-ml-service-token")):
    _require_service_token(token)
    _ensure_model_loaded()
    keys = list(_background.columns)
    row = pd.DataFrame([{k: float(payload.features.get(k, 0.0)) for k in keys}])
    p_s = float(_model.predict_proba(row)[0][1])

    # Compute parity across the submitted job cohort, never by repeating one
    # candidate's attribute across the model background rows.
    cohort_rows = payload.cohort or [{"protectedAttributes": payload.protectedAttributes, "features": payload.features}]
    cohort_frame = pd.DataFrame([{k: float(item.get("features", {}).get(k, 0.0)) for k in keys} for item in cohort_rows])
    cohort_preds = (_model.predict_proba(cohort_frame)[:, 1] >= 0.5).astype(int)
    sensitive_by_attribute = {
        key: pd.Series([item.get("protectedAttributes", {}).get(key) for item in cohort_rows])
        for key in ("gender", "ageRange", "ethnicity")
    }
    dp_by_attribute = {}
    dp_status_by_attribute = {}
    for key, sensitive in sensitive_by_attribute.items():
        valid = sensitive.notna() & (sensitive != "Prefer not to say")
        group_counts = sensitive[valid].value_counts()
        if len(group_counts) < 2 or group_counts.min() < max(1, payload.minimumGroupSize):
            dp_by_attribute[key] = 0.0
            dp_status_by_attribute[key] = "insufficient_data"
            continue
        dp_by_attribute[key] = float(abs(demographic_parity_difference(
            y_true=np.ones(int(valid.sum())), y_pred=cohort_preds[valid.to_numpy()], sensitive_features=sensitive[valid]
        )))
        dp_status_by_attribute[key] = "computed"
    # Use the worst observed protected-attribute disparity for the gate.
    computed_dps = [value for key, value in dp_by_attribute.items() if dp_status_by_attribute[key] == "computed"]
    dp_diff = max(computed_dps, default=0.0)
    labels = [item.get("groundTruth") for item in cohort_rows]
    eod_by_attribute = {}
    for key, sensitive in sensitive_by_attribute.items():
        valid = sensitive.notna() & (sensitive != "Prefer not to say")
        group_counts = sensitive[valid].value_counts()
        has_valid_labels = all(label in (0, 1) for label in labels) and len(set(labels)) == 2 and len(group_counts) >= 2 and (len(group_counts) and group_counts.min() >= max(1, payload.minimumGroupSize))
        eod_by_attribute[key] = float(abs(equal_opportunity_difference(
            y_true=np.array(labels)[valid.to_numpy()], y_pred=cohort_preds[valid.to_numpy()], sensitive_features=sensitive[valid]
        ))) if has_valid_labels else None
    computed_eods = [value for value in eod_by_attribute.values() if value is not None]
    eod = max(computed_eods, default=None)
    eod_status = "computed" if computed_eods else "insufficient_data"
    delta = float(np.clip(dp_diff, 0.0, 0.4))
    p_prime = p_s * (1 - delta)
    decision = "pass" if p_prime >= payload.threshold else "fail"
    return {
        "p_s": float(p_s),
        "delta": float(delta),
        "p_prime_s": float(p_prime),
        "decision": decision,
        "reason": "XGBoost probability adjusted by cohort-level Fairlearn demographic parity penalty.",
        "metric": "demographic_parity_difference",
        "cohortSize": len(cohort_rows),
        "modelVersion": json.loads(METADATA_PATH.read_text(encoding="utf-8")).get("model_version", "unknown") if METADATA_PATH.exists() else "unknown",
        "demographicParityByAttribute": dp_by_attribute,
        "demographicParityStatusByAttribute": dp_status_by_attribute,
        "equalOpportunityDifference": eod,
        "equalOpportunityByAttribute": eod_by_attribute,
        "equalOpportunityStatus": eod_status,
    }


@app.post("/score")
def score(payload: ScorePayload, token: Optional[str] = Header(default=None, alias="x-ml-service-token")):
    _require_service_token(token)
    _ensure_model_loaded()
    keys = list(_background.columns)
    row = pd.DataFrame([{k: float(payload.modelInput.get(k, 0.0)) for k in keys}])
    probability = float(_model.predict_proba(row)[0][1])
    return {
        "probability": probability,
        "score": round(probability * 100, 2),
        "modelVersion": json.loads(METADATA_PATH.read_text(encoding="utf-8")).get("model_version", "unknown") if METADATA_PATH.exists() else "unknown",
    }


@app.post("/explain")
def explain(payload: ExplainPayload, token: Optional[str] = Header(default=None, alias="x-ml-service-token")):
    _require_service_token(token)
    _ensure_model_loaded()
    keys = list(_background.columns)
    row = pd.DataFrame([{k: float(payload.modelInput.get(k, 0.0)) for k in keys}])
    shap_values = _explainer.shap_values(row)
    if isinstance(shap_values, list):
        values = np.array(shap_values[0][0])
    else:
        values = np.array(shap_values[0])
    pairs = list(zip(keys, values.tolist()))
    top = sorted(pairs, key=lambda x: abs(x[1]), reverse=True)[:7]
    return {
        "explanation": "Top factors generated by SHAP TreeExplainer on the XGBoost model.",
        "topFeatures": [{"name": str(k), "value": float(v)} for k, v in top],
        "modelVersion": json.loads(METADATA_PATH.read_text(encoding="utf-8")).get("model_version", "unknown") if METADATA_PATH.exists() else "unknown",
    }
