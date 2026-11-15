import os
import tempfile

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://ganaderia:ganaderia@localhost:5432/ganaderia_test")
os.environ["ENVIRONMENT"] = "test"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["LOCAL_STORAGE_DIR"] = tempfile.mkdtemp(prefix="ganaderia-media-")
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-0123")

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    """Aplica las migraciones reales (también prueba que funcionan) sobre una BD limpia."""
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    command.downgrade(cfg, "base")


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    with engine.begin() as c:
        c.execute(
            text(
                "TRUNCATE audit_logs, animal_identifications, animal_photos, animals, herd_groups, "
                "farm_users, farms, users RESTART IDENTITY CASCADE"
            )
        )


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def register(client: TestClient, email: str = "ana@example.com") -> dict[str, str]:
    r = client.post("/api/v1/auth/register", json={"email": email, "password": "Segura123!", "full_name": "Ana Pérez"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    return register(client)


@pytest.fixture
def farm(client: TestClient, auth: dict[str, str]) -> str:
    r = client.post("/api/v1/farms", json={"name": "Finca El Robledal", "province": "Salamanca"}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()["id"]
