# Frontend WasteWise

## Lancer en local

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

URL: `http://127.0.0.1:5173`

## Build production

```bash
npm run build
npm run preview
```

## Configuration API

Le frontend lit `VITE_API_BASE`.

Exemple `.env`:

```env
VITE_API_BASE=http://127.0.0.1:8001
```
