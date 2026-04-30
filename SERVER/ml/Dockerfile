FROM python:3.11-slim

# System deps for XGBoost / numpy build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Ensure scripts are executable
RUN chmod +x start.sh

# Railway injects $PORT; default to 8000 for local Docker runs
EXPOSE 8000

CMD ["sh", "start.sh"]
