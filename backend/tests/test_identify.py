"""Integración del pipeline de identificación: imagen → OCR (Tesseract real) → BD → confirmación."""

import shutil

import pytest
from fastapi.testclient import TestClient

from tests.tag_images import make_tag_image

API = "/api/v1"
needs_tesseract = pytest.mark.skipif(shutil.which("tesseract") is None, reason="Tesseract no instalado")


def _create(client, farm, auth, official="ES040812345678"):
    r = client.post(f"{API}/farms/{farm}/animals", json={"official_id": official, "sex": "female"}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()


def _identify(client, farm, auth, img: bytes):
    r = client.post(f"{API}/farms/{farm}/identify", files={"file": ("crotal.jpg", img, "image/jpeg")}, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


@needs_tesseract
def test_identify_registered_animal_and_confirm(client: TestClient, auth, farm) -> None:
    a = _create(client, farm, auth)
    _create(client, farm, auth, "ES040899990001")
    res = _identify(client, farm, auth, make_tag_image("ES040812345678"))
    assert res["status"] == "matched", res
    assert res["matches"][0]["animal"]["id"] == a["id"]
    assert res["matches"][0]["confidence"] > 0.5
    assert res["visual_search_available"] is False

    # Sin confirmación no se toca el animal
    detail = client.get(f"{API}/farms/{farm}/animals/{a['id']}", headers=auth).json()
    assert detail["photos"] == []

    r = client.post(
        f"{API}/farms/{farm}/identifications/{res['id']}/confirm",
        json={"animal_id": a["id"], "attach_photo": True},
        headers=auth,
    )
    assert r.status_code == 204
    detail = client.get(f"{API}/farms/{farm}/animals/{a['id']}", headers=auth).json()
    assert len(detail["photos"]) == 1 and detail["main_photo_id"] == detail["photos"][0]["id"]
    img = client.get(detail["photos"][0]["thumb_url"], headers=auth)
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    # No se puede confirmar dos veces
    r = client.post(
        f"{API}/farms/{farm}/identifications/{res['id']}/confirm", json={"animal_id": a["id"]}, headers=auth
    )
    assert r.status_code == 409


@needs_tesseract
def test_identify_unregistered_tag_then_create(client: TestClient, auth, farm) -> None:
    res = _identify(client, farm, auth, make_tag_image("ES091277773333", rotate=-3))
    assert res["status"] == "not_found", res
    assert res["candidates"][0]["value"] == "ES091277773333"
    r = client.post(
        f"{API}/farms/{farm}/animals",
        json={"official_id": res["candidates"][0]["value"], "from_identification_id": res["id"]},
        headers=auth,
    )
    assert r.status_code == 201
    assert len(r.json()["photos"]) == 1


@needs_tesseract
def test_identify_unreadable(client: TestClient, auth, farm) -> None:
    res = _identify(client, farm, auth, make_tag_image(blank=True))
    assert res["status"] == "unreadable"
    assert res["matches"] == []


def test_identify_rejects_non_image(client: TestClient, auth, farm) -> None:
    r = client.post(
        f"{API}/farms/{farm}/identify", files={"file": ("x.jpg", b"not an image", "image/jpeg")}, headers=auth
    )
    assert r.status_code == 422


def test_capabilities_are_honest(client: TestClient) -> None:
    caps = client.get(f"{API}/capabilities").json()
    assert caps["visual_recognition"]["available"] is False
    assert caps["assistant"]["available"] is False
