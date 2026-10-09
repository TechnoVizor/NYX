# NYX Phase 3a Implementation Plan — durable scans

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scans that chain plugins over everything they find, routed by manifests, executed durably on Temporal with retries, pause/resume and cancel; single plugin runs become one-plugin scans.

**Architecture:** The API creates `scans` rows and starts a `ScanWorkflow` on Temporal. A new `worker` service (same image as the API) runs the workflow and its activities. The workflow is deterministic and only juggles ids. Activities do all I/O: `plan` turns new in-scope targets into PENDING batches of ≤500 targets per plugin; `run_batch` streams a batch through the existing runner and turns found assets into new targets; `finalize` sets the outcome. The runner gains a cancel endpoint. Plugins accept target lists.

**Tech Stack:**
- Python 3.12, FastAPI, SQLAlchemy 2, Alembic, `temporalio` 1.34 (Python SDK), pytest.
- Temporal CLI dev server `temporalio/temporal:1.9.1` (Server 1.32) with SQLite.
- Next.js 16 with TanStack Query.

**Spec:** `docs/specs/2026-10-09-nyx-phase3a-scans-design.md`

## Global Constraints

- Task queue `nyx-scans`, namespace `default`, workflow id `scan-{scan_id}`, workflow type `ScanWorkflow`.
- Activity names (strings, used by the workflow and the tests): `set_status`, `plan`, `run_batch`, `finalize`, `mark_failed`.
- Scan statuses `CREATED | RUNNING | PAUSED | COMPLETED | PARTIAL | FAILED | CANCELLED`; final = `COMPLETED | PARTIAL | FAILED | CANCELLED`.
- Run statuses `PENDING | RUNNING | SUCCEEDED | FAILED | TIMED_OUT | CANCELLED`.
- Batch size 500 targets. At most 4 batches in flight per scan; worker `max_concurrent_activities = 4`.
- `run_batch` options: `start_to_close_timeout = 2 h`, `heartbeat_timeout = 30 s`, retry initial 2 s, backoff 2.0, max interval 60 s, max attempts 5, cancellation type `WAIT_CANCELLATION_COMPLETED`. Other activities: `start_to_close_timeout = 1 min`, default retry.
- Scan defaults: `max_depth = 2` (allowed 1–3 for `POST /scans`; single runs use 0), `max_targets = 5000`.
- `ASSET_TARGET = {"subdomain": "domain", "domain": "domain", "ip": "ip", "http_service": "url"}`.
- A plugin is never routed a target that the same plugin produced.
- Messages, verbatim: `"Scan engine unavailable."`, `"The scan has finished."`, `"Stopped at {max_targets} targets."`, `"{value} is not in scope."`, `"Cancelled."`, `"Cancelled before it started."`, `"No plugin run succeeded."`, `"No selected plugin accepts this target."`, `"Runner unreachable."`.
- Temporal volume mounts at `/home/temporal` (image runs as uid 1000); DB file `/home/temporal/temporal.db`.
- Tests never touch the `nyx` database (`api/tests/conftest.py` forces `*_test`).
- Every commit ends with the session's attribution lines if the harness provides them.

## Review Focus

1. **A scan whose root no selected plugin accepts** (e.g. an `ip` root with only domain plugins): it must end FAILED with `No selected plugin accepts this target.`, not hang in RUNNING. Pinned in Task 5 (`test_finalize_without_runs`).
2. **Two batches of one scan harvesting the same subdomain at once:** the second insert must not crash the activity. Pinned in Task 4 by `ON CONFLICT DO NOTHING` and `test_harvest_skips_known_targets`.
3. **A runner that is down for the whole scan:** every run ends FAILED `Runner unreachable.` (after retries) and the scan FAILED; nothing stays RUNNING or PENDING. Pinned in Task 7 (`test_runner_unreachable_fails_the_run`) and Task 6 (`test_failed_batch_is_marked`).
4. **Cancel while paused:** the workflow is waiting on resume, not on an activity; cancel must still finalize CANCELLED. Pinned in Task 6 (`test_cancel_while_paused`).
5. **Starting a scan when Temporal is down:** no scan left in CREATED forever; it is marked FAILED and the API answers 503. Pinned in Task 7 (`test_engine_down_fails_the_scan`).

---

## File map

```
api/
  pyproject.toml                    + temporalio                                    Task 6
  alembic/versions/0005_scans.py    scans, scan_targets, plugin_runs changes        Task 1
  app/models.py                     + Scan, ScanTarget; PluginRun.targets/scan_id/attempt   Task 1
  app/config.py                     + temporal_address                              Task 6
  app/runner.py                     + RunnerClient.cancel                           Task 3
  app/registry.py                   + installed_plugins()                           Task 5
  app/runs.py                       execute_run: targets, retry cleanup, cancel, harvest; − fail_interrupted_runs   Tasks 1, 4, 7
  app/scans.py                      ASSET_TARGET, harvest, plan, finalize, set_status, mark_failed, create_scan, fail_start   Tasks 4, 5
  app/activities.py                 Temporal activities (thin wrappers)             Task 6
  app/workflows.py                  ScanWorkflow                                    Task 6
  app/worker.py                     python -m app.worker                            Task 6
  app/temporal.py                   client connect, get_temporal, start/signal/cancel   Task 7
  app/routes/scans.py               /api/v1/scans                                   Task 7
  app/routes/plugins.py             start_run → one-plugin scan                      Tasks 1, 7
  app/routes/runs.py                RunOut + scan_id, targets, attempt              Task 1
  app/main.py                       lifespan: sync + temporal client; scans router  Task 7
  tests/conftest.py                 tables, StubRunner.cancel, FakeTemporal, drive_scan   Tasks 1, 3, 7
  tests/test_migrations.py          0005 up/down                                    Task 1
  tests/test_scans.py               harvest, plan, finalize, run_batch activity     Tasks 4, 5, 6
  tests/test_workflow.py            ScanWorkflow on the time-skipping server        Task 6
  tests/test_scan_routes.py         /api/v1/scans                                   Task 7
  tests/test_runs.py                adapted to scans                                Task 7
  tests/test_adapters.py            multi-target cases                              Task 2
plugins/sdk/nyx_plugin.py           TARGETS                                          Task 2
plugins/projectdiscovery.{subfinder,dnsx,httpx}/adapter.py   target lists           Task 2
runner/app/main.py                  DELETE /v1/runs/{run_id}                         Task 3
runner/tests/test_runs.py           cancel tests                                     Task 3
docker-compose.yml compose.dev.yml  temporal, worker                                 Task 8
.github/workflows/ci.yml            (unchanged jobs; worker image built by `images`) Task 8
README.md                           how scans run, roadmap note                      Task 8
web/src/lib/{types.ts,api/client.ts,api/hooks.ts}   scans API                        Task 9
web/src/components/scans/*.tsx      new-scan-form, scans-table, scan-overview, scan-metrics   Task 9
web/src/components/plugins/run-panel.tsx           export EventList               Task 9
web/src/app/app/scans/**            pages wired to components                        Task 9
```

Commands below run from the repo root unless a `cd` is shown. API tests need Postgres: `docker compose -f docker-compose.yml -f compose.dev.yml up -d postgres runner`.

---

### Task 1: Schema — scans, scan targets, run target lists

**Files:**
- Create: `api/alembic/versions/0005_scans.py`
- Modify: `api/app/models.py`, `api/app/runs.py` (body), `api/app/routes/runs.py`, `api/app/routes/plugins.py:131` (one line), `api/tests/conftest.py` (TABLES)
- Test: `api/tests/test_migrations.py`

**Interfaces:**
- Produces: models `Scan`, `ScanTarget`; constants `SCAN_STATUSES`, `SCAN_FINAL` in `app.models`; `PluginRun.targets: list[dict]`, `PluginRun.scan_id: UUID | None`, `PluginRun.attempt: int`; `RUN_STATUSES` gains `"CANCELLED"`. `RunOut` gains `scan_id`, `targets`, `attempt` and keeps `target` (= `targets[0]`).

- [ ] **Step 1: Write the failing migration test**

Append to `api/tests/test_migrations.py`:

```python
from sqlalchemy import text

from app.db import engine


def test_0005_moves_target_into_targets_and_back():
    cfg = Config("alembic.ini")
    command.downgrade(cfg, "0004")
    try:
        with engine.begin() as c:
            c.execute(text("insert into plugins (id, name, publisher, description, categories, risk_level, trust_level) "
                           "values ('m.p', 'P', 'NYX', '', '{}', 'passive', 'custom')"))
            vid = c.scalar(text("insert into plugin_versions (id, plugin_id, version, image, manifest) "
                                "values (gen_random_uuid(), 'm.p', '1', 'i', '{}') returning id"))
            c.execute(text("insert into plugin_runs (id, plugin_version_id, target, status, event_count) values "
                           "(gen_random_uuid(), :v, '{\"type\": \"domain\", \"value\": \"a.example.com\"}', 'RUNNING', 0)"),
                      {"v": vid})
        command.upgrade(cfg, "0005")
        with engine.begin() as c:
            targets, status, attempt = c.execute(text("select targets, status, attempt from plugin_runs")).one()
        assert targets == [{"type": "domain", "value": "a.example.com"}]
        assert (status, attempt) == ("FAILED", 0)
        command.downgrade(cfg, "0004")
        with engine.begin() as c:
            assert c.scalar(text("select target from plugin_runs")) == {"type": "domain", "value": "a.example.com"}
    finally:
        command.upgrade(cfg, "head")
```

In `api/tests/conftest.py` change `TABLES` to:

```python
TABLES = (
    "users, sessions, scope_targets, plugins, plugin_versions, plugin_installations, "
    "scans, scan_targets, plugin_runs, plugin_events"
)
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd api && uv run pytest tests/test_migrations.py -q`
Expected: FAIL — `Can't locate revision identified by '0005'` (and conftest truncate fails on `scans`).

- [ ] **Step 3: Models**

In `api/app/models.py` replace `RUN_STATUSES` and the `PluginRun` class, and add the scan models after `PluginEvent`:

```python
RUN_STATUSES = ("PENDING", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED")


class PluginRun(Base):
    __tablename__ = "plugin_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plugin_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plugin_versions.id", ondelete="CASCADE"), index=True
    )
    scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), index=True)
    targets: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(12), default="PENDING")
    attempt: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    requested_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exit_code: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    event_count: Mapped[int] = mapped_column(Integer, default=0)
```

