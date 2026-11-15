import pytest

from app.ai.tag_parser import normalize_official_id, parse_tag_text


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("ES 0408 1234 5678", "ES040812345678"),
        ("es-040812345678", "ES040812345678"),
        ("040812345678", "ES040812345678"),
        ("724040812345678", "ES040812345678"),
        ("ES O4O8 l234 S678", "ES040812345678"),  # confusiones OCR en la parte numérica
        ("ES 0408 1234", None),
        ("FR040812345678", None),
        ("", None),
    ],
)
def test_normalize_official_id(raw: str, expected: str | None) -> None:
    assert normalize_official_id(raw) == expected


def test_parse_two_line_tag() -> None:
    text = "ES 0408 1234\n5678"
    cands = parse_tag_text(text)
    assert cands[0].value == "ES040812345678"
    assert cands[0].kind == "official"
    assert any(c.value == "5678" and c.kind == "management" for c in cands)


def test_parse_electronic_id() -> None:
    cands = parse_tag_text("FDX-B 724 040812345678")
    assert cands[0].value == "ES040812345678"
    assert cands[0].kind == "electronic"


def test_parse_missing_prefix_gives_lower_confidence() -> None:
    cands = parse_tag_text("0408 1234 5678")
    top = cands[0]
    assert top.value == "ES040812345678" and top.kind == "official_no_prefix"
    assert top.confidence < 0.9


def test_parse_only_management_number() -> None:
    cands = parse_tag_text("  5678 ")
    assert [c.value for c in cands] == ["5678"]


def test_parse_noise_returns_nothing() -> None:
    assert parse_tag_text("VACA BONITA") == []
    assert parse_tag_text("") == []


def test_database_url_driver_normalized() -> None:
    from app.core.config import Settings

    assert Settings(database_url="postgres://u:p@h:5432/d").database_url == "postgresql+psycopg://u:p@h:5432/d"
    assert Settings(database_url="postgresql://u:p@h/d").database_url.startswith("postgresql+psycopg://")
