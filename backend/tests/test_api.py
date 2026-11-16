import io

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from tests.conftest import register

API = "/api/v1"


def _animal(client, farm, auth, **kw):
    body = {"official_id": "ES 0408 1234 5678", "sex": "female", "breed": "Avileña", **kw}
    r = client.post(f"{API}/farms/{farm}/animals", json=body, headers=auth)
    return r


# ---------- Auth ----------
def test_register_login_refresh_me(client: TestClient) -> None:
    register(client, "juan@example.com")
    r = client.post(f"{API}/auth/login", json={"email": "JUAN@example.com", "password": "Segura123!"})
    assert r.status_code == 200
    tokens = r.json()
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.json()["email"] == "juan@example.com"
    r2 = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r2.status_code == 200
    # Un refresh token no sirve como access token
    bad = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"})
    assert bad.status_code == 401


def test_register_duplicate_and_bad_password(client: TestClient) -> None:
    register(client, "dup@example.com")
    r = client.post(
        f"{API}/auth/register", json={"email": "dup@example.com", "password": "Segura123!", "full_name": "X"}
    )
    assert r.status_code == 409
    r = client.post(f"{API}/auth/login", json={"email": "dup@example.com", "password": "mala"})
    assert r.status_code == 401


# ---------- Multiexplotación y permisos ----------
def test_farm_isolation(client: TestClient, auth, farm) -> None:
    assert _animal(client, farm, auth).status_code == 201
    other = register(client, "otro@example.com")
    assert client.get(f"{API}/farms/{farm}/animals", headers=other).status_code == 404
    assert client.get(f"{API}/farms", headers=other).json() == []


def test_viewer_cannot_write(client: TestClient, auth, farm) -> None:
    viewer = register(client, "visor@example.com")
    r = client.post(f"{API}/farms/{farm}/members", json={"email": "visor@example.com", "role": "viewer"}, headers=auth)
    assert r.status_code == 201
    assert client.get(f"{API}/farms/{farm}/animals", headers=viewer).status_code == 200
    assert _animal(client, farm, viewer).status_code == 403


# ---------- Animales ----------
def test_animal_crud_and_soft_constraints(client: TestClient, auth, farm) -> None:
    r = _animal(client, farm, auth, weight_kg=512.5)
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["official_id"] == "ES 0408 1234 5678"
    assert a["official_id_normalized"] == "ES040812345678"
    assert a["version"] == 1

    # Duplicado del oficial, aunque se escriba distinto
    assert _animal(client, farm, auth, official_id="es040812345678").status_code == 409
    # Formato inválido
    assert _animal(client, farm, auth, official_id="ES123").status_code == 422
    # Sin ningún identificador
    r = client.post(f"{API}/farms/{farm}/animals", json={"sex": "male"}, headers=auth)
    assert r.status_code == 422

    # Edición con bloqueo optimista
    r = client.patch(
        f"{API}/farms/{farm}/animals/{a['id']}", json={"name": "Lucera", "expected_version": 1}, headers=auth
    )
    assert r.status_code == 200 and r.json()["version"] == 2
    r = client.patch(
        f"{API}/farms/{farm}/animals/{a['id']}", json={"name": "Otra", "expected_version": 1}, headers=auth
    )
    assert r.status_code == 409

    # Genealogía: la madre debe ser hembra de la misma explotación
    calf = _animal(client, farm, auth, official_id="ES040812349999", sex="male", mother_id=a["id"]).json()
    detail = client.get(f"{API}/farms/{farm}/animals/{calf['id']}", headers=auth).json()
    assert detail["mother"]["id"] == a["id"]
    assert _animal(client, farm, auth, official_id="ES040812340000", mother_id=calf["id"]).status_code == 422

    # Baja
    r = client.post(
        f"{API}/farms/{farm}/animals/{a['id']}/deactivate",
        json={"status": "sold", "date": "2026-01-10", "reason": "Venta a cebadero"},
        headers=auth,
    )
    assert r.status_code == 200 and r.json()["status"] == "sold"
    lst = client.get(f"{API}/farms/{farm}/animals", params={"status": "active"}, headers=auth).json()
    assert lst["total"] == 1


