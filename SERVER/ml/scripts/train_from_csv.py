from __future__ import annotations
import json
from pathlib import Path
import joblib
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, accuracy_score
from fairlearn.metrics import demographic_parity_difference
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "synthetic_training.csv"
ART = ROOT / "artifacts"


def main():
    if not DATA.exists():
        raise SystemExit(f"missing dataset: {DATA}")
    df = pd.read_csv(DATA)
    label = "label"
    sensitive = "group"
    feature_cols = ["resume", "assessment", "interview"]
    X = df[feature_cols]
    y = df[label].astype(int)
    s = df[sensitive].astype(str)

    X_train, X_test, y_train, y_test, s_train, s_test = train_test_split(
        X, y, s, test_size=0.2, random_state=42, stratify=y
    )

    model = XGBClassifier(
        n_estimators=180,
        max_depth=4,
        learning_rate=0.07,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train)
    p = model.predict_proba(X_test)[:, 1]
    pred = (p >= 0.5).astype(int)

    report = {
        "rows": int(len(df)),
        "features": feature_cols,
        "auc": float(roc_auc_score(y_test, p)),
        "accuracy": float(accuracy_score(y_test, pred)),
        "demographic_parity_difference": float(abs(demographic_parity_difference(y_true=y_test, y_pred=pred, sensitive_features=s_test))),
        "synthetic_data": True,
    }

    ART.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, ART / "fairness_model.joblib")
    joblib.dump(X_train.sample(min(len(X_train), 200), random_state=42), ART / "background.joblib")
    (ART / "metadata.json").write_text(json.dumps({
        "model_version": "xgb-v1-synth",
        "synthetic_data": True,
        "feature_cols": feature_cols,
    }, indent=2), encoding="utf-8")
    (ART / "evaluation_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