```python
SCAN_STATUSES = ("CREATED", "RUNNING", "PAUSED", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED")
SCAN_FINAL = ("COMPLETED", "PARTIAL", "FAILED", "CANCELLED")


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    root_target: Mapped[dict] = mapped_column(JSONB)
    plugin_ids: Mapped[list[str]] = mapped_column(ARRAY(String))
    max_depth: Mapped[int] = mapped_column(Integer, default=2, server_default="2")
    max_targets: Mapped[int] = mapped_column(Integer, default=5000, server_default="5000")
    status: Mapped[str] = mapped_column(String(12), default="CREATED")
    error: Mapped[str | None] = mapped_column(Text)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ScanTarget(Base):
    """Everything a scan considered: followed (in_scope) or not (refusal says why)."""

    __tablename__ = "scan_targets"

    scan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), primary_key=True)
    type: Mapped[str] = mapped_column(String(8), primary_key=True)
    value: Mapped[str] = mapped_column(String(2000), primary_key=True)
    depth: Mapped[int] = mapped_column(Integer)
    source_run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("plugin_runs.id", ondelete="SET NULL"))
    in_scope: Mapped[bool] = mapped_column(Boolean)
    refusal: Mapped[str | None] = mapped_column(Text)
    routed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Migration**

Create `api/alembic/versions/0005_scans.py`:

```python
"""scans, scan targets, run target lists

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scans",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("root_target", postgresql.JSONB(), nullable=False),
        sa.Column("plugin_ids", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("max_depth", sa.Integer(), server_default="2", nullable=False),
        sa.Column("max_targets", sa.Integer(), server_default="5000", nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("requested_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "plugin_runs", sa.Column("scan_id", sa.Uuid(), sa.ForeignKey("scans.id", ondelete="CASCADE"), nullable=True)
    )
    op.create_index("ix_plugin_runs_scan_id", "plugin_runs", ["scan_id"])
    op.add_column("plugin_runs", sa.Column("targets", postgresql.JSONB(), nullable=True))
    op.execute("update plugin_runs set targets = jsonb_build_array(target)")
    op.alter_column("plugin_runs", "targets", nullable=False)
    op.drop_column("plugin_runs", "target")
    op.add_column("plugin_runs", sa.Column("attempt", sa.Integer(), server_default="0", nullable=False))
    # Phase 2 runs had no durable executor; whatever was in flight at upgrade time is gone.
    op.execute(
        "update plugin_runs set status = 'FAILED', error = 'Interrupted by restart.', finished_at = now() "
        "where status in ('PENDING', 'RUNNING')"
    )
    op.create_table(
        "scan_targets",
        sa.Column("scan_id", sa.Uuid(), sa.ForeignKey("scans.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("type", sa.String(8), primary_key=True),
        sa.Column("value", sa.String(2000), primary_key=True),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column(
            "source_run_id", sa.Uuid(), sa.ForeignKey("plugin_runs.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("in_scope", sa.Boolean(), nullable=False),
        sa.Column("refusal", sa.Text(), nullable=True),
        sa.Column("routed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("scan_targets")
    op.drop_column("plugin_runs", "attempt")
    op.add_column("plugin_runs", sa.Column("target", postgresql.JSONB(), nullable=True))
    op.execute("update plugin_runs set target = targets -> 0")
    op.alter_column("plugin_runs", "target", nullable=False)
    op.drop_column("plugin_runs", "targets")
    op.drop_index("ix_plugin_runs_scan_id", table_name="plugin_runs")
    op.drop_column("plugin_runs", "scan_id")
    op.drop_table("scans")
```

- [ ] **Step 5: Keep Phase 2 code compiling against `targets`**

`api/app/routes/plugins.py` in `start_run`, replace the `PluginRun(...)` line with:

```python
    run = PluginRun(
        plugin_version_id=v.id, targets=[target], status="PENDING", attempt=0, requested_by=user.id, event_count=0
    )
```

`api/app/runs.py` in `execute_run`, replace the `"target": run.target,` line of `body["input"]` with:

```python
                "targets": run.targets,
                "target": run.targets[0],  # single-target adapters read this one
```

`api/app/routes/runs.py`: add fields to `RunOut` and `run_out`:

```python
class RunOut(BaseModel):
    id: uuid.UUID
    scan_id: uuid.UUID | None
    plugin_id: str
    plugin_version: str
    target: dict
    targets: list[dict]
    status: str
    error: str | None
    exit_code: int | None
    event_count: int
    attempt: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


def run_out(run: PluginRun, version: PluginVersion) -> dict:
    return {
        "id": run.id,
        "scan_id": run.scan_id,
        "plugin_id": version.plugin_id,
        "plugin_version": version.version,
        "target": run.targets[0],
        "targets": run.targets,
        "status": run.status,
        "error": run.error,
        "exit_code": run.exit_code,
        "event_count": run.event_count,
        "attempt": run.attempt,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
    }
```

Pass `attempt=0` in that `PluginRun(...)` too: `run_out` reads it right after commit, before any refresh.

- [ ] **Step 6: Run the whole API suite**

Run: `cd api && uv run alembic upgrade head && uv run alembic check && uv run pytest -q`
Expected: all pass; `alembic check` prints `No new upgrade operations detected.`

- [ ] **Step 7: Commit**

```bash
git add api/alembic/versions/0005_scans.py api/app/models.py api/app/runs.py api/app/routes/runs.py api/app/routes/plugins.py api/tests/conftest.py api/tests/test_migrations.py
git commit -m "feat(api): scans and scan targets; runs carry a target list"
```

---

### Task 2: Plugins take target lists

**Files:**
- Modify: `plugins/sdk/nyx_plugin.py`, `plugins/projectdiscovery.subfinder/adapter.py`, `plugins/projectdiscovery.dnsx/adapter.py`, `plugins/projectdiscovery.httpx/adapter.py`, `plugins/_template/adapter.py`
- Test: `api/tests/test_adapters.py`

**Interfaces:**
- Produces: `nyx_plugin.TARGETS: list[dict]` — `INPUT["targets"]`, or `[INPUT["target"]]` when only a single target is sent. Events from list adapters carry the host they report on as `target`.

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_adapters.py`:

```python
def run_adapter(plugin, targets):
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "sdk"),
        "NYX_FIXTURE": str(ROOT / plugin / "fixtures" / "output.jsonl"),
        "NYX_INPUT": json.dumps(
            {
                "run_id": "r1",
                "plugin_id": plugin,
                "plugin_version": "x",
                "targets": targets,
                "target": targets[0],
                "config": {},
                "rate_limit": 10,
            }
        ),
    }
    out = subprocess.run(
        [sys.executable, str(ROOT / plugin / "adapter.py")], env=env, capture_output=True, text=True, check=True
    )
    return [json.loads(line) for line in out.stdout.splitlines()]


# The first target has no record in the fixture: events must name the host they are about, not targets[0].
@pytest.mark.parametrize(
    "plugin,targets,host",
    [
        (
            "projectdiscovery.dnsx",
            [{"type": "domain", "value": "other.example.com"}, {"type": "domain", "value": "example.com"}],
            "example.com",
        ),
        (
            "projectdiscovery.httpx",
            [{"type": "domain", "value": "x.nyx-lab.test"}, {"type": "domain", "value": "testbed.nyx-lab.test"}],
            "testbed.nyx-lab.test",
        ),
    ],
)
def test_list_adapters_name_the_host_per_event(plugin, targets, host):
    events = run_adapter(plugin, targets)
    assets = [e for e in events if e["type"] == "asset"]
    assert assets
    assert all(validate_event(e) == [] for e in events)
    assert {e["target"]["value"] for e in assets} == {host}


def test_subfinder_runs_every_domain_in_the_batch():
    events = run_adapter(
        "projectdiscovery.subfinder",
        [{"type": "domain", "value": "example.com"}, {"type": "domain", "value": "example.org"}],
    )
    relations = [e for e in events if e["type"] == "relation"]
    assert {e["data"]["to"] for e in relations} >= {"example.com"}
    assert all(validate_event(e) == [] for e in events)
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api && uv run pytest tests/test_adapters.py -q`
Expected: the dnsx/httpx cases FAIL (`target` is `other.example.com` / `x.nyx-lab.test`).

- [ ] **Step 3: SDK**

In `plugins/sdk/nyx_plugin.py`, after the `INPUT` line:

```python
# A batch arrives in "targets"; "target" (the first one) stays so single-target adapters keep working.
TARGETS: list[dict] = INPUT.get("targets") or ([INPUT["target"]] if "target" in INPUT else [])
```

- [ ] **Step 4: Adapters**

`plugins/projectdiscovery.dnsx/adapter.py`:

```python
"""dnsx -> NYX events: each resolved address becomes an ip asset and a resolves_to relation."""

from nyx_plugin import INPUT, TARGETS, emit, progress, run_tool

hosts = [t["value"] for t in TARGETS]
progress(0)
cmd = ["dnsx", "-a", "-aaaa", "-resp", "-json", "-silent", "-duc", "-rl", str(INPUT.get("rate_limit", 50))]
for rec in run_tool(cmd, stdin="\n".join(hosts) + "\n"):
    host = rec.get("host") or hosts[0]
    target = {"type": "domain", "value": host}
    for ip in [*rec.get("a", []), *rec.get("aaaa", [])]:
        emit("asset", {"kind": "ip", "value": ip}, target=target)
        emit("relation", {"from": host, "to": ip, "kind": "resolves_to"}, target=target)
progress(100)
```

`plugins/projectdiscovery.httpx/adapter.py`:

```python
"""httpx -> NYX events: every live HTTP endpoint becomes an http_service asset."""

from nyx_plugin import INPUT, TARGETS, emit, progress, run_tool

kinds = {t["value"]: t["type"] for t in TARGETS}
progress(0)
cmd = ["httpx", "-json", "-silent", "-duc", "-sc", "-title", "-td", "-server", "-rl", str(INPUT.get("rate_limit", 10))]
for rec in run_tool(cmd, stdin="\n".join(kinds) + "\n"):
    url = rec.get("url")
    if not url:
        continue
    source = rec.get("input") or url
    emit(
        "asset",
        {
            "kind": "http_service",
            "value": url,
            "status_code": rec.get("status_code"),
            "title": rec.get("title"),
            "webserver": rec.get("webserver"),
            "tech": rec.get("tech", []),
            "ip": rec.get("host_ip"),
        },
        target={"type": kinds.get(source, "url"), "value": source},
    )
progress(100)
```

`plugins/projectdiscovery.subfinder/adapter.py`:

```python
"""Subfinder -> NYX events: every subdomain becomes an asset and a subdomain_of relation."""

from nyx_plugin import INPUT, TARGETS, emit, progress, run_tool

rate = str(INPUT.get("rate_limit", 20))
progress(0)
seen = set()
for target in TARGETS:
    domain = target["value"]
    for rec in run_tool(["subfinder", "-d", domain, "-oJ", "-silent", "-duc", "-rl", rate]):
        host = rec.get("host", "").lower()
        if not host or host in seen:
            continue
        seen.add(host)
        emit("asset", {"kind": "subdomain", "value": host, "source": rec.get("source")}, target=target)
        emit("relation", {"from": host, "to": domain, "kind": "subdomain_of"}, target=target)
progress(100)
```

`plugins/_template/adapter.py`:

```python
"""Template adapter: run the tool for each target in the batch, turn each JSON record into NYX events."""

from nyx_plugin import TARGETS, emit, progress, run_tool

progress(0)
for target in TARGETS:
    for record in run_tool(["your-tool", "-d", target["value"], "-json"]):
        emit("asset", {"kind": "subdomain", "value": record["host"]}, target=target)
progress(100)
```

- [ ] **Step 5: Run the adapter tests**

Run: `cd api && uv run pytest tests/test_adapters.py -q`
Expected: all pass, including the original single-target cases.

- [ ] **Step 6: Rebuild the plugin images so the runner sees the new adapters**

Run: `docker compose --profile plugins build`
Expected: three images built.

- [ ] **Step 7: Commit**

```bash
git add plugins api/tests/test_adapters.py
git commit -m "feat(plugins): adapters take target lists; events name the host they report on"
```

---

### Task 3: Runner cancel

**Files:**
- Modify: `runner/app/main.py`, `api/app/runner.py`, `api/tests/conftest.py` (StubRunner)
- Test: `runner/tests/test_runs.py`

**Interfaces:**
- Produces: runner `DELETE /v1/runs/{run_id}` → 204 (killed) / 404 (no container with label `nyx.run_id=<run_id>`) / 401. `RunnerClient.cancel(run_id: str) -> None` (best effort, never raises). `StubRunner.cancel(run_id)` appends to `StubRunner.cancelled: list[str]`.

- [ ] **Step 1: Write the failing runner tests**

Append to `runner/tests/test_runs.py`:

```python
def test_cancel_needs_token():
    assert TestClient(app).delete("/v1/runs/r1").status_code == 401


@needs_docker
def test_cancel_unknown_run_is_404():
    assert TestClient(app).delete("/v1/runs/no-such-run", headers=H).status_code == 404


@needs_docker
def test_cancel_kills_a_running_container(echo_image, monkeypatch):
    import threading
    import time

    monkeypatch.setattr("app.main.EXTRA_ENV", {"SLEEP": "60"})
    c = TestClient(app)
    result = {}
    t = threading.Thread(target=lambda: result.update(out=run(c, echo_image, timeout=30)))
    t.start()
    for _ in range(100):
        if client_docker.containers.list(filters={"label": "nyx.run_id=r1"}):
            break
        time.sleep(0.1)
    assert c.delete("/v1/runs/r1", headers=H).status_code == 204
    t.join(20)
    code, lines = result["out"]
    assert lines[-1]["runner"]["exit_code"] != 0
    assert lines[-1]["runner"]["timed_out"] is False
    assert not client_docker.containers.list(all=True, filters={"label": "nyx.run_id=r1"})
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd runner && uv run pytest -q`
Expected: the three new tests FAIL with 405 Method Not Allowed.

- [ ] **Step 3: Implement the endpoint**

In `runner/app/main.py`, after `start`:

```python
@app.delete("/v1/runs/{run_id}", status_code=204, dependencies=[Auth])
def cancel(run_id: str):
    """Kill the run's container. The streaming request for it then ends with its trailer, as on any exit."""
    containers = engine().containers.list(all=True, filters={"label": f"nyx.run_id={run_id}"})
    if not containers:
        raise HTTPException(404, "No such run.")
    for c in containers:
        try:
            c.kill()
        except (NotFound, APIError):
            pass  # already exited; stream() removes it
```

- [ ] **Step 4: Run the runner tests**

Run: `cd runner && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass.

- [ ] **Step 5: API client and stub**

In `api/app/runner.py`, add to `RunnerClient`:

```python
    def cancel(self, run_id: str) -> None:
        """Kill the run's container if it is still there. Best effort: callers move on either way."""
        try:
            httpx.delete(f"{self.url}/v1/runs/{run_id}", headers=self.headers, timeout=10)
        except httpx.HTTPError:
            pass
```

In `api/tests/conftest.py`, `StubRunner.__init__` gains `self.cancelled = []`, and add:

```python
    def cancel(self, run_id):
        self.cancelled.append(run_id)
```

- [ ] **Step 6: Run the API suite**

Run: `cd api && uv run pytest -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add runner/app/main.py runner/tests/test_runs.py api/app/runner.py api/tests/conftest.py
git commit -m "feat(runner): cancel a run by killing its container"
```

---

### Task 4: Batch execution — retries, cancel, harvest

**Files:**
- Create: `api/app/scans.py`
- Modify: `api/app/runs.py`
- Test: `api/tests/test_scans.py`

