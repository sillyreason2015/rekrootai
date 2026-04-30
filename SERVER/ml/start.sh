#!/bin/sh
# Model artifacts are baked into the Docker image at build time.
# This script simply starts the FastAPI server on the Railway-injected $PORT.
PORT="${PORT:-8000}"
echo "[ml] Starting FastAPI on port $PORT..."
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
