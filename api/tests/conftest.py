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

TABLES = (
    "users, sessions, scope_targets, plugins, plugin_versions, plugin_installations, "
    "scans, scan_targets, plugin_runs, plugin_events"
)


@pytest.fixture(scope="session", autouse=True)
def migrated():
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    with engine.begin() as c:
        c.execute(text(f"truncate {TABLES} cascade"))
    monkeypatch.setattr(settings, "allow_signup", False)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin(client):
    r = client.post("/api/v1/auth/signup", json={"email": "admin@example.com", "password": "correct horse"})
    assert r.status_code == 201
    return r.json()


class StubRunner:
    """Stands in for nyx-runner: digests per image, and canned output lines per run."""

    def __init__(self, digests=None, lines=None, error=None):
        self.digests = digests or {}
        self.lines = lines or []
        self.error = error
        self.calls = []
        self.cancelled = []

    def digest(self, image):
        return self.digests.get(image)

    def cancel(self, run_id):
        self.cancelled.append(run_id)

    def run(self, body):
        self.calls.append(body)
        if self.error:
            raise self.error
        yield from (line(body) if callable(line) else line for line in self.lines)


@pytest.fixture
def runner(monkeypatch):
    from app.runner import get_runner

    stub = StubRunner()
    app.dependency_overrides[get_runner] = lambda: stub
    monkeypatch.setattr("app.runner.get_runner", lambda: stub)
    yield stub
    app.dependency_overrides.pop(get_runner, None)


def drive_scan(scan_id: str) -> None:
    """What ScanWorkflow does, inline and in order: plan, run every batch, repeat, finalize. No pause/cancel."""
    import uuid

    from app import runner as runner_mod
    from app import scans
    from app.db import SessionLocal
    from app.runner import RunnerError
    from app.runs import execute_run

    sid, done = uuid.UUID(scan_id), set()
    with SessionLocal() as db:
        scans.set_status(db, sid, "RUNNING")
    while True:
        with SessionLocal() as db:
            ids = [i for i in scans.plan(db, sid) if i not in done]
        if not ids:
            break
        for i in ids:
            done.add(i)
            try:
                execute_run(uuid.UUID(i), runner_mod.get_runner())
            except RunnerError as e:  # the real workflow retries 5 times first
                with SessionLocal() as db:
                    scans.mark_failed(db, uuid.UUID(i), str(e))
    with SessionLocal() as db:
        scans.finalize(db, sid, False)


class FakeTemporal:
    """Stands in for the Temporal client. drive=True runs a started scan inline (see drive_scan)."""

    def __init__(self):
        self.drive, self.down = True, False
        self.started, self.signals, self.cancelled = [], [], []

    async def start_workflow(self, workflow, scan_id, *, id, task_queue):
        if self.down:
            raise RuntimeError("temporal is down")
        assert (workflow, id, task_queue) == ("ScanWorkflow", f"scan-{scan_id}", "nyx-scans")
        self.started.append(scan_id)
        if self.drive:
            drive_scan(scan_id)

    def get_workflow_handle(self, workflow_id):
        fake = self

        class Handle:
            async def signal(self, name):
                fake.signals.append((workflow_id, name))

            async def cancel(self):
                fake.cancelled.append(workflow_id)

        return Handle()


@pytest.fixture(autouse=True)
def temporal():
    from app.temporal import get_temporal

    fake = FakeTemporal()
    app.dependency_overrides[get_temporal] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_temporal, None)
