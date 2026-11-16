import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
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


# --- Versión web de la app (exportada con `npx expo export --platform web`, ver scripts/build_web.sh) ---
WEB_DIR = Path(__file__).resolve().parent.parent / "web"
_RESERVED = ("api/", "docs", "redoc", "openapi.json", "health", "info")


@app.get("/info", include_in_schema=False, response_class=HTMLResponse)
def info() -> str:
    return _LANDING


@app.get("/{full_path:path}", include_in_schema=False)
def web_app(full_path: str):
    """Sirve la app web. Las rutas desconocidas devuelven index.html (navegación del lado del cliente)."""
    if full_path.startswith(_RESERVED) or not (WEB_DIR / "index.html").is_file():
        if full_path == "":
            return HTMLResponse(_LANDING)
        raise HTTPException(status_code=404, detail="Not Found")
    candidate = (WEB_DIR / full_path).resolve()
    if full_path and candidate.is_file() and WEB_DIR.resolve() in candidate.parents:
        cache = "public, max-age=31536000, immutable" if full_path.startswith("_expo/") else "no-cache"
        return FileResponse(candidate, headers={"Cache-Control": cache})
    html = WEB_DIR / (full_path.rstrip("/") + ".html") if full_path else None
    if html and html.is_file() and WEB_DIR.resolve() in html.resolve().parents:
        return FileResponse(html, headers={"Cache-Control": "no-cache"})
    return FileResponse(WEB_DIR / "index.html", headers={"Cache-Control": "no-cache"})


_LANDING = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Ganadería AI</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1b1d1a}
h1{color:#1F5130}a{display:block;margin:12px 0;padding:16px;border-radius:12px;background:#1F5130;color:#fff;
text-decoration:none;font-weight:700;text-align:center}.ok{background:#E3F0E6;padding:12px;border-radius:10px}</style>
</head><body><h1>Ganadería AI · API</h1><p class="ok">✅ El servidor está funcionando.</p>

<a href="/docs">Probar la API (documentación interactiva)</a><a href="/health">Estado del servidor</a>
<p>Cuenta de demostración: <b>demo@ganaderia.ai</b> / <b>Demo1234!</b></p></body></html>"""