**Interfaces:**
- Consumes: `RunnerClient.cancel` (Task 3), models (Task 1).
- Produces:
  - `app.runs.execute_run(run_id: uuid.UUID, runner: RunnerClient, cancelled: Callable[[], bool] = lambda: False) -> None` — raises `RunnerError` after putting the run back to PENDING; sets CANCELLED when `cancelled()` is true at the end; harvests targets when the run belongs to a scan.
  - `app.scans.ASSET_TARGET: dict[str, str]`
  - `app.scans.harvest(db: Session, run: PluginRun) -> int` — new targets inserted.

- [ ] **Step 1: Write the failing tests**

Create `api/tests/test_scans.py`:

```python
import json
import shutil
import uuid
from pathlib import Path

import pytest
import yaml
from sqlalchemy import select

from app.db import SessionLocal
from app.models import PluginEvent, PluginRun, PluginVersion, Scan, ScanTarget
from app.registry import sync_plugins
from app.runner import RunnerError
from app.runs import execute_run

REPO = Path(__file__).resolve().parents[2] / "plugins"


def make_plugins(tmp_path, runner, specs):
    """specs: {plugin_id: (risk_level, accepts)} -> synced plugins with digests."""
    root = tmp_path / "plugins"
    shutil.copytree(REPO / "schemas", root / "schemas")
    base = yaml.safe_load((REPO / "_template" / "plugin.yaml").read_text())
    for pid, (risk, accepts) in specs.items():
        m = json.loads(json.dumps(base))
        m["metadata"].update({"id": pid, "name": pid})
        m["runtime"]["image"] = f"nyx-plugin/{pid}:0.1.0"
        m["classification"]["risk_level"] = risk
        m["io"]["accepts"] = accepts
        (root / pid).mkdir()
        (root / pid / "plugin.yaml").write_text(yaml.safe_dump(m))
        runner.digests[f"nyx-plugin/{pid}:0.1.0"] = f"sha256:{pid}"
    with SessionLocal() as db:
        sync_plugins(db, runner, root)


def add_scope(client, value="example.com", active=False, kind="domain"):
    r = client.post("/api/v1/scope", json={"kind": kind, "value": value, "active_allowed": active, "authorization": "t"})
    assert r.status_code == 201, r.text


def new_scan(plugin_ids, root=("domain", "example.com"), max_depth=2, max_targets=5000):
    with SessionLocal() as db:
        scan = Scan(
            root_target={"type": root[0], "value": root[1]},
            plugin_ids=plugin_ids,
            max_depth=max_depth,
            max_targets=max_targets,
            status="RUNNING",
        )
        db.add(scan)
        db.flush()
        db.add(ScanTarget(scan_id=scan.id, type=root[0], value=root[1], depth=0, in_scope=True))
        db.commit()
        return scan.id


def add_run(scan_id, plugin_id, targets, status="PENDING", attempt=0):
    with SessionLocal() as db:
        v = db.scalar(select(PluginVersion).where(PluginVersion.plugin_id == plugin_id))
        run = PluginRun(
            plugin_version_id=v.id, scan_id=scan_id, targets=targets, status=status, attempt=attempt, event_count=0
        )
        db.add(run)
        db.commit()
        return run.id


def asset(kind, value):
    def line(body):
        i = body["input"]
        return json.dumps(
            {
                "event_version": "1",
                "type": "asset",
                "plugin_run_id": i["run_id"],
                "plugin_id": i["plugin_id"],
                "plugin_version": i["plugin_version"],
                "timestamp": "2026-10-09T12:00:00Z",
                "target": i["target"],
                "data": {"kind": kind, "value": value},
            }
        )

    return line


def trailer(code=0):
    return json.dumps({"runner": {"exit_code": code, "timed_out": False, "stderr_tail": "boom" if code else ""}})


def targets_of(scan_id):
    with SessionLocal() as db:
        rows = db.scalars(select(ScanTarget).where(ScanTarget.scan_id == scan_id)).all()
        return {(t.type, t.value): t for t in rows}


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(tmp_path, runner, {"t.sub": ("passive", ["domain"]), "t.http": ("safe_active", ["domain", "url"])})
    add_scope(client, "example.com", active=True)
    return runner


def test_assets_become_targets_one_level_deeper(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [asset("subdomain", "a.example.com"), asset("subdomain", "x.other.net"), asset("ip", "10.0.0.1"),
                   asset("technology", "nginx"), trailer(0)]
    execute_run(run, world)
    t = targets_of(scan)
    assert (t[("domain", "a.example.com")].depth, t[("domain", "a.example.com")].in_scope) == (1, True)
    assert t[("domain", "a.example.com")].source_run_id == run
    assert (t[("domain", "x.other.net")].in_scope, t[("domain", "x.other.net")].refusal) == (
        False,
        "x.other.net is not in scope.",
    )
    assert t[("ip", "10.0.0.1")].in_scope is False
    assert ("domain", "nginx") not in t and len(t) == 4  # root + 3; unmapped kinds are ignored


def test_harvest_skips_known_targets(world):
    scan = new_scan(["t.sub"])
    for _ in range(2):
        run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
        world.lines = [asset("subdomain", "a.example.com"), asset("subdomain", "A.Example.com."), trailer(0)]
        execute_run(run, world)
    assert len(targets_of(scan)) == 2


def test_target_cap_stops_harvest(world):
    scan = new_scan(["t.sub"], max_targets=3)
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [asset("subdomain", f"h{i}.example.com") for i in range(5)] + [trailer(0)]
    execute_run(run, world)
    assert len(targets_of(scan)) == 3
    with SessionLocal() as db:
        assert db.get(Scan, scan).error == "Stopped at 3 targets."


def test_runner_error_puts_the_run_back_and_raises(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.error = RunnerError("Runner unreachable.")
    with pytest.raises(RunnerError):
        execute_run(run, world)
    with SessionLocal() as db:
        r = db.get(PluginRun, run)
        assert (r.status, r.error, r.attempt) == ("PENDING", "Runner unreachable.", 1)


def test_retry_drops_the_previous_attempts_events(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [asset("subdomain", "a.example.com"), asset("subdomain", "b.example.com")]  # no trailer: cut off
    execute_run(run, world)
    with SessionLocal() as db:
        db.get(PluginRun, run).status = "PENDING"  # as if the worker died mid-stream
        db.commit()
    world.lines = [asset("subdomain", "a.example.com"), trailer(0)]
    execute_run(run, world)
    with SessionLocal() as db:
        r = db.get(PluginRun, run)
        events = db.scalars(select(PluginEvent).where(PluginEvent.run_id == run)).all()
        assert (r.status, r.attempt, len(events)) == ("SUCCEEDED", 2, 1)
    assert world.cancelled == [str(run)]  # the dead attempt's container is killed first


def test_cancelled_run_keeps_what_it_found(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [asset("subdomain", "a.example.com"), trailer(137)]
    execute_run(run, world, cancelled=lambda: True)
    with SessionLocal() as db:
        r = db.get(PluginRun, run)
        assert (r.status, r.error, r.event_count) == ("CANCELLED", "Cancelled.", 1)
    assert ("domain", "a.example.com") in targets_of(scan)


def test_plugin_failure_is_a_result_not_an_exception(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [trailer(2)]
    execute_run(run, world)
    with SessionLocal() as db:
        assert db.get(PluginRun, run).status == "FAILED"


def test_batch_input_carries_all_targets(world):
    scan = new_scan(["t.sub"])
    ts = [{"type": "domain", "value": "a.example.com"}, {"type": "domain", "value": "b.example.com"}]
    run = add_run(scan, "t.sub", ts)
    world.lines = [trailer(0)]
    execute_run(run, world)
    assert world.calls[0]["input"]["targets"] == ts
    assert world.calls[0]["input"]["target"] == ts[0]
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api && uv run pytest tests/test_scans.py -q`
Expected: FAIL — `execute_run() got an unexpected keyword argument 'cancelled'` and missing targets.

- [ ] **Step 3: `app/scans.py` with harvest**

Create `api/app/scans.py`:

```python
"""Scans: which targets get which plugins, what a finished batch adds, and how a scan ends.

Plain functions over a Session. The Temporal activities (app/activities.py) are thin wrappers around them.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import PluginEvent, PluginRun, Scan, ScanTarget, ScopeTarget
from app.scope import find_entry, normalized_target

# Asset kinds that are themselves something to scan, and the target type they become. Data types, not tools.
ASSET_TARGET = {"subdomain": "domain", "domain": "domain", "ip": "ip", "http_service": "url"}
MAX_VALUE = 2000  # scan_targets.value


def _now():
    return datetime.now(UTC)


def harvest(db: Session, run: PluginRun) -> int:
    """Turn a finished batch's valid asset events into the scan's next targets. Returns how many were new."""
    scan = db.get(Scan, run.scan_id)
    known = {
        (t, v): d
        for t, v, d in db.execute(
            select(ScanTarget.type, ScanTarget.value, ScanTarget.depth).where(ScanTarget.scan_id == scan.id)
        )
    }
    depth = 1 + max((known.get((t["type"], t["value"]), 0) for t in run.targets), default=0)
    entries = db.scalars(select(ScopeTarget)).all()
    room = scan.max_targets - len(known)
    new: dict[tuple[str, str], dict] = {}
    payloads = db.scalars(
        select(PluginEvent.payload).where(
            PluginEvent.run_id == run.id, PluginEvent.type == "asset", PluginEvent.valid.is_(True)
        )
    )
    for payload in payloads:
        data = payload.get("data") or {}
        kind = ASSET_TARGET.get(data.get("kind"))
        if kind is None:
            continue
        try:
            t = normalized_target(kind, str(data.get("value", "")))
        except ValueError:
            continue
        key = (t["type"], t["value"])
        if key in known or key in new or len(key[1]) > MAX_VALUE:
            continue
        if len(new) >= room:
            scan.error = f"Stopped at {scan.max_targets} targets."
            break
        entry = find_entry(key[0], key[1], entries)
        new[key] = {
            "scan_id": scan.id,
            "type": key[0],
            "value": key[1],
            "depth": depth,
            "source_run_id": run.id,
            "in_scope": entry is not None,
            "refusal": None if entry else f"{key[1]} is not in scope.",
        }
    if new:
        # Two batches of one scan can find the same host at the same moment: the second insert just skips it.
        db.execute(insert(ScanTarget).values(list(new.values())).on_conflict_do_nothing())
    db.commit()
    return len(new)
```

- [ ] **Step 4: `execute_run` — retry cleanup, re-raise infrastructure errors, cancel, harvest**

In `api/app/runs.py`:

1. Change imports and the signature:

```python
from collections.abc import Callable
...
from sqlalchemy import delete, update
...
def execute_run(run_id: uuid.UUID, runner: RunnerClient, cancelled: Callable[[], bool] = lambda: False) -> None:
```

2. Replace the first block of the function (from `run = db.get(...)` to the first `db.commit()`) with:

```python
        run = db.get(PluginRun, run_id)
        version = db.get(PluginVersion, run.plugin_version_id)
        m = version.manifest
        if run.attempt > 0:
            # A previous attempt died mid-stream: its events are partial and its container may still be running.
            db.execute(delete(PluginEvent).where(PluginEvent.run_id == run.id))
            runner.cancel(str(run.id))
        run.attempt += 1
        run.status, run.started_at, run.error, run.exit_code = "RUNNING", _now(), None, None
        db.commit()
```

3. Replace `except RunnerError as e: run.status, run.error = "FAILED", str(e)` with:

```python
        except RunnerError as e:
            retry = e  # infrastructure, not the plugin: the caller (Temporal) retries the whole batch
```

and initialise `retry = None` right before `lines = runner.run(body)`. Because `runner.run` is a generator, the `RunnerError` for an unreachable runner surfaces inside the `for` loop, so it is caught by this `except`.

4. Replace the tail of the function (from `run.event_count = db.query(...)` to the end) with:

```python
        run.event_count = db.query(PluginEvent).filter(PluginEvent.run_id == run.id).count()
        if retry is not None:
            run.status, run.error, run.started_at = "PENDING", str(retry), None
            db.commit()
            raise retry
        if cancelled():
            run.status, run.error = "CANCELLED", "Cancelled."
        run.finished_at = _now()
        db.commit()
        if run.scan_id is not None:
            harvest(db, run)
```

and add `from app.scans import harvest` to the imports (`app.scans` never imports `app.runs`, so there is no cycle).

- [ ] **Step 5: Run the tests**

Run: `cd api && uv run pytest tests/test_scans.py -q`
Expected: all pass.

Run: `cd api && uv run pytest -q`
Expected: `tests/test_runs.py::test_runner_unreachable_fails_the_run` now FAILS (the background task raises instead of failing the run). That test is rewritten in Task 7 when single runs move onto scans; everything else passes. Mark it for this task only:

```python
@pytest.mark.xfail(reason="single runs move onto scans in Task 7", strict=True)
```

- [ ] **Step 6: Commit**

```bash
git add api/app/scans.py api/app/runs.py api/tests/test_scans.py api/tests/test_runs.py
git commit -m "feat(api): batches retry cleanly, cancel, and turn found assets into scan targets"
```

---

### Task 5: Planning and finishing a scan

**Files:**
- Modify: `api/app/scans.py`, `api/app/registry.py`, `api/app/routes/plugins.py`
- Test: `api/tests/test_scans.py`

