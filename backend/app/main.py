import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes.marketplace_routes import router as marketplace_router
from app.routes.waste_routes import router as waste_router

load_dotenv()


def _get_data_dir() -> Path:
    raw = os.getenv("WASTEAI_DATA_DIR")
    if raw and raw.strip():
        return Path(raw).expanduser().resolve()
    return Path(__file__).resolve().parent / "data"


def _get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    if not raw.strip():
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    origins = [x.strip() for x in raw.split(",") if x.strip()]
    return origins or ["http://localhost:5173", "http://127.0.0.1:5173"]


app = FastAPI(
    title="WasteAI API",
    description="Moteur de decision pour la gestion des dechets industriels",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

data_dir = _get_data_dir()
uploads_dir = data_dir / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

app.include_router(waste_router)
app.include_router(marketplace_router)


@app.get("/")
def root():
    return {"message": "WasteAI API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}
