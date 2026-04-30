FROM python:3.11-slim

# System deps for XGBoost / numpy build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (separate layer — cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Train the model at BUILD TIME so artifacts are baked into the image.
# This means every cold start is instant and the model always matches
# the exact package versions installed above.
RUN python scripts/generate_synthetic_dataset.py \
 && python scripts/train_from_csv.py

RUN chmod +x start.sh

# Railway injects $PORT at runtime; default to 8000 for local Docker runs
EXPOSE 8000

CMD ["sh", "start.sh"]
