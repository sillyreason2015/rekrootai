## RekrootAI ML Service

Endpoints:
- `GET /health`
- `POST /train`
- `POST /fairness-gate`
- `POST /explain`

### Quick start

```bash
cd SERVER/ml
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Train once with representative records, then call fairness/explain from backend.

### Synthetic bootstrap (no real dataset yet)

```bash
python scripts/generate_synthetic_dataset.py
python scripts/train_from_csv.py
```

This writes:
- `artifacts/fairness_model.joblib`
- `artifacts/background.joblib`
- `artifacts/metadata.json`
- `artifacts/evaluation_report.json`

`metadata.json` sets `"synthetic_data": true`.  
Backend blocks synthetic artifacts when `NODE_ENV=production`.
