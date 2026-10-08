import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.db import engine
from app.main import app
from app.models import User
from app.security import COOKIE, require_role

PW = "correct horse"


def test_first_signup_becomes_admin_and_is_signed_in(client, admin):
    assert admin["role"] == "admin"
    assert admin["email"] == "admin@example.com"
    assert client.get("/api/v1/me").json()["id"] == admin["id"]


def test_signup_is_closed_after_first_user(client, admin):
    r = TestClient(app).post("/api/v1/auth/signup", json={"email": "b@example.com", "password": PW})
    assert r.status_code == 403


def test_open_signup_creates_analyst(client, admin, monkeypatch):
    monkeypatch.setattr(settings, "allow_signup", True)
    r = TestClient(app).post("/api/v1/auth/signup", json={"email": "b@example.com", "password": PW})
    assert r.status_code == 201
    assert r.json()["role"] == "analyst"


def test_duplicate_email_is_409_regardless_of_case(client, admin, monkeypatch):
    monkeypatch.setattr(settings, "allow_signup", True)
    r = TestClient(app).post("/api/v1/auth/signup", json={"email": "ADMIN@example.com", "password": PW})
    assert r.status_code == 409


def test_signup_rejects_short_password(client):
    assert client.post("/api/v1/auth/signup", json={"email": "a@example.com", "password": "short"}).status_code == 422


def test_signup_rejects_huge_password(client):
    r = client.post("/api/v1/auth/signup", json={"email": "a@example.com", "password": "x" * 257})
    assert r.status_code == 422


def test_login_sets_cookie(admin):
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": PW})
    assert r.status_code == 200
    assert COOKIE in r.cookies
    assert c.get("/api/v1/me").status_code == 200


def test_login_ignores_email_case(admin):
    r = TestClient(app).post("/api/v1/auth/login", json={"email": "Admin@Example.COM", "password": PW})
    assert r.status_code == 200


@pytest.mark.parametrize("email,pw", [("admin@example.com", "wrong password"), ("nobody@example.com", PW)])
def test_login_failure_is_one_generic_401(admin, email, pw):
    r = TestClient(app).post("/api/v1/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 401
    assert r.json() == {"detail": "Wrong email or password."}


def test_me_without_cookie_is_401():
    assert TestClient(app).get("/api/v1/me").status_code == 401


def test_garbage_cookie_is_401():
    c = TestClient(app, cookies={COOKIE: "not-a-real-token"})
    assert c.get("/api/v1/me").status_code == 401


def test_logout_invalidates_the_session(client, admin):
    token = client.cookies[COOKIE]
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert TestClient(app, cookies={COOKIE: token}).get("/api/v1/me").status_code == 401


def test_logout_without_cookie_is_204():
    assert TestClient(app).post("/api/v1/auth/logout").status_code == 204


def test_expired_session_is_rejected_and_deleted(client, admin):
    with engine.begin() as c:
        c.execute(text("update sessions set expires_at = now() - interval '1 hour'"))
    assert client.get("/api/v1/me").status_code == 401
    with engine.connect() as c:
        assert c.execute(text("select count(*) from sessions")).scalar() == 0


def test_require_role_blocks_other_roles():
    viewer = User(email="v@example.com", password_hash="x", role="viewer")
    with pytest.raises(HTTPException) as e:
        require_role("admin")(viewer)
    assert e.value.status_code == 403
    assert require_role("admin", "viewer")(viewer) is viewer
