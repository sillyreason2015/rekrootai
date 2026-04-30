#!/bin/sh
# Startup script for the RekrootAI ML service.
# - Generates synthetic training data and trains the XGBoost model on first boot
#   (when no artifacts exist). Subsequent restarts skip training and start instantly.
# - Respects $PORT injected by Railway / Render (defaults to 8000).

set -e

PORT="${PORT:-8000}"

if [ ! -f "artifacts/fairness_model.joblib" ]; then
  echo "[ml] No model artifacts found — generating synthetic data and training..."
  python scripts/generate_synthetic_dataset.py
  python scripts/train_from_csv.py
  echo "[ml] Training complete."
else
  echo "[ml] Artifacts found — skipping training."
fi

echo "[ml] Starting FastAPI on port $PORT..."
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
