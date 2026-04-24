# Deploiement Production - WasteAI

## Cible
- Frontend: Render Static Site (ou Vercel/Netlify)
- Backend: Render Web Service (FastAPI)
- Stockage persistant: Render Disk (uploads, historique, base marketplace)

## 1) Deployer avec Render Blueprint
1. Pousser ce repo sur GitHub.
2. Dans Render: `New +` -> `Blueprint` -> connecter le repo.
3. Render detecte `render.yaml` et cree:
   - `wasteai-backend`
   - `wasteai-frontend`
4. Renseigner les variables `sync: false`.

## 2) Variables backend a configurer
- `CORS_ORIGINS`: URL frontend de prod, ex: `https://wasteai-frontend.onrender.com`
- `WASTEAI_ADMIN_KEY`: cle admin API
- `ANTHROPIC_API_KEY`: active l'identification image IA
- SMTP (optionnel): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS`

Variables deja preparees:
- `WASTEAI_DATA_DIR=/var/data/wasteai`
- disque monte sur `/var/data`

## 3) Variable frontend
- `VITE_API_BASE`: URL publique backend, ex: `https://wasteai-backend.onrender.com`

## 4) Verification apres deploiement
- Backend health: `GET /health` -> `{"status":"ok"}`
- Frontend charge sans page blanche
- Test rapide:
  - Analyse de dechet
  - Publication annonce marketplace
  - Tracabilite lot -> evenement -> elimination finale

## 5) Note architecture
La stack deployee maintenant est stable en production, avec persistance disque.
Pour une scalabilite multi-instance complete, prochaine etape: migration SQLite/JSON vers PostgreSQL + stockage objet (S3/R2) pour uploads et preuves.
