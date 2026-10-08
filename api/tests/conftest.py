import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from alembic import command
from app.config import settings
from app.db import engine
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def migrated():
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    with engine.begin() as c:
        c.execute(text("truncate users, sessions cascade"))
    monkeypatch.setattr(settings, "allow_signup", False)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin(client):
    r = client.post("/api/v1/auth/signup", json={"email": "admin@example.com", "password": "correct horse"})
    assert r.status_code == 201
    return r.json()
