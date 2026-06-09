"""
Full model evaluation: AUC-ROC, accuracy, precision, recall, F1 + diagrams.
Outputs saved to SERVER/ml/evaluation/
"""
from __future__ import annotations
import json
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    auc,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
    ConfusionMatrixDisplay,
)
from sklearn.model_selection import train_test_split
import shap

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "synthetic_training.csv"
ART = ROOT / "artifacts"
OUT = ROOT / "evaluation"
OUT.mkdir(parents=True, exist_ok=True)


def main():
    df = pd.read_csv(DATA)
    feature_cols = ["resume", "assessment", "interview"]
    X = df[feature_cols]
    y = df["label"].astype(int)
    s = df["group"].astype(str)

    _, X_test, _, y_test, _, s_test = train_test_split(
        X, y, s, test_size=0.2, random_state=42, stratify=y
    )

    model = joblib.load(ART / "fairness_model.joblib")
    background = joblib.load(ART / "background.joblib")

    p = model.predict_proba(X_test)[:, 1]
    pred = (p >= 0.5).astype(int)

    # ── Core metrics ─────────────────────────────────────────────────────────
    roc_auc = float(roc_auc_score(y_test, p))
    acc = float(accuracy_score(y_test, pred))
    prec = float(precision_score(y_test, pred))
    rec = float(recall_score(y_test, pred))
    f1 = float(f1_score(y_test, pred))

    report = {
        "roc_auc": roc_auc,
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1_score": f1,
        "test_samples": int(len(y_test)),
        "positive_rate": float(y_test.mean()),
    }

    (OUT / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\n===  MODEL EVALUATION RESULTS  ===")
    print(f"  ROC-AUC   : {roc_auc:.4f}")
    print(f"  Accuracy  : {acc:.4f}")
    print(f"  Precision : {prec:.4f}")
    print(f"  Recall    : {rec:.4f}")
    print(f"  F1 Score  : {f1:.4f}")
    print(f"\nFull classification report:\n")
    print(classification_report(y_test, pred, target_names=["Rejected", "Hired"]))

    # ── 1. ROC Curve ─────────────────────────────────────────────────────────
    fpr, tpr, _ = roc_curve(y_test, p)
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot(fpr, tpr, color="#4f46e5", lw=2, label=f"AUC = {roc_auc:.4f}")
    ax.plot([0, 1], [0, 1], "k--", lw=1, alpha=0.5)
    ax.fill_between(fpr, tpr, alpha=0.08, color="#4f46e5")
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC Curve — AIRS XGBoost Model")
    ax.legend(loc="lower right")
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(OUT / "roc_curve.png", dpi=150)
    plt.close()

    # ── 2. Precision-Recall Curve ─────────────────────────────────────────────
    prec_curve, rec_curve, _ = precision_recall_curve(y_test, p)
    pr_auc = auc(rec_curve, prec_curve)
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot(rec_curve, prec_curve, color="#059669", lw=2, label=f"PR AUC = {pr_auc:.4f}")
    ax.fill_between(rec_curve, prec_curve, alpha=0.08, color="#059669")
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title("Precision-Recall Curve — AIRS XGBoost Model")
    ax.legend(loc="upper right")
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(OUT / "precision_recall_curve.png", dpi=150)
    plt.close()

    # ── 3. Confusion Matrix ───────────────────────────────────────────────────
    cm = confusion_matrix(y_test, pred)
    fig, ax = plt.subplots(figsize=(6, 5))
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=["Rejected", "Hired"])
    disp.plot(ax=ax, colorbar=False, cmap="Blues")
    ax.set_title("Confusion Matrix — AIRS XGBoost Model")
    plt.tight_layout()
    plt.savefig(OUT / "confusion_matrix.png", dpi=150)
    plt.close()

    # ── 4. Metrics Bar Chart ──────────────────────────────────────────────────
    labels = ["ROC-AUC", "Accuracy", "Precision", "Recall", "F1 Score"]
    values = [roc_auc, acc, prec, rec, f1]
    colors = ["#4f46e5", "#059669", "#d97706", "#dc2626", "#7c3aed"]
    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(labels, values, color=colors, width=0.5, edgecolor="white")
    ax.set_ylim(0, 1.1)
    ax.set_ylabel("Score")
    ax.set_title("Model Performance Metrics — AIRS XGBoost")
    for bar, val in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02,
                f"{val:.4f}", ha="center", va="bottom", fontsize=10, fontweight="bold")
    ax.grid(axis="y", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    plt.tight_layout()
    plt.savefig(OUT / "metrics_summary.png", dpi=150)
    plt.close()

    # ── 5. SHAP Feature Importance ────────────────────────────────────────────
    explainer = shap.TreeExplainer(model, background)
    shap_values = explainer.shap_values(X_test)
    if isinstance(shap_values, list):
        sv = shap_values[1] if len(shap_values) > 1 else shap_values[0]
    else:
        sv = shap_values

    mean_abs = np.abs(sv).mean(axis=0)
    feat_imp = sorted(zip(feature_cols, mean_abs), key=lambda x: x[1], reverse=True)
    names, imps = zip(*feat_imp)
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.barh(names, imps, color=["#4f46e5", "#059669", "#d97706"])
    ax.set_xlabel("Mean |SHAP value|")
    ax.set_title("SHAP Feature Importance — AIRS XGBoost")
    ax.grid(axis="x", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    plt.tight_layout()
    plt.savefig(OUT / "shap_feature_importance.png", dpi=150)
    plt.close()

    # ── 6. Score Distribution by Group ───────────────────────────────────────
    test_df = X_test.copy()
    test_df["prob"] = p
    test_df["group"] = s_test.values
    fig, ax = plt.subplots(figsize=(8, 5))
    for grp, color in [("A", "#4f46e5"), ("B", "#dc2626")]:
        subset = test_df[test_df["group"] == grp]["prob"]
        ax.hist(subset, bins=25, alpha=0.6, color=color, label=f"Group {grp}", edgecolor="white")
    ax.set_xlabel("Predicted Probability (Hired)")
    ax.set_ylabel("Count")
    ax.set_title("Score Distribution by Group — Fairness Audit")
    ax.legend()
    ax.grid(axis="y", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    plt.tight_layout()
    plt.savefig(OUT / "score_distribution_by_group.png", dpi=150)
    plt.close()

    print(f"\nAll outputs saved to: {OUT}")
    print("  metrics.json")
    print("  roc_curve.png")
    print("  precision_recall_curve.png")
    print("  confusion_matrix.png")
    print("  metrics_summary.png")
    print("  shap_feature_importance.png")
    print("  score_distribution_by_group.png")


if __name__ == "__main__":
    main()