def test_search_and_lookup(client: TestClient, auth, farm) -> None:
    _animal(client, farm, auth)
    _animal(client, farm, auth, official_id="ES040899990245", internal_id="v-245", name="Paloma")
    assert client.get(f"{API}/farms/{farm}/animals", params={"q": "paloma"}, headers=auth).json()["total"] == 1
    assert client.get(f"{API}/farms/{farm}/animals", params={"q": "ES 0408"}, headers=auth).json()["total"] == 2

    r = client.get(f"{API}/farms/{farm}/animals/lookup", params={"code": "5678"}, headers=auth).json()
    assert r["status"] == "matched" and r["matches"][0]["matched_by"] == "management_suffix"
    r = client.get(f"{API}/farms/{farm}/animals/lookup", params={"code": "V245"}, headers=auth).json()
    assert r["matches"][0]["animal"]["name"] == "Paloma"
    r = client.get(f"{API}/farms/{farm}/animals/lookup", params={"code": "ES040812345678"}, headers=auth).json()
    assert r["matches"][0]["matched_by"] == "official_exact"
    # Un dígito mal leído → coincidencia aproximada con menor confianza
    r = client.get(f"{API}/farms/{farm}/animals/lookup", params={"code": "ES040812345670"}, headers=auth).json()
    assert r["matches"][0]["matched_by"] == "official_fuzzy"


def test_groups_and_dashboard(client: TestClient, auth, farm) -> None:
    g = client.post(f"{API}/farms/{farm}/groups", json={"name": "Nodrizas"}, headers=auth).json()
    _animal(client, farm, auth, herd_group_id=g["id"])
    groups = client.get(f"{API}/farms/{farm}/groups", headers=auth).json()
    assert groups[0]["animal_count"] == 1
    d = client.get(f"{API}/farms/{farm}/dashboard", headers=auth).json()
    assert d["total_animals"] == 1 and d["active_animals"] == 1
    assert len(d["census"]) == 12 and d["census"][-1]["active"] == 1
    assert any(a["code"] == "no_photo" for a in d["alerts"])
    assert d["pending_treatments"] is None  # Fase 2: no se inventa
    act = client.get(f"{API}/farms/{farm}/activity", headers=auth).json()
    assert act[0]["summary"] == "Animal: alta" and act[0]["user_name"] == "Ana Pérez"


def test_export_import_roundtrip(client: TestClient, auth, farm) -> None:
    client.post(f"{API}/farms/{farm}/groups", json={"name": "Recría"}, headers=auth)
    _animal(client, farm, auth, weight_kg=300)
    x = client.get(f"{API}/farms/{farm}/animals/export", params={"format": "xlsx"}, headers=auth)
    assert x.status_code == 200
    ws = load_workbook(io.BytesIO(x.content)).active
    assert ws.cell(2, 1).value == "ES 0408 1234 5678"

    csv_data = (
        "identificador_oficial;identificador_interno;sexo;fecha_nacimiento;peso_kg;lote\n"
        "ES 0408 1111 2222;;hembra;2024-03-01;410,5;Recría\n"
        "ES 0408 1234 5678;;macho;;;\n"  # duplicado
        "ES 12;;macho;;;\n"  # inválido
        ";T-9;h;2025-01-01;;Inexistente\n"  # lote inexistente
    ).encode()
    files = {"file": ("animales.csv", csv_data, "text/csv")}
    dry = client.post(f"{API}/farms/{farm}/animals/import", files=files, headers=auth).json()
    assert dry["dry_run"] and dry["created"] == 1 and len(dry["errors"]) == 3
    real = client.post(
        f"{API}/farms/{farm}/animals/import", params={"dry_run": "false"}, files=files, headers=auth
    ).json()
    assert real["created"] == 1
    assert client.get(f"{API}/farms/{farm}/animals", headers=auth).json()["total"] == 2


def test_sync_endpoint(client: TestClient, auth, farm) -> None:
    first = client.get(f"{API}/farms/{farm}/animals/sync", headers=auth).json()
    assert first["items"] == []
    a = _animal(client, farm, auth).json()
    delta = client.get(f"{API}/farms/{farm}/animals/sync", params={"since": first["server_time"]}, headers=auth).json()
    assert [i["id"] for i in delta["items"]] == [a["id"]]
    client.delete(f"{API}/farms/{farm}/animals/{a['id']}", headers=auth)
    delta2 = client.get(f"{API}/farms/{farm}/animals/sync", params={"since": delta["server_time"]}, headers=auth).json()
    assert delta2["items"][0]["deleted_at"] is not None


def test_web_app_served(client: TestClient) -> None:
    from app.main import WEB_DIR

    if not (WEB_DIR / "index.html").is_file():
        return
    r = client.get("/")
    assert r.status_code == 200 and "<html" in r.text.lower()
    assert client.get("/animals").headers["content-type"].startswith("text/html")  # ruta del cliente
    assert client.get("/api/v1/no-existe").status_code == 404
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/docs").status_code == 200
    assert client.get("/../app/main.py").status_code in (200, 404)
    assert "fastapi" not in client.get("/..%2Fapp%2Fmain.py").text
