import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.ai.ocr import get_ocr_provider
from app.ai.visual import get_visual_matcher
from app.api.v1 import animals, auth, dashboard, farms, media
from app.core.config import get_settings
from app.db.session import engine

logging.basicConfig(level=logging.INFO)
settings = get_settings()

app = FastAPI(
    title="Ganadería AI API",
    version="0.1.0",
    description="API de gestión ganadera e identificación de animales por crotal. "
    "No sustituye a los sistemas oficiales de identificación y trazabilidad.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, farms.router, animals.router, media.router, dashboard.router, dashboard.activity_router):
    app.include_router(r, prefix=settings.api_prefix)


@app.get("/health", tags=["system"])
def health() -> dict:
    with engine.connect() as c:
        c.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get(f"{settings.api_prefix}/capabilities", tags=["system"])
def capabilities() -> dict:
    """Qué capacidades de IA están realmente disponibles en este despliegue."""
    ocr = get_ocr_provider()
    return {
        "ocr": {"provider": ocr.name, "available": ocr.available},
        "visual_recognition": {"available": get_visual_matcher().available, "phase": 3},
        "assistant": {"available": False, "phase": 3},
        "voice_input": {"available": False, "phase": 3},
        "health_module": {"available": False, "phase": 2},
    }
