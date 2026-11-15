import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
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


@app.get("/", include_in_schema=False, response_class=HTMLResponse)
def root() -> str:
    return """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Ganadería AI</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1b1d1a}
h1{color:#1F5130}a{display:block;margin:12px 0;padding:16px;border-radius:12px;background:#1F5130;color:#fff;
text-decoration:none;font-weight:700;text-align:center}.ok{background:#E3F0E6;padding:12px;border-radius:10px}</style>
</head><body><h1>Ganadería AI · API</h1><p class="ok">✅ El servidor está funcionando.</p>
<p>Esta dirección es el servidor. La app se abre en el móvil con Expo Go.</p>
<a href="/docs">Probar la API (documentación interactiva)</a><a href="/health">Estado del servidor</a>
<p>Cuenta de demostración: <b>demo@ganaderia.ai</b> / <b>Demo1234!</b></p></body></html>"""


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