**Interfaces:**
- Consumes: `harvest`, models.
- Produces (all in `app.scans`, all commit):
  - `plan(db, scan_id: uuid.UUID) -> list[str]` — ids of all PENDING runs of the scan, oldest first.
  - `finalize(db, scan_id: uuid.UUID, cancelled: bool) -> str` — the final status.
  - `set_status(db, scan_id: uuid.UUID, status: str) -> None` — never overwrites a final status; first RUNNING sets `started_at`.
  - `mark_failed(db, run_id: uuid.UUID, message: str) -> None`.
  - `create_scan(db, root: dict, plugin_ids: list[str], max_depth: int, user_id) -> Scan` — scan + root target, flushed, not committed.
  - `fail_start(db, scan_id: uuid.UUID) -> None` — scan FAILED `Scan engine unavailable.`, its PENDING runs FAILED, committed.
  - `app.registry.installed_plugins()` — the `select(Plugin, PluginVersion, PluginInstallation)` join, used by routes and `plan`.
  - `BATCH = 500`.

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_scans.py`:

```python
from app import scans  # noqa: E402


def plan(scan_id):
    with SessionLocal() as db:
        return scans.plan(db, scan_id)


def runs_of(scan_id):
    with SessionLocal() as db:
        rows = db.execute(
            select(PluginVersion.plugin_id, PluginRun)
            .join(PluginRun, PluginRun.plugin_version_id == PluginVersion.id)
            .where(PluginRun.scan_id == scan_id)
        ).all()
        return [(pid, r) for pid, r in rows]


def test_plan_routes_by_accepts_and_gate(tmp_path, runner, client, admin):
    make_plugins(
        tmp_path,
        runner,
        {"t.dom": ("passive", ["domain"]), "t.ip": ("passive", ["ip"]), "t.act": ("safe_active", ["domain"])},
    )
    add_scope(client, "example.com", active=False)  # passive only: t.act is refused
    scan = new_scan(["t.dom", "t.ip", "t.act"])
    ids = plan(scan)
    [(pid, run)] = runs_of(scan)
    assert pid == "t.dom" and ids == [str(run.id)]
    assert run.targets == [{"type": "domain", "value": "example.com"}]
    assert targets_of(scan)[("domain", "example.com")].routed_at is not None


def test_plan_is_idempotent(world):
    scan = new_scan(["t.sub"])
    first = plan(scan)
    assert plan(scan) == first
    assert len(runs_of(scan)) == 1


def test_plan_cuts_batches_of_500(world):
    scan = new_scan(["t.sub"], max_targets=2000)
    with SessionLocal() as db:
        db.get(ScanTarget, (scan, "domain", "example.com")).routed_at = scans._now()
        for i in range(1200):
            db.add(ScanTarget(scan_id=scan, type="domain", value=f"h{i}.example.com", depth=1, in_scope=True))
        db.commit()
    plan(scan)
    sizes = sorted(len(r.targets) for pid, r in runs_of(scan) if pid == "t.sub")
    assert sizes == [200, 500, 500]


def test_plan_respects_max_depth_and_scope(world):
    scan = new_scan(["t.sub"], max_depth=1)
    with SessionLocal() as db:
        db.add(ScanTarget(scan_id=scan, type="domain", value="a.example.com", depth=1, in_scope=True))
        db.add(ScanTarget(scan_id=scan, type="domain", value="b.other.net", depth=0, in_scope=False))
        db.commit()
    plan(scan)
    assert [r.targets for _, r in runs_of(scan)] == [[{"type": "domain", "value": "example.com"}]]


def test_plugin_is_not_fed_its_own_output(world):
    scan = new_scan(["t.sub", "t.http"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}], status="SUCCEEDED")
    with SessionLocal() as db:
        db.get(ScanTarget, (scan, "domain", "example.com")).routed_at = scans._now()
        db.add(
            ScanTarget(scan_id=scan, type="domain", value="a.example.com", depth=1, in_scope=True, source_run_id=run)
        )
        db.commit()
    plan(scan)
    fed = {pid for pid, r in runs_of(scan) if r.status == "PENDING"}
    assert fed == {"t.http"}


def test_plan_skips_disabled_plugins(world, client):
    client.patch("/api/v1/plugins/t.http", json={"enabled": False})
    scan = new_scan(["t.sub", "t.http"])
    plan(scan)
    assert {pid for pid, _ in runs_of(scan)} == {"t.sub"}


@pytest.mark.parametrize(
    "statuses,cancelled,expected",
    [
        (["SUCCEEDED", "SUCCEEDED"], False, "COMPLETED"),
        (["SUCCEEDED", "FAILED"], False, "PARTIAL"),
        (["SUCCEEDED", "TIMED_OUT"], False, "PARTIAL"),
        (["FAILED", "TIMED_OUT"], False, "FAILED"),
        (["SUCCEEDED", "PENDING"], True, "CANCELLED"),
    ],
)
def test_finalize(world, statuses, cancelled, expected):
    scan = new_scan(["t.sub"])
    for s in statuses:
        add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}], status=s)
    with SessionLocal() as db:
        assert scans.finalize(db, scan, cancelled) == expected
        s = db.get(Scan, scan)
        assert s.status == expected and s.finished_at is not None
    assert all(r.status != "PENDING" for _, r in runs_of(scan))


def test_finalize_partial_when_capped(world):
    scan = new_scan(["t.sub"])
    add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}], status="SUCCEEDED")
    with SessionLocal() as db:
        db.get(Scan, scan).error = "Stopped at 5000 targets."
        db.commit()
        assert scans.finalize(db, scan, False) == "PARTIAL"


def test_finalize_without_runs(world):
    scan = new_scan(["t.sub"], root=("ip", "10.0.0.1"))
    with SessionLocal() as db:
        assert scans.finalize(db, scan, False) == "FAILED"
        assert db.get(Scan, scan).error == "No selected plugin accepts this target."


def test_set_status_never_reopens_a_finished_scan(world):
    scan = new_scan(["t.sub"])
    with SessionLocal() as db:
        scans.set_status(db, scan, "CANCELLED")
        scans.set_status(db, scan, "RUNNING")
        assert db.get(Scan, scan).status == "CANCELLED"


