from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Ganadería AI"
    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://ganaderia:ganaderia@localhost:5432/ganaderia"

    jwt_secret: str = Field(default="change-me-in-production-please-32b!", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30

    cors_origins: list[str] = ["*"]

    # Almacenamiento de imágenes
    storage_backend: Literal["local", "s3"] = "local"
    local_storage_dir: str = "./data/media"
    s3_endpoint_url: str | None = None
    s3_bucket: str = "ganaderia-photos"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str = "eu-west-1"

    max_upload_mb: int = 15
    image_max_side: int = 2048
    thumb_max_side: int = 400

    # IA
    ocr_provider: Literal["tesseract", "google_vision", "none"] = "tesseract"
    tesseract_cmd: str | None = None
    google_vision_api_key: str | None = None
    ocr_timeout_seconds: int = 20

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        # Render, Heroku, Neon… entregan postgres:// o postgresql:// → forzar el driver psycopg 3.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
