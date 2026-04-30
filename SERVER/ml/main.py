from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
import numpy as np
import pandas as pd
import joblib
import json
from pathlib import Path
import shap
from xgboost import XGBClassifier
from fairlearn.metrics import demographic_parity_difference

app = FastAPI(title="RekrootAI ML Service")
ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts"
MODEL_PATH = ARTIFACTS / "fairness_model.joblib"
BACKGROUND_PATH = ARTIFACTS / "background.joblib"
METADATA_PATH = ARTIFACTS / "metadata.json"

_model: Optional[XGBClassifier] = None
_background: Optional[pd.DataFrame] = None
_explainer: Optional[Any] = None


class FairnessPayload(BaseModel):
    applicationId: str
    jobId: str
    candidateId: str
    protectedAttributes: Dict[str, Optional[str]]
    features: Dict[str, float]
    threshold: float


class ExplainPayload(BaseModel):
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
    _model = joblib.load(MODEL_PATH)
    _background = joblib.load(BACKGROUND_PATH)
    _explainer = shap.TreeExplainer(_model, _background)


@app.get("/health")
def health():
    return {"ok": True, "modelReady": MODEL_PATH.exists() and BACKGROUND_PATH.exists()}


@app.get("/metadata")
def metadata():
    if not METADATA_PATH.exists():
        return {"model_version": "unknown", "synthetic_data": True}
    return json.loads(METADATA_PATH.read_text(encoding="utf-8"))


@app.post("/train")
def train(payload: TrainPayload):
    if not payload.records:
        raise HTTPException(status_code=400, detail="records must not be empty")
    frame = pd.DataFrame(payload.records)
    if payload.labelKey not in frame.columns:
        raise HTTPException(status_code=400, detail=f"missing label key: {payload.labelKey}")
    y = frame[payload.labelKey].astype(int)
    drop_cols = [payload.labelKey]
    if payload.sensitiveKey in frame.columns:
        drop_cols.append(payload.sensitiveKey)
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
    return {"ok": True, "rows": int(len(X)), "features": list(X.columns)}


@app.post("/fairness-gate")
def fairness_gate(payload: FairnessPayload):
    _ensure_model_loaded()
    keys = list(_background.columns)
    row = pd.DataFrame([{k: float(payload.features.get(k, 0.0)) for k in keys}])
    p_s = float(_model.predict_proba(row)[0][1])

    # DP proxy based on background + supplied sensitive value
    bg = _background.copy()
    group_col = payload.protectedAttributes.get("gender") or payload.protectedAttributes.get("ethnicity") or payload.protectedAttributes.get("ageRange") or "unknown"
    sensitive = pd.Series([group_col] * len(bg))
    preds = (_model.predict_proba(bg)[:, 1] >= 0.5).astype(int)
    dp_diff = float(abs(demographic_parity_difference(y_true=np.ones(len(preds)), y_pred=preds, sensitive_features=sensitive)))
    delta = float(np.clip(dp_diff, 0.0, 0.4))
    p_prime = p_s * (1 - delta)
    decision = "pass" if p_prime >= payload.threshold else "fail"
    return {
        "p_s": float(p_s),
        "delta": float(delta),
        "p_prime_s": float(p_prime),
        "decision": decision,
        "reason": "XGBoost probability adjusted by Fairlearn demographic parity penalty.",
    }


@app.post("/explain")
def explain(payload: ExplainPayload):
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
    }