def test_mark_failed(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    with SessionLocal() as db:
        scans.mark_failed(db, run, "Runner unreachable.")
        r = db.get(PluginRun, run)
        assert (r.status, r.error) == ("FAILED", "Runner unreachable.") and r.finished_at
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api && uv run pytest tests/test_scans.py -q`
Expected: new tests FAIL with `AttributeError: module 'app.scans' has no attribute 'plan'`.

- [ ] **Step 3: `installed_plugins` in the registry**

In `api/app/registry.py` add (and `from sqlalchemy import select` is already imported):

```python
def installed_plugins():
    """Every plugin with its installed version and installation row."""
    return (
        select(Plugin, PluginVersion, PluginInstallation)
        .join(PluginInstallation, PluginInstallation.plugin_id == Plugin.id)
        .join(PluginVersion, PluginVersion.id == PluginInstallation.plugin_version_id)
    )
```

In `api/app/routes/plugins.py` delete `_query` and use `installed_plugins()` (import it from `app.registry`) in `installed` and `list_plugins`.

- [ ] **Step 4: plan / finalize / set_status / mark_failed / create_scan / fail_start**

Append to `api/app/scans.py` (extend the imports: `from sqlalchemy import func, select, update`, `from app.models import ... PluginVersion, SCAN_FINAL`, `from app.registry import installed_plugins`, `from app.scope import refusal`):

```python
BATCH = 500


def plan(db: Session, scan_id: uuid.UUID) -> list[str]:
    """Hand every new in-scope target to every selected plugin that takes it; return all PENDING run ids.

    Returning all PENDING runs (not only new ones) makes a retry after a lost reply harmless: the workflow
    skips the ids it already started.
    """
    scan = db.get(Scan, scan_id)
    if scan.status not in SCAN_FINAL:
        entries = db.scalars(select(ScopeTarget)).all()
        plugins = [
            (p, v)
            for p, v, i in db.execute(installed_plugins().where(Plugin.id.in_(scan.plugin_ids))).all()
            if i.enabled and v.digest
        ]
        rows = db.execute(
            select(ScanTarget, PluginVersion.plugin_id)
            .outerjoin(PluginRun, PluginRun.id == ScanTarget.source_run_id)
            .outerjoin(PluginVersion, PluginVersion.id == PluginRun.plugin_version_id)
            .where(
                ScanTarget.scan_id == scan.id,
                ScanTarget.in_scope.is_(True),
                ScanTarget.routed_at.is_(None),
                ScanTarget.depth < scan.max_depth,
            )
            .order_by(ScanTarget.created_at, ScanTarget.type, ScanTarget.value)
        ).all()
        batches: dict[uuid.UUID, list[dict]] = {}
        for target, source_plugin in rows:
            entry = find_entry(target.type, target.value, entries)
            for p, v in plugins:
                if target.type not in v.manifest["io"]["accepts"] or p.id == source_plugin:
                    continue  # never feed a plugin its own output
                if refusal(p.risk_level, target.value, entry):
                    continue
                batches.setdefault(v.id, []).append({"type": target.type, "value": target.value})
            target.routed_at = _now()
        for version_id, targets in batches.items():
            for i in range(0, len(targets), BATCH):
                db.add(
                    PluginRun(
                        plugin_version_id=version_id,
                        scan_id=scan.id,
                        targets=targets[i : i + BATCH],
                        status="PENDING",
                        attempt=0,
                        requested_by=scan.requested_by,
                        event_count=0,
                    )
                )
        db.commit()
    return [
        str(i)
        for i in db.scalars(
            select(PluginRun.id)
            .where(PluginRun.scan_id == scan_id, PluginRun.status == "PENDING")
            .order_by(PluginRun.created_at, PluginRun.id)
        )
    ]


def set_status(db: Session, scan_id: uuid.UUID, status: str) -> None:
    scan = db.get(Scan, scan_id)
    if scan.status in SCAN_FINAL:
        return
    scan.status = status
    if status == "RUNNING" and scan.started_at is None:
        scan.started_at = _now()
    db.commit()


def finalize(db: Session, scan_id: uuid.UUID, cancelled: bool) -> str:
    scan = db.get(Scan, scan_id)
    db.execute(
        update(PluginRun)
        .where(PluginRun.scan_id == scan_id, PluginRun.status == "PENDING")
        .values(status="CANCELLED", error="Cancelled before it started.", finished_at=_now())
    )
    statuses = list(db.scalars(select(PluginRun.status).where(PluginRun.scan_id == scan_id)))
    if cancelled:
        status = "CANCELLED"
    elif not statuses:
        status, scan.error = "FAILED", "No selected plugin accepts this target."
    elif "SUCCEEDED" not in statuses:
        status, scan.error = "FAILED", scan.error or "No plugin run succeeded."
    elif scan.error or set(statuses) - {"SUCCEEDED"}:
        status = "PARTIAL"
    else:
        status = "COMPLETED"
    scan.status, scan.finished_at = status, _now()
    db.commit()
    return status


def mark_failed(db: Session, run_id: uuid.UUID, message: str) -> None:
    run = db.get(PluginRun, run_id)
    run.status, run.error, run.finished_at = "FAILED", message[-4000:], _now()
    db.commit()


def create_scan(db: Session, root: dict, plugin_ids: list[str], max_depth: int, user_id) -> Scan:
    scan = Scan(root_target=root, plugin_ids=plugin_ids, max_depth=max_depth, status="CREATED", requested_by=user_id)
    db.add(scan)
    db.flush()
    db.add(ScanTarget(scan_id=scan.id, type=root["type"], value=root["value"], depth=0, in_scope=True))
    db.flush()
    return scan


def fail_start(db: Session, scan_id: uuid.UUID) -> None:
    db.execute(
        update(PluginRun)
        .where(PluginRun.scan_id == scan_id, PluginRun.status == "PENDING")
        .values(status="FAILED", error="Scan engine unavailable.", finished_at=_now())
    )
    scan = db.get(Scan, scan_id)
    scan.status, scan.error, scan.finished_at = "FAILED", "Scan engine unavailable.", _now()
    db.commit()
```

(`Plugin` must be imported from `app.models` for `Plugin.id.in_`.)

- [ ] **Step 5: Run the tests**

Run: `cd api && uv run pytest tests/test_scans.py tests/test_registry.py tests/test_runs.py -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass (the one xfail from Task 4 still xfails).

- [ ] **Step 6: Commit**

```bash
git add api/app/scans.py api/app/registry.py api/app/routes/plugins.py api/tests/test_scans.py
git commit -m "feat(api): plan batches by manifest routing; finalize scans"
```

---

### Task 6: Temporal workflow, activities and worker

**Files:**
- Create: `api/app/activities.py`, `api/app/workflows.py`, `api/app/worker.py`
- Modify: `api/pyproject.toml` (+ `uv.lock`), `api/app/config.py`
- Test: `api/tests/test_workflow.py`, `api/tests/test_scans.py` (run_batch activity)

**Interfaces:**
- Consumes: `app.scans.{plan, finalize, set_status, mark_failed}`, `app.runs.execute_run`, `app.runner.get_runner`.
- Produces: `app.workflows.ScanWorkflow` (run arg `scan_id: str`, signals `pause`, `resume`, query `state`); `app.activities.ALL` (list of the five activities); `app.worker.TASK_QUEUE = "nyx-scans"`; `settings.temporal_address` (default `127.0.0.1:7233`).

- [ ] **Step 1: Dependency and setting**

Run: `cd api && uv add 'temporalio>=1.34.0'`

In `api/app/config.py` add to `Settings`:

```python
    temporal_address: str = "127.0.0.1:7233"
```

- [ ] **Step 2: Write the failing workflow tests**

Create `api/tests/test_workflow.py`:

```python
"""ScanWorkflow against Temporal's time-skipping test server, with scripted activities under the real names."""

import asyncio
import uuid

import pytest
from temporalio import activity
from temporalio.client import WorkflowFailureError
from temporalio.exceptions import ApplicationError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from app.workflows import ScanWorkflow


class Engine:
    """A fake scan: plan() returns what is pending; finishing a run may add its children."""

    def __init__(self, roots, children=None, hold=(), fail=()):
        self.pending = list(roots)
        self.children = children or {}
        self.hold = {r: asyncio.Event() for r in hold}
        self.fail = set(fail)
        self.status, self.ran, self.failed = [], [], {}
        self.running, self.max_running, self.final = set(), 0, None

    def activities(self):
        @activity.defn(name="set_status")
        async def set_status(scan_id: str, status: str) -> None:
            self.status.append(status)

        @activity.defn(name="plan")
        async def plan(scan_id: str) -> list[str]:
            return list(self.pending)

        @activity.defn(name="run_batch")
        async def run_batch(run_id: str) -> None:
            self.ran.append(run_id)
            self.running.add(run_id)
            self.max_running = max(self.max_running, len(self.running))
            try:
                await asyncio.sleep(0.05)
                if run_id in self.hold:
                    while not self.hold[run_id].is_set():
                        activity.heartbeat()
                        await asyncio.sleep(0.05)
                if run_id in self.fail:
                    raise ApplicationError("Runner unreachable.", non_retryable=True)
            finally:
                self.running.discard(run_id)
            self.pending.remove(run_id)
            self.pending += self.children.get(run_id, [])

        @activity.defn(name="finalize")
        async def finalize(scan_id: str, cancelled: bool) -> str:
            self.final = cancelled
            return "CANCELLED" if cancelled else "COMPLETED"

        @activity.defn(name="mark_failed")
        async def mark_failed(run_id: str, message: str) -> None:
            self.failed[run_id] = message
            self.pending.remove(run_id)

        return [set_status, plan, run_batch, finalize, mark_failed]


async def until(cond, timeout=10.0):
    for _ in range(int(timeout / 0.05)):
        if cond():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("condition not reached")


def scenario(engine, body):
    async def main():
        async with await WorkflowEnvironment.start_time_skipping() as env:
            async with Worker(env.client, task_queue="t", workflows=[ScanWorkflow], activities=engine.activities()):
                handle = await env.client.start_workflow(
                    ScanWorkflow.run, "scan-1", id=f"scan-{uuid.uuid4()}", task_queue="t"
                )
                return await body(handle)

    return asyncio.run(main())


def test_runs_children_until_nothing_is_pending():
    e = Engine(["a"], {"a": ["b", "c"], "b": ["d"]})
    assert scenario(e, lambda h: h.result()) == "COMPLETED"
    assert sorted(e.ran) == ["a", "b", "c", "d"]  # each once
    assert e.status[0] == "RUNNING" and e.final is False


def test_at_most_four_in_flight():
    e = Engine([f"r{i}" for i in range(10)])
    scenario(e, lambda h: h.result())
    assert e.max_running == 4 and len(e.ran) == 10


def test_pause_blocks_new_batches_until_resume():
    e = Engine(["a"], {"a": ["b"]}, hold=["a"])

    async def body(h):
        await until(lambda: "a" in e.running)
        await h.signal(ScanWorkflow.pause)
        await until(lambda: "PAUSED" in e.status)
        e.hold["a"].set()
        await asyncio.sleep(0.5)
        assert "b" not in e.ran
        await h.signal(ScanWorkflow.resume)
        return await h.result()

    assert scenario(e, body) == "COMPLETED"
    assert e.ran == ["a", "b"]


def test_cancel_finalizes_cancelled():
    e = Engine(["a", "b"], hold=["a", "b"])

    async def body(h):
        await until(lambda: e.running == {"a", "b"})
        await h.cancel()
        with pytest.raises(WorkflowFailureError):
            await h.result()

    scenario(e, body)
    assert e.final is True and not e.running


def test_cancel_while_paused():
    e = Engine(["a"], {"a": ["b"]})

    async def body(h):
        await h.signal(ScanWorkflow.pause)
        await until(lambda: "PAUSED" in e.status)
        await h.cancel()
        with pytest.raises(WorkflowFailureError):
            await h.result()

    scenario(e, body)
    assert e.final is True


def test_failed_batch_is_marked():
    e = Engine(["a"], fail=["a"])
    assert scenario(e, lambda h: h.result()) == "COMPLETED"  # the fake finalize; real one decides FAILED
    assert e.failed == {"a": "Runner unreachable."}
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd api && uv run pytest tests/test_workflow.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.workflows'`. (The first run downloads Temporal's test server; allow a minute.)

- [ ] **Step 4: The workflow**

Create `api/app/workflows.py`:

```python
"""ScanWorkflow: decides what runs when. Deterministic: it holds ids only, every side effect is an activity
(app/activities.py), referenced by name so this module imports nothing from the app."""

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, CancelledError
from temporalio.workflow import ActivityCancellationType

MAX_IN_FLIGHT = 4  # the runner's slots
SHORT = {"start_to_close_timeout": timedelta(minutes=1)}
BATCH = {
    # The runner enforces each plugin's own time limit; this only bounds a batch that lost its runner.
    "start_to_close_timeout": timedelta(hours=2),
    "heartbeat_timeout": timedelta(seconds=30),
    "retry_policy": RetryPolicy(
        initial_interval=timedelta(seconds=2),
        backoff_coefficient=2.0,
        maximum_interval=timedelta(seconds=60),
        maximum_attempts=5,
    ),
    "cancellation_type": ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
}


@workflow.defn
class ScanWorkflow:
    def __init__(self) -> None:
        self.paused = False
        self.started: set[str] = set()
        self.tasks: dict[str, asyncio.Task] = {}

    @workflow.signal
    def pause(self) -> None:
        self.paused = True

    @workflow.signal
    def resume(self) -> None:
        self.paused = False

    @workflow.query
    def state(self) -> dict:
        return {"paused": self.paused, "in_flight": sorted(self.tasks), "started": len(self.started)}

    @workflow.run
    async def run(self, scan_id: str) -> str:
        try:
            await self._call("set_status", scan_id, "RUNNING")
            while True:
                for run_id in [r for r, t in self.tasks.items() if t.done()]:
                    self.tasks.pop(run_id).result()
                if self.paused:
                    await self._call("set_status", scan_id, "PAUSED")
                    await workflow.wait_condition(lambda: not self.paused)
                    await self._call("set_status", scan_id, "RUNNING")
                for run_id in await self._call("plan", scan_id):
                    if run_id not in self.started and len(self.tasks) < MAX_IN_FLIGHT:
                        self.started.add(run_id)
                        self.tasks[run_id] = asyncio.create_task(self._batch(run_id))
                if not self.tasks:
                    return await self._call("finalize", scan_id, False)
                await workflow.wait_condition(lambda: self.paused or any(t.done() for t in self.tasks.values()))
        except asyncio.CancelledError:
            for t in self.tasks.values():
                t.cancel()
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)
            await self._call("finalize", scan_id, True)
            raise

    async def _batch(self, run_id: str) -> None:
        try:
            await workflow.execute_activity("run_batch", run_id, **BATCH)
        except ActivityError as e:
            if isinstance(e.cause, CancelledError):
                raise
            # Retries exhausted (runner down) or a non-retryable error: the run must not stay PENDING.
            await self._call("mark_failed", run_id, getattr(e.cause, "message", None) or str(e))

    async def _call(self, name: str, *args):
        return await workflow.execute_activity(name, args=list(args), **SHORT)
```

- [ ] **Step 5: Run the workflow tests**

Run: `cd api && uv run pytest tests/test_workflow.py -q`
Expected: all pass. If `test_cancel_*` fails because `finalize` is not allowed after cancellation, wrap the cleanup in `asyncio.shield(...)`: `await asyncio.shield(asyncio.ensure_future(self._call("finalize", scan_id, True)))`.

- [ ] **Step 6: Write the failing activity test (cancel → container killed)**

Append to `api/tests/test_scans.py`:

```python
def test_run_batch_activity_cancel_kills_the_container(world, monkeypatch):
    import threading
    import time

    from temporalio.exceptions import CancelledError
    from temporalio.testing import ActivityEnvironment

    from app import activities

    monkeypatch.setattr(activities, "get_runner", lambda: world)
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])

    def lines(body):
        for _ in range(200):  # the "container" runs until the runner kills it
            if world.cancelled:
                break
            time.sleep(0.05)
        return trailer(137)

    world.lines = [asset("subdomain", "a.example.com"), lines]
    env = ActivityEnvironment()
    outcome = {}

    def go():
        try:
            env.run(activities.run_batch, str(run))
        except BaseException as e:  # noqa: BLE001
            outcome["error"] = e

    t = threading.Thread(target=go)
    t.start()
    time.sleep(1.5)
    env.cancel()
    t.join(15)
    assert isinstance(outcome.get("error"), CancelledError)
    assert world.cancelled == [str(run)]
    with SessionLocal() as db:
        assert db.get(PluginRun, run).status == "CANCELLED"
```

- [ ] **Step 7: Activities**

Create `api/app/activities.py`:

```python
"""Temporal activities: every bit of I/O a scan does. Synchronous, run in the worker's thread pool."""

import contextvars
import threading
import uuid

from temporalio import activity
from temporalio.exceptions import CancelledError

from app import scans
from app.db import SessionLocal
from app.runner import get_runner
from app.runs import execute_run


@activity.defn(name="set_status")
def set_status(scan_id: str, status: str) -> None:
    with SessionLocal() as db:
        scans.set_status(db, uuid.UUID(scan_id), status)


@activity.defn(name="plan")
def plan(scan_id: str) -> list[str]:
    with SessionLocal() as db:
        return scans.plan(db, uuid.UUID(scan_id))


@activity.defn(name="finalize")
def finalize(scan_id: str, cancelled: bool) -> str:
    with SessionLocal() as db:
        return scans.finalize(db, uuid.UUID(scan_id), cancelled)


@activity.defn(name="mark_failed")
def mark_failed(run_id: str, message: str) -> None:
    with SessionLocal() as db:
        scans.mark_failed(db, uuid.UUID(run_id), message)


# no_thread_cancel_exception: the SDK would otherwise raise CancelledError into this thread at any point,
# including halfway through a database write. Cancellation is handled by the heartbeat thread instead.
@activity.defn(name="run_batch", no_thread_cancel_exception=True)
def run_batch(run_id: str) -> None:
    runner = get_runner()
    done = threading.Event()

    def beat():
        # Heartbeats keep flowing while the plugin is silent; a cancel request arrives through them.
        while not done.wait(1):
            activity.heartbeat()
            if activity.is_cancelled():
                runner.cancel(run_id)  # the container dies, the stream ends, execute_run finishes normally
                return

    threading.Thread(target=contextvars.copy_context().run, args=(beat,), daemon=True).start()
    try:
        execute_run(uuid.UUID(run_id), runner, cancelled=activity.is_cancelled)
    finally:
        done.set()
    if activity.is_cancelled():
        raise CancelledError("Cancelled.")


ALL = [set_status, plan, run_batch, finalize, mark_failed]
```

- [ ] **Step 8: Worker**

Create `api/app/worker.py`:

```python
"""python -m app.worker — the only process that executes scans."""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from temporalio.client import Client
from temporalio.worker import Worker

from app.activities import ALL
from app.config import settings
from app.workflows import ScanWorkflow

TASK_QUEUE = "nyx-scans"


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    client = await Client.connect(settings.temporal_address)
    with ThreadPoolExecutor(max_workers=8) as pool:
        worker = Worker(
            client,
            task_queue=TASK_QUEUE,
            workflows=[ScanWorkflow],
            activities=ALL,
            activity_executor=pool,
            # = the runner's slots: extra batches wait in Temporal instead of bouncing off the runner's 429.
            max_concurrent_activities=4,
        )
        await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 9: Run the tests**

Run: `cd api && uv run pytest tests/test_workflow.py tests/test_scans.py -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass.

Run: `cd api && uv run python -c "import app.worker"`
Expected: no output (imports cleanly; the workflow sandbox validates `app.workflows` when the worker starts in Task 8).

- [ ] **Step 10: Commit**

```bash
git add api/pyproject.toml api/uv.lock api/app/config.py api/app/activities.py api/app/workflows.py api/app/worker.py api/tests/test_workflow.py api/tests/test_scans.py
git commit -m "feat(api): ScanWorkflow on Temporal with retrying, cancellable batch activities"
```

---

### Task 7: Scans API; single runs become one-plugin scans

**Files:**
- Create: `api/app/temporal.py`, `api/app/routes/scans.py`, `api/tests/test_scan_routes.py`
- Modify: `api/app/main.py`, `api/app/routes/plugins.py`, `api/app/runs.py` (delete `fail_interrupted_runs`), `api/tests/conftest.py`, `api/tests/test_runs.py`

**Interfaces:**
- Consumes: `app.scans.{create_scan, fail_start, plan, finalize, set_status, mark_failed}`, `app.registry.installed_plugins`, `app.worker.TASK_QUEUE`.
- Produces:
  - `app.temporal.get_temporal(request) -> Client` (503 `Scan engine unavailable.` when not connected), `start_scan(client, scan_id)`, `signal_scan(client, scan_id, name)`, `cancel_scan(client, scan_id)` — sync helpers for sync routes.
  - Routes in spec §6. Response models `ScanOut`, `ScanDetailOut`, `ScanTargetOut`.
  - Test fixtures: `temporal` (autouse `FakeTemporal`), `drive_scan(scan_id: str)`.

- [ ] **Step 1: Test fixtures**

In `api/tests/conftest.py`:

1. In the `runner` fixture, also patch the module function the worker code calls:

```python
@pytest.fixture
def runner(monkeypatch):
    from app.runner import get_runner

    stub = StubRunner()
    app.dependency_overrides[get_runner] = lambda: stub
    monkeypatch.setattr("app.runner.get_runner", lambda: stub)
    yield stub
    app.dependency_overrides.pop(get_runner, None)
```

2. Add:

```python
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
```

- [ ] **Step 2: Write the failing route tests**

Create `api/tests/test_scan_routes.py`:

```python
import json

import pytest

from app.db import SessionLocal
from app.models import Scan, User
from tests.test_scans import add_scope, asset, make_plugins, trailer


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(
        tmp_path,
        runner,
        {
            "t.sub": ("passive", ["domain"]),
            "t.http": ("safe_active", ["domain", "url"]),
            "t.boom": ("intrusive", ["domain"]),
        },
    )
    add_scope(client, "example.com", active=True)
    return runner


def start(client, value="example.com", **body):
    return client.post("/api/v1/scans", json={"target": {"type": "domain", "value": value}, **body})


def test_scan_chains_what_it_finds(client, world):
    def by_plugin(body):
        if body["input"]["plugin_id"] == "t.sub":
            return asset("subdomain", "a.example.com")(body)
        return json.dumps({"skip": True})  # t.http prints nothing useful

    world.lines = [by_plugin, trailer(0)]
    r = start(client, plugin_ids=["t.sub", "t.http"])
    assert r.status_code == 202
    scan = client.get(f"/api/v1/scans/{r.json()['id']}").json()
    assert scan["status"] == "COMPLETED"  # t.http's junk line is stored invalid; the run itself still succeeds
    runs = client.get(f"/api/v1/scans/{scan['id']}/runs").json()
    fed = sorted((r["plugin_id"], [t["value"] for t in r["targets"]]) for r in runs)
    assert fed == [("t.http", ["a.example.com"]), ("t.http", ["example.com"]), ("t.sub", ["example.com"])]
    targets = client.get(f"/api/v1/scans/{scan['id']}/targets").json()
    assert {(t["value"], t["depth"]) for t in targets} == {("example.com", 0), ("a.example.com", 1)}
```

```python
def test_default_plugins_skip_intrusive_and_disabled(client, world, temporal):
    temporal.drive = False
    client.patch("/api/v1/plugins/t.http", json={"enabled": False})
    scan = start(client).json()
    assert sorted(scan["plugin_ids"]) == ["t.sub"]


def test_root_out_of_scope_is_403(client, world, temporal):
    r = start(client, "example.org")
    assert (r.status_code, r.json()["detail"]) == (403, "example.org is not in scope.")
    assert temporal.started == []


@pytest.mark.parametrize(
    "ids,msg", [(["nope"], "Unknown plugin nope."), ([], "Select at least one plugin.")]
)
def test_bad_plugin_selection_is_422(client, world, ids, msg):
    r = start(client, plugin_ids=ids)
    assert (r.status_code, r.json()["detail"]) == (422, msg)


def test_depth_bounds(client, world):
    assert start(client, max_depth=0).status_code == 422
    assert start(client, max_depth=4).status_code == 422


def test_pause_resume_cancel_signal_the_workflow(client, world, temporal):
    temporal.drive = False
    sid = start(client).json()["id"]
    for action in ("pause", "resume"):
        assert client.post(f"/api/v1/scans/{sid}/{action}").status_code == 202
    assert client.post(f"/api/v1/scans/{sid}/cancel").status_code == 202
    assert temporal.signals == [(f"scan-{sid}", "pause"), (f"scan-{sid}", "resume")]
    assert temporal.cancelled == [f"scan-{sid}"]


def test_finished_scan_cannot_be_paused(client, world):
    world.lines = [trailer(0)]
    sid = start(client, plugin_ids=["t.sub"]).json()["id"]
    for action in ("pause", "resume", "cancel"):
        r = client.post(f"/api/v1/scans/{sid}/{action}")
        assert (r.status_code, r.json()["detail"]) == (409, "The scan has finished.")


def test_engine_down_fails_the_scan(client, world, temporal):
    temporal.down = True
    r = start(client)
    assert (r.status_code, r.json()["detail"]) == (503, "Scan engine unavailable.")
    with SessionLocal() as db:
        [scan] = db.query(Scan).all()
        assert (scan.status, scan.error) == ("FAILED", "Scan engine unavailable.")


def test_no_engine_connection_is_503(client, world):
    from app.main import app
    from app.temporal import get_temporal

    app.dependency_overrides.pop(get_temporal)
    app.state.temporal = None
    assert start(client).status_code == 503


def test_viewer_reads_but_cannot_start(client, world):
    world.lines = [trailer(0)]
    sid = start(client, plugin_ids=["t.sub"]).json()["id"]
    with SessionLocal() as db:
        db.query(User).update({"role": "viewer"})
        db.commit()
    assert start(client).status_code == 403
    assert client.post(f"/api/v1/scans/{sid}/cancel").status_code == 403
    assert client.get(f"/api/v1/scans/{sid}").status_code == 200
    assert len(client.get("/api/v1/scans").json()) == 1


def test_detail_counts(client, world):
    world.lines = [asset("subdomain", "a.example.com"), asset("subdomain", "x.other.net"), trailer(0)]
    sid = start(client, plugin_ids=["t.sub"], max_depth=1).json()["id"]
    s = client.get(f"/api/v1/scans/{sid}").json()
    assert (s["targets_in_scope"], s["targets_out_of_scope"], s["runs"], s["events"]) == (2, 1, {"SUCCEEDED": 1}, 2)
    out = client.get(f"/api/v1/scans/{sid}/targets?in_scope=false").json()
    assert [(t["value"], t["refusal"]) for t in out] == [("x.other.net", "x.other.net is not in scope.")]
```

In `api/tests/test_runs.py`:
- delete `test_interrupted_runs_fail_on_startup` and the `fail_interrupted_runs` import;
- remove the `xfail` mark added in Task 4 from `test_runner_unreachable_fails_the_run` (it passes again: `drive_scan` marks the run FAILED `Runner unreachable.`);
- add:

```python
def test_single_run_is_a_one_plugin_scan(client, runner, plugin, temporal):
    runner.lines = [event, trailer(0)]
    run = start(client, plugin).json()
    assert run["scan_id"] and temporal.started == [run["scan_id"]]
    scan = client.get(f"/api/v1/scans/{run['scan_id']}").json()
    assert (scan["plugin_ids"], scan["max_depth"], scan["status"]) == ([plugin], 0, "COMPLETED")
    assert len(client.get(f"/api/v1/scans/{run['scan_id']}/runs").json()) == 1  # found assets are not chained
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd api && uv run pytest tests/test_scan_routes.py tests/test_runs.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.temporal'`.

- [ ] **Step 4: `app/temporal.py`**

```python
"""The API's handle on the scan engine. Routes are sync (they run in a thread), the client is async: the helpers
hop onto the event loop with anyio."""

import asyncio
import functools
import logging

from anyio import from_thread
from fastapi import HTTPException, Request
from temporalio.client import Client

from app.config import settings
from app.worker import TASK_QUEUE

log = logging.getLogger("nyx.temporal")
UNAVAILABLE = "Scan engine unavailable."


async def connect() -> Client | None:
    try:
        return await asyncio.wait_for(Client.connect(settings.temporal_address), 5)
    except Exception as e:  # noqa: BLE001  the API still serves everything else
        log.warning("scan engine unreachable at %s: %s", settings.temporal_address, e)
        return None


def get_temporal(request: Request) -> Client:
    client = getattr(request.app.state, "temporal", None)
    if client is None:
        raise HTTPException(503, UNAVAILABLE)
    return client


def workflow_id(scan_id) -> str:
    return f"scan-{scan_id}"


def start_scan(client, scan_id) -> None:
    from_thread.run(
        functools.partial(
            client.start_workflow, "ScanWorkflow", str(scan_id), id=workflow_id(scan_id), task_queue=TASK_QUEUE
        )
    )


def signal_scan(client, scan_id, name: str) -> None:
    from_thread.run(client.get_workflow_handle(workflow_id(scan_id)).signal, name)


def cancel_scan(client, scan_id) -> None:
    from_thread.run(client.get_workflow_handle(workflow_id(scan_id)).cancel)
```

`app.worker` imports `app.activities` → `app.runs`; that is fine for the API process (no cycle back to routes).

- [ ] **Step 5: `app/routes/scans.py`**

```python
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app import scans
from app.models import SCAN_FINAL, Plugin, PluginEvent, PluginRun, PluginVersion, Scan, ScanTarget, ScopeTarget, User
from app.registry import installed_plugins
from app.routes.common import Target
from app.routes.runs import RunOut, run_out
from app.scope import find_entry, normalized_target
from app.security import DB, current_user, require_role
from app.temporal import UNAVAILABLE, cancel_scan, get_temporal, signal_scan, start_scan

router = APIRouter(prefix="/api/v1/scans", tags=["scans"])
Anyone = Annotated[User, Depends(current_user)]
Operator = Annotated[User, Depends(require_role("admin", "analyst"))]
Engine = Annotated[object, Depends(get_temporal)]


class ScanIn(BaseModel):
    target: Target
    plugin_ids: list[str] | None = Field(default=None, max_length=200)
    max_depth: int = Field(default=2, ge=1, le=3)


class ScanOut(BaseModel):
    id: uuid.UUID
    root_target: dict
    plugin_ids: list[str]
    max_depth: int
    max_targets: int
    status: str
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class ScanDetailOut(ScanOut):
    targets_in_scope: int
    targets_out_of_scope: int
    runs: dict[str, int]
    events: int
    container_seconds: float


class ScanTargetOut(BaseModel):
    type: str
    value: str
    depth: int
    in_scope: bool
    refusal: str | None
    source_run_id: uuid.UUID | None

    model_config = {"from_attributes": True}


def _scan(db, scan_id: uuid.UUID) -> Scan:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(404, "No such scan.")
    return scan


def launch(db, scan: Scan, engine) -> None:
    """Commit, then start the workflow; if Temporal refuses, the scan is failed rather than left CREATED."""
    db.commit()
    try:
        start_scan(engine, scan.id)
    except Exception:  # noqa: BLE001
        scans.fail_start(db, scan.id)
        raise HTTPException(503, UNAVAILABLE) from None


@router.post("", status_code=202, response_model=ScanOut)
def create(body: ScanIn, db: DB, user: Operator, engine: Engine):
    try:
        root = normalized_target(body.target.type, body.target.value)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    if find_entry(root["type"], root["value"], db.scalars(select(ScopeTarget)).all()) is None:
        raise HTTPException(403, f"{root['value']} is not in scope.")
    rows = {p.id: (p, v, i) for p, v, i in db.execute(installed_plugins()).all()}
    if body.plugin_ids is None:
        ids = sorted(pid for pid, (p, v, i) in rows.items() if i.enabled and v.digest and p.risk_level != "intrusive")
    else:
        ids = list(dict.fromkeys(body.plugin_ids))
        for pid in ids:
            if pid not in rows:
                raise HTTPException(422, f"Unknown plugin {pid}.")
            p, v, i = rows[pid]
            if not i.enabled or not v.digest:
                raise HTTPException(422, f"{p.name} can't run: it is disabled or its image is missing.")
    if not ids:
        raise HTTPException(422, "Select at least one plugin.")
    scan = scans.create_scan(db, root, ids, body.max_depth, user.id)
    launch(db, scan, engine)
    return scan


@router.get("", response_model=list[ScanOut])
def list_scans(db: DB, _: Anyone):
    return db.scalars(select(Scan).order_by(Scan.created_at.desc()).limit(50)).all()


@router.get("/{scan_id}", response_model=ScanDetailOut)
def get_scan(scan_id: uuid.UUID, db: DB, _: Anyone):
    scan = _scan(db, scan_id)
    in_scope = dict(
        db.execute(
            select(ScanTarget.in_scope, func.count()).where(ScanTarget.scan_id == scan_id).group_by(ScanTarget.in_scope)
        ).all()
    )
    runs = dict(
        db.execute(
            select(PluginRun.status, func.count()).where(PluginRun.scan_id == scan_id).group_by(PluginRun.status)
        ).all()
    )
    events, seconds = db.execute(
        select(
            func.coalesce(func.sum(PluginRun.event_count), 0),
            func.coalesce(func.sum(func.extract("epoch", PluginRun.finished_at - PluginRun.started_at)), 0),
        ).where(PluginRun.scan_id == scan_id)
    ).one()
    return {
        **ScanOut.model_validate(scan).model_dump(),
        "targets_in_scope": in_scope.get(True, 0),
        "targets_out_of_scope": in_scope.get(False, 0),
        "runs": runs,
        "events": int(events),
        "container_seconds": float(seconds),
    }


@router.get("/{scan_id}/runs", response_model=list[RunOut])
def scan_runs(scan_id: uuid.UUID, db: DB, _: Anyone):
    _scan(db, scan_id)
    rows = db.execute(
        select(PluginRun, PluginVersion)
        .join(PluginVersion, PluginVersion.id == PluginRun.plugin_version_id)
        .where(PluginRun.scan_id == scan_id)
        .order_by(PluginRun.created_at, PluginRun.id)
    ).all()
    return [run_out(r, v) for r, v in rows]


@router.get("/{scan_id}/targets", response_model=list[ScanTargetOut])
def scan_targets(
    scan_id: uuid.UUID,
    db: DB,
    _: Anyone,
    in_scope: bool | None = None,
    after: Annotated[int, Query(ge=0)] = 0,
):
    _scan(db, scan_id)
    q = select(ScanTarget).where(ScanTarget.scan_id == scan_id)
    if in_scope is not None:
        q = q.where(ScanTarget.in_scope.is_(in_scope))
    q = q.order_by(ScanTarget.created_at, ScanTarget.type, ScanTarget.value).offset(after).limit(500)
    return db.scalars(q).all()


def _control(db, scan_id: uuid.UUID) -> Scan:
    scan = _scan(db, scan_id)
    if scan.status in SCAN_FINAL:
        raise HTTPException(409, "The scan has finished.")
    return scan


@router.post("/{scan_id}/pause", status_code=202, response_model=ScanOut)
def pause(scan_id: uuid.UUID, db: DB, _: Operator, engine: Engine):
    scan = _control(db, scan_id)
    signal_scan(engine, scan_id, "pause")
    return scan


@router.post("/{scan_id}/resume", status_code=202, response_model=ScanOut)
def resume(scan_id: uuid.UUID, db: DB, _: Operator, engine: Engine):
    scan = _control(db, scan_id)
    signal_scan(engine, scan_id, "resume")
    return scan


@router.post("/{scan_id}/cancel", status_code=202, response_model=ScanOut)
def cancel(scan_id: uuid.UUID, db: DB, _: Operator, engine: Engine):
    scan = _control(db, scan_id)
    cancel_scan(engine, scan_id)
    return scan
```

(Remove unused imports — `Plugin`, `PluginEvent` — if ruff flags them.)

- [ ] **Step 6: Single runs through scans**

In `api/app/routes/plugins.py`:
- drop `BackgroundTasks`, `RunnerClient`, `get_runner` and `execute_run` from imports and from `start_run`'s parameters;
- add the parameter `engine: Annotated[object, Depends(get_temporal)]` and the imports `from app import scans`, `from app.temporal import get_temporal`, `from app.routes.scans import launch`;
- move `Target` out to a new module so `routes.scans` and `routes.plugins` do not import each other: delete it here and import it with `from app.routes.common import Target`.

`api/app/routes/common.py`:

```python
from typing import Literal

from pydantic import BaseModel, Field


class Target(BaseModel):
    type: Literal["domain", "ip", "cidr", "url"]
    value: str = Field(min_length=1, max_length=2000)
```

Then the tail of `start_run` becomes:

```python
    scan = scans.create_scan(db, target, [plugin_id], 0, user.id)
    run = PluginRun(
        plugin_version_id=v.id,
        scan_id=scan.id,
        targets=[target],
        status="PENDING",
        attempt=0,
        requested_by=user.id,
        event_count=0,
    )
    db.add(run)
    launch(db, scan, engine)
    return run_out(run, v)
```

- [ ] **Step 7: Lifespan and router**

`api/app/main.py`:

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import SessionLocal
from app.registry import sync_plugins
from app.routes import auth, health, plugins, runs, scans, scope
from app.runner import get_runner
from app.temporal import connect


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        sync_plugins(db, get_runner())
    # Scans survive restarts in Temporal; nothing to clean up here any more.
    app.state.temporal = await connect()
    yield


app = FastAPI(title="NYX API", version="0.3.0", lifespan=lifespan)
for r in (health, auth, scope, plugins, runs, scans):
    app.include_router(r.router)
```

Delete `fail_interrupted_runs` from `api/app/runs.py` (and the now-unused `update` import).

- [ ] **Step 8: Run the full suite**

Run: `cd api && uv run pytest -q && uv run ruff check . && uv run ruff format --check . && uv run alembic check`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add api
git commit -m "feat(api): scans API on Temporal; single plugin runs are one-plugin scans"
```

---

### Task 8: Compose, CI, README

**Files:**
- Modify: `docker-compose.yml`, `compose.dev.yml`, `README.md`

**Interfaces:**
- Produces: services `temporal` and `worker`; `NYX_TEMPORAL_ADDRESS=temporal:7233` for `api` and `worker`.

- [ ] **Step 1: Compose**

In `docker-compose.yml`, add at the top (after the comment block):

```yaml
x-api-env: &api-env
  NYX_DATABASE_URL: postgresql+psycopg://nyx:${POSTGRES_PASSWORD:-nyx}@postgres:5432/nyx
  NYX_ALLOW_SIGNUP: ${NYX_ALLOW_SIGNUP:-false}
  NYX_COOKIE_SECURE: ${NYX_COOKIE_SECURE:-false}
  NYX_RUNNER_URL: http://runner:8100
  NYX_RUNNER_TOKEN: ${NYX_RUNNER_TOKEN:-nyx-local-runner-token}
  NYX_TEMPORAL_ADDRESS: temporal:7233
```

`api.environment` becomes `*api-env`, and `api.depends_on` gains:

```yaml
      temporal:
        condition: service_healthy
```

New services:

```yaml
  temporal:
    # Single-node Temporal with SQLite: durable across restarts, enough for one machine. The image runs as uid 1000
    # and only its home directory is writable, so the volume goes there.
    image: temporalio/temporal:1.9.1
    command: ["server", "start-dev", "--ip", "0.0.0.0", "--db-filename", "/home/temporal/temporal.db"]
    restart: unless-stopped
    volumes:
      - temporal-data:/home/temporal
    healthcheck:
      test: ["CMD", "temporal", "operator", "cluster", "health", "--address", "127.0.0.1:7233"]
      interval: 3s
      retries: 30

  worker:
    # Same image as the API; runs ScanWorkflow and its activities. The only process that executes scans.
    build:
      context: .
      dockerfile: api/Dockerfile
    command: ["python", "-m", "app.worker"]
    restart: unless-stopped
    environment: *api-env
    networks: [default, runner]
    depends_on:
      api:
        condition: service_healthy  # the API runs the migrations
      runner:
        condition: service_healthy
      temporal:
        condition: service_healthy
```

`volumes:` gains `temporal-data:`.

`compose.dev.yml` gains (and its header comment mentions the Temporal UI):

```yaml
  temporal:
    ports:
      - "127.0.0.1:7233:7233"
      - "127.0.0.1:8233:8233"   # Temporal Web UI
```

- [ ] **Step 2: Bring it up**

Run: `docker compose --profile plugins build && docker compose up -d --build && docker compose ps`
Expected: `postgres`, `runner`, `temporal`, `api` healthy; `worker` and `web` up. `docker compose logs worker` shows no traceback.

- [ ] **Step 3: Smoke test from the host**

Run (with the admin session cookie from signing in at http://localhost:3001, or via the UI in Task 9):
`docker compose exec api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/healthz').read())"`
Expected: `b'{"status":"ok"}'`.

- [ ] **Step 4: CI**

`.github/workflows/ci.yml` needs no new job: the `api` job runs `test_workflow.py` (the time-skipping server is downloaded by the SDK) and the `images` job builds `worker` through `docker compose build`. Run `docker compose config -q` to validate the file.

- [ ] **Step 5: README**

In `README.md`:
- the mermaid diagram: replace the dotted `api -. planned .-> temporal["Temporal<br/>durable scans"]` with solid `api --> temporal["Temporal<br/>durable scans"]` and add `temporal --> worker["worker<br/>runs scans"]`, `worker --> runner`, `worker --> pg`;
- the note under "What a scan looks like" becomes: "Today I chain Subfinder, dnsx and httpx: every subdomain I find goes through the scope check and on to the next tool, in batches, and a scan survives restarts. The planner that picks tools by what it found is next; see the roadmap.";
- "Run me": mention `/app/scans/new`; "Developing without containers": add `temporal` to the `compose.dev.yml up` list and a third terminal `cd api && uv run python -m app.worker`; mention the Temporal UI at http://127.0.0.1:8233 with the dev override;
- Repository map `api/` line: "FastAPI service and the scan worker: accounts, scope, plugin registry, scans on Temporal. Migrations in `api/alembic`.";
- Roadmap item 3 stays unchecked with "(3a scans done; 3b egress limited to scope next)".

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml compose.dev.yml README.md
git commit -m "chore: temporal and worker in compose; README for durable scans"
```

---

### Task 9: Web — scans

**Files:**
- Create: `web/src/components/scans/scan-status.tsx`, `web/src/components/scans/new-scan-form.tsx`, `web/src/components/scans/scans-table.tsx`, `web/src/components/scans/scan-overview.tsx`, `web/src/components/scans/scan-metrics.tsx`
- Modify: `web/src/lib/types.ts`, `web/src/lib/api/client.ts`, `web/src/lib/api/hooks.ts`, `web/src/lib/mocks/data.ts`, `web/src/components/plugins/run-panel.tsx`, `web/src/app/app/scans/page.tsx`, `web/src/app/app/scans/new/page.tsx`, `web/src/app/app/scans/[scanId]/page.tsx`, `web/src/app/app/scans/[scanId]/live/page.tsx`, `web/src/app/app/scans/[scanId]/metrics/page.tsx`

**Interfaces:**
- Consumes: the API from Task 7.
- Produces: `api.listScans/getScan/startScan/scanRuns/scanTargets/pauseScan/resumeScan/cancelScan`; hooks `useScans`, `useScan`, `useScanRuns`, `useScanTargets`; `EventList` exported from `run-panel.tsx`.

- [ ] **Step 1: Types**

In `web/src/lib/types.ts` replace `ScanStatus` and `Scan` and extend runs:

```ts
export type ScanStatus = "CREATED" | "RUNNING" | "PAUSED" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
export const scanFinal: ScanStatus[] = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"];

export type Scan = {
  id: string; root_target: Target; plugin_ids: string[]; max_depth: number; max_targets: number;
  status: ScanStatus; error: string | null; created_at: string; started_at: string | null; finished_at: string | null;
};
export type ScanDetail = Scan & {
  targets_in_scope: number; targets_out_of_scope: number; runs: Partial<Record<RunStatus, number>>;
  events: number; container_seconds: number;
};
export type ScanTarget = { type: TargetType; value: string; depth: number; in_scope: boolean; refusal: string | null; source_run_id: string | null };
export type ScanInput = { target: Target; plugin_ids: string[]; max_depth: number };
```

`RunStatus` gains `"CANCELLED"`; `PluginRun` gains `scan_id: string | null; targets: Target[]; attempt: number`.

Delete `scans` from `web/src/lib/mocks/data.ts` (and its `Scan` import). Then run `cd web && npx tsc --noEmit` and fix every place that used the old `Scan` fields (`target`, `profile`, `startedAt`, …) — expected: none outside `client.ts`; the dashboard does not read scans.

- [ ] **Step 2: Client and hooks**

`web/src/lib/api/client.ts`: remove the `scans` mock import and replace the two mock scan entries with:

```ts
  listScans: () => call<Scan[]>("/scans"),
  getScan: (id: string) => call<ScanDetail>(`/scans/${id}`),
  startScan: (body: ScanInput) => post<Scan>("/scans", body),
  scanRuns: (id: string) => call<PluginRun[]>(`/scans/${id}/runs`),
  scanTargets: (id: string) => call<ScanTarget[]>(`/scans/${id}/targets`),
  pauseScan: (id: string) => post<Scan>(`/scans/${id}/pause`),
  resumeScan: (id: string) => post<Scan>(`/scans/${id}/resume`),
  cancelScan: (id: string) => post<Scan>(`/scans/${id}/cancel`),
```

`web/src/lib/api/hooks.ts`: replace `useScans`/`useScan` with:

```ts
export const scanLive = (s?: ScanStatus) => !!s && !scanFinal.includes(s);

export const useScans = () => useQuery({ queryKey: ["scans"], queryFn: api.listScans, refetchInterval: 5000 });
export const useScan = (id: string) =>
  useQuery({ queryKey: ["scans", id], queryFn: () => api.getScan(id), refetchInterval: (q) => (scanLive(q.state.data?.status) ? 2000 : false) });
export const useScanRuns = (id: string, polling: boolean) =>
  useQuery({ queryKey: ["scans", id, "runs"], queryFn: () => api.scanRuns(id), refetchInterval: polling ? 2000 : false });
// ponytail: first 500 targets only; page with ?after= when scans routinely find more.
export const useScanTargets = (id: string, polling: boolean) =>
  useQuery({ queryKey: ["scans", id, "targets"], queryFn: () => api.scanTargets(id), refetchInterval: polling ? 2000 : false });
```

and widen `live` for runs to `s === "PENDING" || s === "RUNNING"` (unchanged) — CANCELLED is final.

In `run-panel.tsx`, `export` the `EventList` function.

- [ ] **Step 3: Components**

`web/src/components/scans/scan-status.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { RunStatus, ScanStatus } from "@/lib/types";

const tone: Record<string, string> = {
  COMPLETED: "text-sev-low", SUCCEEDED: "text-sev-low",
  RUNNING: "text-sev-medium", PENDING: "text-sev-medium", CREATED: "text-sev-medium", PAUSED: "text-subtle",
  PARTIAL: "text-sev-high",
  FAILED: "text-sev-critical", TIMED_OUT: "text-sev-critical", CANCELLED: "text-subtle",
};

export function StatusText({ status }: { status: ScanStatus | RunStatus }) {
  return <span className={cn("font-mono text-xs", tone[status])}>{status}</span>;
}
```

`web/src/components/scans/new-scan-form.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { api, ApiError } from "@/lib/api/client";
import { usePlugins, useScope } from "@/lib/api/hooks";
import type { TargetType } from "@/lib/types";

export function NewScanForm() {
  const router = useRouter();
  const { data: plugins } = usePlugins();
  const { data: scope } = useScope();
  const runnable = useMemo(() => (plugins ?? []).filter((p) => p.enabled && p.digest && p.risk_level !== "intrusive"), [plugins]);
  const [type, setType] = useState<TargetType>("domain");
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [depth, setDepth] = useState(2);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (picked === null && runnable.length) setPicked(runnable.map((p) => p.id)); }, [picked, runnable]);
  const selected = picked ?? [];
  const suggestions = (scope ?? []).filter((s) => s.kind === "domain").map((s) => s.value);

  const toggle = (id: string) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const scan = await api.startScan({ target: { type, value: value.trim() }, plugin_ids: selected, max_depth: depth });
      router.push(`/app/scans/${scan.id}`);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Target</legend>
        <div className="flex flex-wrap gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as TargetType)} aria-label="Target type" className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
            {(["domain", "ip", "url"] as const).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Input list="scan-scope" value={value} onChange={(e) => setValue(e.target.value)} placeholder={suggestions[0] ?? "example.com"} className="max-w-xs" aria-label="Target" />
          <datalist id="scan-scope">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <p className="text-xs text-muted-foreground">Only targets in scope. Everything I find is checked against scope again before I touch it.</p>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Plugins</legend>
        {!runnable.length && <p className="text-sm text-muted-foreground">No runnable plugins. Build the images and enable at least one.</p>}
        <ul className="flex flex-col gap-1.5">
          {runnable.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="font-medium">{p.name}</span>
                <RiskBadge risk={p.risk_level} />
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Depth</span>
        <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="h-8 max-w-xs rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value={1}>1 · only the target</option>
          <option value={2}>2 · the target and what it reveals</option>
          <option value={3}>3 · one more hop</option>
        </select>
      </label>
      {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
      <div><Button type="submit" disabled={busy || !value.trim() || !selected.length}>{busy ? "Starting…" : "Start scan"}</Button></div>
    </form>
  );
}
```

`web/src/components/scans/scans-table.tsx`:

```tsx
"use client";

import Link from "next/link";
import { StatusText } from "@/components/scans/scan-status";
import { useScans } from "@/lib/api/hooks";

const duration = (a: string | null, b: string | null) => (a ? `${Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000)}s` : "—");

export function ScansTable() {
  const { data, isLoading, error } = useScans();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading scans…</p>;
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No scans yet. <Link href="/app/scans/new" className="underline">Start one.</Link></p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-subtle">
          <tr>{["Target", "Status", "Plugins", "Depth", "Started", "Duration"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-1">
              <td className="px-4 py-3"><Link href={`/app/scans/${s.id}`} className="font-medium hover:underline">{s.root_target.value}</Link></td>
              <td className="px-4 py-3"><StatusText status={s.status} /></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{s.plugin_ids.join(", ")}</td>
              <td className="px-4 py-3 font-mono text-xs">{s.max_depth}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{s.started_at ? new Date(s.started_at).toLocaleString() : "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">{duration(s.started_at, s.finished_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`web/src/components/scans/scan-overview.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EventList } from "@/components/plugins/run-panel";
import { StatusText } from "@/components/scans/scan-status";
import { api, ApiError } from "@/lib/api/client";
import { scanLive, useMe, useRunEvents, useScan, useScanRuns, useScanTargets } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

export function ScanOverview({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: scan, error } = useScan(id);
  const live = scanLive(scan?.status);
  const { data: runs } = useScanRuns(id, live);
  const { data: targets } = useScanTargets(id, live);
  const { data: me } = useMe();
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!scan) return <p className="text-sm text-muted-foreground">Loading the scan…</p>;
  const canControl = live && (me?.role === "admin" || me?.role === "analyst");

  const act = async (fn: (id: string) => Promise<unknown>) => {
    setErr("");
    try { await fn(id); } catch (x) { setErr(x instanceof ApiError ? x.message : "Something went wrong."); }
    qc.invalidateQueries({ queryKey: ["scans", id] });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-center gap-4">
        <StatusText status={scan.status} />
        <span className="text-sm">{scan.root_target.value}</span>
        <span className="text-xs text-subtle">{scan.plugin_ids.join(", ")} · depth {scan.max_depth}</span>
        {scan.error && <span className="text-xs text-sev-critical">{scan.error}</span>}
        {canControl && (
          <span className="ml-auto flex gap-2">
            {scan.status === "PAUSED"
              ? <Button variant="outline" onClick={() => act(api.resumeScan)}>Resume</Button>
              : <Button variant="outline" onClick={() => act(api.pauseScan)}>Pause</Button>}
            <Button variant="outline" onClick={() => act(api.cancelScan)}>Cancel</Button>
          </span>
        )}
      </section>
      {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Targets followed", scan.targets_in_scope], ["Out of scope", scan.targets_out_of_scope],
          ["Runs", Object.values(scan.runs).reduce((a, b) => a + (b ?? 0), 0)], ["Events", scan.events]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border p-4">
            <p className="text-xs text-subtle">{k}</p>
            <p className="mt-1 font-mono text-lg">{v}</p>
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Runs</h2>
        <ul className="rounded-lg border border-border text-sm">
          {(runs ?? []).map((r) => (
            <li key={r.id} className="border-b border-border last:border-0">
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-1">
                <span className="font-medium">{r.plugin_id}</span>
                <StatusText status={r.status} />
                <span className="text-xs text-subtle">{r.targets.length === 1 ? r.targets[0].value : `${r.targets.length} targets`} · {r.event_count} events{r.attempt > 1 && ` · attempt ${r.attempt}`}</span>
                {r.error && <span className="text-xs text-sev-critical">{r.error.slice(0, 120)}</span>}
              </button>
              {open === r.id && <RunEvents id={r.id} polling={r.status === "PENDING" || r.status === "RUNNING"} />}
            </li>
          ))}
          {!runs?.length && <li className="px-4 py-2.5 text-xs text-subtle">No runs yet.</li>}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Targets</h2>
        <ul className="rounded-lg border border-border font-mono text-xs">
          {(targets ?? []).map((t) => (
            <li key={`${t.type}:${t.value}`} className={cn("flex gap-3 border-b border-border px-4 py-1.5 last:border-0", !t.in_scope && "text-subtle")}>
              <span className="w-14 shrink-0">{t.type}</span>
              <span className="break-all">{t.value}</span>
              <span className="ml-auto shrink-0">{t.in_scope ? `depth ${t.depth}` : t.refusal}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RunEvents({ id, polling }: { id: string; polling: boolean }) {
  const { data } = useRunEvents(id, polling);
  return <div className="px-4 pb-3"><EventList events={data ?? []} /></div>;
}
```

`web/src/components/scans/scan-metrics.tsx`:

```tsx
"use client";

import { useScan } from "@/lib/api/hooks";

export function ScanMetrics({ id }: { id: string }) {
  const { data: s } = useScan(id);
  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const runs = Object.values(s.runs).reduce((a, b) => a + (b ?? 0), 0);
  const rows: [string, string | number][] = [
    ["Plugin runs", runs],
    ...Object.entries(s.runs).map(([k, v]) => [`  ${k}`, v ?? 0] as [string, number]),
    ["Container seconds", s.container_seconds.toFixed(1)],
    ["Targets followed", s.targets_in_scope],
    ["Targets refused (out of scope)", s.targets_out_of_scope],
    ["Events", s.events],
  ];
  return (
    <table className="text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-border last:border-0">
            <td className="whitespace-pre py-2 pr-8 text-muted-foreground">{k}</td>
            <td className="py-2 font-mono">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Pages**

`web/src/app/app/scans/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ScansTable } from "@/components/scans/scans-table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Scans" };

export default function Page() {
  return (
    <>
      <PageHeader title="Scans" description="Every scan with what it ran and how it ended." actions={<Button render={<Link href="/app/scans/new" />}>New scan</Button>} />
      <ScansTable />
    </>
  );
}
```

(If `Button` in this repo does not support `render`, use `<Link href="/app/scans/new" className={buttonVariants()}>New scan</Link>` — check `web/src/components/ui/button.tsx` for the export.)

`web/src/app/app/scans/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { NewScanForm } from "@/components/scans/new-scan-form";

export const metadata: Metadata = { title: "New Scan" };

export default function Page() {
  return (
    <>
      <PageHeader title="New scan" description="Pick a target in scope and the plugins to run. I hand everything I find to every plugin that can use it." />
      <NewScanForm />
    </>
  );
}
```

`web/src/app/app/scans/[scanId]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ScanOverview } from "@/components/scans/scan-overview";

export const metadata: Metadata = { title: "Scan" };

export default async function Page(props: PageProps<"/app/scans/[scanId]">) {
  const { scanId } = await props.params;
  return <ScanOverview id={scanId} />;
}
```

`web/src/app/app/scans/[scanId]/live/page.tsx`:

```tsx
import { redirect } from "next/navigation";

// No separate live view until events stream over SSE: the overview polls while the scan runs.
export default async function Page(props: PageProps<"/app/scans/[scanId]/live">) {
  const { scanId } = await props.params;
  redirect(`/app/scans/${scanId}`);
}
```

`web/src/app/app/scans/[scanId]/metrics/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ScanMetrics } from "@/components/scans/scan-metrics";

export const metadata: Metadata = { title: "Scan metrics" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/metrics">) {
  const { scanId } = await props.params;
  return <ScanMetrics id={scanId} />;
}
```

- [ ] **Step 5: Lint and build**

Run: `cd web && pnpm lint && pnpm build`
Expected: success; routes include `/app/scans`, `/app/scans/new`, `/app/scans/[scanId]`.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): start, watch, pause and cancel scans"
```

---

### Task 10: End-to-end check

**Files:** none (verification only; fix forward in the owning task's files if something fails).

- [ ] **Step 1: Fresh stack**

Run: `docker compose --profile plugins build && docker compose up -d --build && docker compose --profile lab up -d testbed`
Expected: all services healthy.

- [ ] **Step 2: Lab scan**

In the UI (http://localhost:3001): Settings → Scope → add `nyx-lab.test`, active allowed, authorization "local lab". New scan → target `testbed.nyx-lab.test`, plugins dnsx + httpx, depth 2.
Expected: the scan ends `COMPLETED` (or `PARTIAL` with a readable per-run error); the targets table shows `http://testbed.nyx-lab.test` at depth 1; httpx did not get its own URL (no second httpx run on it).

- [ ] **Step 3: Pause, resume, cancel**

Start a scan of a domain you own (in scope, passive only) with all three plugins. While Subfinder runs: Pause → status PAUSED after the running batch, no new runs appear; Resume → runs continue. Start another; Cancel during a run → that run CANCELLED, scan CANCELLED, `docker ps --filter label=nyx.run_id` empty.

- [ ] **Step 4: Worker restart**

Start a scan; while a batch runs: `docker compose restart worker`.
Expected: within ~30 s the batch is retried (`attempt 2` in the runs list), the scan completes.

- [ ] **Step 5: Temporal UI**

Run: `docker compose -f docker-compose.yml -f compose.dev.yml up -d temporal` and open http://127.0.0.1:8233.
Expected: workflows `scan-<id>` with their activity history.

- [ ] **Step 6: Push**

Ask the user before pushing (the repository is public). Then `git push` and check CI is green.
