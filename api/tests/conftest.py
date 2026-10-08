import os

from sqlalchemy import create_engine, make_url, text

# Tests truncate tables, so they get their own database next to the real one: nyx -> nyx_test.
_url = make_url(os.environ.get("NYX_DATABASE_URL", "postgresql+psycopg://nyx:nyx@127.0.0.1:5432/nyx"))
if not _url.database.endswith("_test"):
    _url = _url.set(database=f"{_url.database}_test")
os.environ["NYX_DATABASE_URL"] = _url.render_as_string(hide_password=False)
with create_engine(_url.set(database="postgres"), isolation_level="AUTOCOMMIT").connect() as _c:
    if not _c.scalar(text("select 1 from pg_database where datname = :n"), {"n": _url.database}):
        _c.execute(text(f'create database "{_url.database}"'))

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from alembic import command  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated():
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    with engine.begin() as c:
        c.execute(text("truncate users, sessions, scope_targets cascade"))
    monkeypatch.setattr(settings, "allow_signup", False)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin(client):
    r = client.post("/api/v1/auth/signup", json={"email": "admin@example.com", "password": "correct horse"})
    assert r.status_code == 201
    return r.json()
