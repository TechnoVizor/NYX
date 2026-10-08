from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.scope import find_entry, normalize_entry, refusal

PW = "correct horse"


@dataclass
class E:
    kind: str
    value: str
    active_allowed: bool = False


ENTRIES = [E("domain", "example.com", active_allowed=True), E("cidr", "10.0.0.0/24")]


@pytest.mark.parametrize(
    "ttype,value,expected",
    [
        ("domain", "example.com", "example.com"),
        ("domain", "a.example.com", "example.com"),
        ("domain", "x.y.z.example.com", "example.com"),
        ("domain", "EXAMPLE.COM.", "example.com"),
        ("domain", "evil-example.com", None),
        ("domain", "example.com.evil.net", None),
        ("domain", "example.org", None),
        ("url", "https://a.example.com:8443/login?x=1", "example.com"),
        ("url", "example.com/path", "example.com"),
        ("url", "https://evil.net/?next=example.com", None),
        ("ip", "10.0.0.7", "10.0.0.0/24"),
        ("ip", "10.0.1.7", None),
        ("domain", "10.0.0.7", "10.0.0.0/24"),
        ("cidr", "10.0.0.0/28", "10.0.0.0/24"),
        ("cidr", "10.0.0.0/23", None),
    ],
)
def test_scope_matching(ttype, value, expected):
    hit = find_entry(ttype, value, ENTRIES)
    assert (hit.value if hit else None) == expected


@pytest.mark.parametrize(
    "ttype,value", [("domain", "not a domain!"), ("ip", "999.1.1.1"), ("url", "https://"), ("email", "a@b.c")]
)
def test_unparseable_targets_match_nothing(ttype, value):
    assert find_entry(ttype, value, ENTRIES) is None


@pytest.mark.parametrize(
    "risk,entry,refused",
    [
        ("passive", E("domain", "example.com"), False),
        ("safe_active", E("domain", "example.com"), True),
        ("safe_active", E("domain", "example.com", True), False),
        ("active", E("domain", "example.com", True), False),
        ("active", E("domain", "example.com"), True),
        ("intrusive", E("domain", "example.com", True), True),
        ("passive", None, True),
    ],
)
def test_risk_gate(risk, entry, refused):
    assert (refusal(risk, "a.example.com", entry) is not None) == refused


@pytest.mark.parametrize(
    "kind,value,ok",
    [
        ("domain", "Example.COM.", "example.com"),
        ("domain", "*.example.com", None),
        ("domain", "localhost", None),
        ("domain", "exa mple.com", None),
        ("cidr", "10.0.0.5/24", "10.0.0.0/24"),
        ("cidr", "10.0.0.0/8", None),
        ("cidr", "192.168.1.1", "192.168.1.1/32"),
        ("cidr", "nope", None),
    ],
)
def test_normalize_entry(kind, value, ok):
    if ok is None:
        with pytest.raises(ValueError):
            normalize_entry(kind, value)
    else:
        assert normalize_entry(kind, value) == ok


def body(**over):
    return {"kind": "domain", "value": "example.com", "active_allowed": False, "authorization": "My own domain", **over}


def test_admin_manages_scope(client, admin):
    r = client.post("/api/v1/scope", json=body(value="Example.com."))
    assert r.status_code == 201
    assert r.json()["value"] == "example.com"
    assert client.post("/api/v1/scope", json=body()).status_code == 409
    assert [e["value"] for e in client.get("/api/v1/scope").json()] == ["example.com"]
    assert client.delete(f"/api/v1/scope/{r.json()['id']}").status_code == 204
    assert client.get("/api/v1/scope").json() == []


def test_scope_needs_authorization_note(client, admin):
    assert client.post("/api/v1/scope", json=body(authorization="  ")).status_code == 422


def test_scope_rejects_wide_cidr_with_message(client, admin):
    r = client.post("/api/v1/scope", json=body(kind="cidr", value="10.0.0.0/8"))
    assert r.status_code == 422
    assert "/16" in r.text


def test_analyst_reads_but_cannot_write_scope(client, admin, monkeypatch):
    monkeypatch.setattr(settings, "allow_signup", True)
    analyst = TestClient(app)
    assert analyst.post("/api/v1/auth/signup", json={"email": "an@example.com", "password": PW}).status_code == 201
    assert analyst.get("/api/v1/scope").status_code == 200
    assert analyst.post("/api/v1/scope", json=body()).status_code == 403


def test_scope_requires_sign_in():
    assert TestClient(app).get("/api/v1/scope").status_code == 401
