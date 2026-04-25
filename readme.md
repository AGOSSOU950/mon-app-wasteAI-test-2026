# WasteWise

Plateforme web d'analyse de dechets industriels, recommandation de valorisation, et marketplace B2B.

## Prerequis

- Node.js 20+
- Python 3.11+

## Backend local

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

API locale: `http://127.0.0.1:8001`

## Frontend local

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Frontend local: `http://127.0.0.1:5173`

## Variables d'environnement

Exemple: `.env.exemple`

- `OPENAI_API_KEY` ou `AFRI_API_KEY`
- `OPENAI_BASE_URL` ou `DATABASE_URL`
- `OPENAI_MODEL` (ex: `gpt-5.4-mini`)
- `CORS_ORIGINS` (optionnel)
- `WASTEAI_ADMIN_KEY` (optionnel)
