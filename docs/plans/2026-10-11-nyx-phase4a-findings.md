# NYX Phase 4a — Nuclei, findings, assets, profiles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NYX produces findings: a Nuclei plugin after httpx, cross-scan findings and assets with review, scan profiles as data, and live Findings / Assets / Dashboard / Profiles screens.

**Architecture:** After every batch, `scans.harvest` calls `findings.index` in the same transaction, upserting `assets` and `findings` (fingerprint-deduplicated) plus `finding_occurrences`. Scans carry `plugin_config` validated against each manifest's `config_schema`, which reaches plugins through `NYX_INPUT.config`. Profiles are rows (two built-in, seeded by migration). The web app reads new REST endpoints; mocks are deleted.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, Postgres 17, jsonschema, pytest; Next.js 16 (read `web/node_modules/next/dist/docs/` before touching routing APIs), TanStack Query, Tailwind 4; Docker plugins (python:3.12-slim + upstream binary).

**Spec:** `docs/specs/2026-10-11-nyx-phase4a-findings-design.md`

## Global Constraints

- Severities: `critical|high|medium|low|info`, rank in that order (critical = 0).
- Finding statuses: `open|confirmed|false_positive|accepted_risk|fixed`. "Open" in counts (dashboard, assets, scan detail) means status in `(open, confirmed)`.
- Fingerprint: `sha256(f"{plugin_id}|{template_id}|{matched_at}")` hex; `template_id = data.template_id or data.title`; `matched_at = data.matched_at or event.target.value`.
- Column limits: `assets.kind` 32, `assets.value` 2000, `findings.title` 300, `template_id` 200, `matched_at` 2000, `scan_profiles.name` 80.
- Re-seen `fixed` → `open` (clears note/by/at). `false_positive`, `accepted_risk`, `confirmed` never change on re-sight.
- Built-in profiles are read-only: 409 `"Built-in profiles are read-only."`.
- Nuclei hard exclusions (never configurable): tags `dos,fuzz,fuzzing,intrusive,brute-force,bruteforce`; types `headless,code,javascript`; `-no-interactsh`.
- Readers: any signed-in user. Writers: `admin`, `analyst` (`require_role("admin", "analyst")`). Errors are `{"detail": "..."}`.
- Models must match migrations exactly: CI runs `alembic check`. Declare every index/unique in the model with the migration's name.
- API style: `ruff check` and `ruff format --check` must pass (line length per `api/pyproject.toml`).
- Web: `pnpm lint` and `pnpm build` must pass. No new npm dependencies. Charts are inline SVG.
- Commit messages: `feat(api): …`, `feat(web): …`, `feat(plugins): …`, `test(api): …`, `docs: …`, `chore: …`. Work on branch `feat/phase4a-findings`.

## Review Focus

- A finding reported twice in one batch (same fingerprint, two events): one finding row, one occurrence row — not an IntegrityError. Test in Task 3.
- An asset or finding event with an over-long value (>2000 chars): skipped or truncated, the batch still succeeds. Test in Task 3.
- `POST /scans` with a profile and an explicit `plugin_ids` that drops a plugin the profile has config for: the profile's config for the dropped plugin is silently filtered, not a 422. Test in Task 4.
- `GET /findings?severity=bogus`: 422 with a readable message, not a 500. Test in Task 6.
- Dashboard on an empty database: all zeros and 30 zero-filled days, no division or `None` errors. Test in Task 7.

---

## File Map

API:
- `api/alembic/versions/0006_findings.py` — new tables, scan columns, built-in profile seed.
- `api/app/models.py` — `Asset`, `Finding`, `FindingOccurrence`, `ScanProfile`; `Scan.plugin_config`, `Scan.profile_id`.
- `api/app/findings.py` — `SEVERITIES`, `OPEN`, `fingerprint()`, `index()`.
- `api/app/scans.py` — `harvest` calls `index`; `create_scan` takes config and profile.
- `api/app/runs.py` — sends the scan's config for the plugin.
- `api/app/contract.py` — `validate_config()`.
- `api/app/routes/scans.py` — profile/config on `POST /scans`, `findings_by_severity` on detail, shared `check_plugins`/`check_config`.
- `api/app/routes/profiles.py`, `findings.py`, `assets.py`, `dashboard.py` — new routers; `app/main.py` includes them.
- Tests: `api/tests/test_findings_index.py`, `test_plugin_config.py`, `test_profiles.py`, `test_findings_routes.py`, `test_assets_dashboard.py`; `conftest.py` and `test_migrations.py`, `test_adapters.py`, `test_contract.py` extended.

Plugins / infra:
- `plugins/schemas/event.schema.json` — finding fields.
- `plugins/sdk/nyx_plugin.py` — `CONFIG`.
- `plugins/projectdiscovery.nuclei/{plugin.yaml,Dockerfile,adapter.py,fixtures/output.jsonl}`.
- `lab/testbed/{default.conf,html/index.html,html/git-config,html/env.txt,html/files/readme.txt}`; `docker-compose.yml`.

Web:
- `web/src/lib/types.ts`, `lib/api/client.ts`, `lib/api/hooks.ts`; delete `web/src/lib/mocks/`.
- `web/src/components/findings/{severity-badge,finding-status,findings-table,finding-detail}.tsx`.
- `web/src/components/assets/assets-view.tsx`.
- `web/src/components/dashboard/dashboard-view.tsx`.
- `web/src/components/profiles/{profiles-view,profile-form,config-fields}.tsx`.
- `web/src/components/scans/{new-scan-form,scan-overview}.tsx` modified.
- Pages: `app/app/{findings,findings/[findingId],assets,dashboard,profiles,scans/new,scans/[scanId]/findings}/page.tsx`.
- `web/src/components/shared/placeholder-page.tsx` gains `phase`; remaining placeholder pages pass it.

---

### Task 1: Migration 0006 and models

**Files:**
- Create: `api/alembic/versions/0006_findings.py`
- Modify: `api/app/models.py` (append classes; extend `Scan`)
- Modify: `api/tests/conftest.py` (`TABLES`, profile cleanup)
- Test: `api/tests/test_migrations.py`

**Interfaces:**
- Produces: models `Asset(id, kind, value, data, first_seen, last_seen, last_scan_id)`, `Finding(id, fingerprint, plugin_id, template_id, title, severity, matched_at, asset_id, data, status, status_note, status_by, status_at, first_seen, last_seen)`, `FindingOccurrence(finding_id, scan_id, run_id, event_seq, seen_at)`, `ScanProfile(id, name, description, builtin, plugin_ids, plugin_config, max_depth, created_by, created_at, updated_at)`; `Scan.plugin_config: dict`, `Scan.profile_id: uuid | None`.

- [ ] **Step 1: Write the failing migration test** — append to `api/tests/test_migrations.py`:

```python
def test_0006_seeds_builtin_profiles_and_round_trips():
    from sqlalchemy import text

    from app.db import engine

    cfg = Config("alembic.ini")
    with engine.begin() as c:
        rows = c.execute(text("select name, builtin, plugin_ids, plugin_config, max_depth from scan_profiles order by name")).all()
    assert [(r.name, r.builtin, r.max_depth) for r in rows] == [("Balanced", True, 3), ("Quick", True, 3)]
    balanced, quick = rows
    assert balanced.plugin_ids == [
        "projectdiscovery.subfinder", "projectdiscovery.dnsx", "projectdiscovery.httpx", "projectdiscovery.nuclei"
    ]
    assert quick.plugin_config == {"projectdiscovery.nuclei": {"severity": ["high", "critical"]}}
    command.downgrade(cfg, "0005")
    try:
        with engine.begin() as c:
            assert c.scalar(text("select to_regclass('findings')")) is None
    finally:
        command.upgrade(cfg, "head")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && uv run pytest tests/test_migrations.py::test_0006_seeds_builtin_profiles_and_round_trips -v`
Expected: FAIL — `relation "scan_profiles" does not exist`.

- [ ] **Step 3: Write the migration** `api/alembic/versions/0006_findings.py`:

```python
"""assets, findings, occurrences, scan profiles; scan config

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

UUID_DEFAULT = sa.text("gen_random_uuid()")
BUILTIN = [
    (
        "Quick",
        "Subdomains, live web services and high-impact Nuclei checks. Minutes, not hours.",
        ["projectdiscovery.subfinder", "projectdiscovery.httpx", "projectdiscovery.nuclei"],
        {"projectdiscovery.nuclei": {"severity": ["high", "critical"]}},
    ),
    (
        "Balanced",
        "The default: subdomains, DNS, live web services and every Nuclei check from low severity up.",
        ["projectdiscovery.subfinder", "projectdiscovery.dnsx", "projectdiscovery.httpx", "projectdiscovery.nuclei"],
        {"projectdiscovery.nuclei": {"severity": ["low", "medium", "high", "critical"]}},
    ),
]


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=UUID_DEFAULT),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("value", sa.String(2000), nullable=False),
        sa.Column("data", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_scan_id", sa.Uuid(), sa.ForeignKey("scans.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("kind", "value", name="assets_kind_value_key"),
    )
    op.create_index("ix_assets_last_seen", "assets", ["last_seen"])
    op.create_table(
        "findings",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=UUID_DEFAULT),
        sa.Column("fingerprint", sa.String(64), nullable=False, unique=True),
        sa.Column("plugin_id", sa.String(120), nullable=False),
        sa.Column("template_id", sa.String(200), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("severity", sa.String(8), nullable=False),
        sa.Column("matched_at", sa.String(2000), nullable=False),
        sa.Column("asset_id", sa.Uuid(), sa.ForeignKey("assets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("status", sa.String(16), server_default="open", nullable=False),
        sa.Column("status_note", sa.Text(), nullable=True),
        sa.Column("status_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("severity in ('critical', 'high', 'medium', 'low', 'info')", name="findings_severity_check"),
        sa.CheckConstraint(
            "status in ('open', 'confirmed', 'false_positive', 'accepted_risk', 'fixed')", name="findings_status_check"
        ),
    )
    for col in ("severity", "status", "last_seen", "asset_id"):
        op.create_index(f"ix_findings_{col}", "findings", [col])
    op.create_table(
        "finding_occurrences",
        sa.Column("finding_id", sa.Uuid(), sa.ForeignKey("findings.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("scan_id", sa.Uuid(), sa.ForeignKey("scans.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("plugin_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_seq", sa.Integer(), nullable=True),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_finding_occurrences_scan_id", "finding_occurrences", ["scan_id"])
    profiles = op.create_table(
        "scan_profiles",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=UUID_DEFAULT),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("builtin", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("plugin_ids", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("plugin_config", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("max_depth", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("max_depth between 1 and 3", name="scan_profiles_depth_check"),
    )
    op.bulk_insert(
        profiles,
        [
            {"name": n, "description": d, "builtin": True, "plugin_ids": ids, "plugin_config": cfg, "max_depth": 3}
            for n, d, ids, cfg in BUILTIN
        ],
    )
    op.add_column("scans", sa.Column("plugin_config", postgresql.JSONB(), server_default="{}", nullable=False))
    op.add_column(
        "scans",
        sa.Column("profile_id", sa.Uuid(), sa.ForeignKey("scan_profiles.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scans", "profile_id")
    op.drop_column("scans", "plugin_config")
    op.drop_table("scan_profiles")
    op.drop_table("finding_occurrences")
    op.drop_table("findings")
    op.drop_table("assets")
```

- [ ] **Step 4: Add the models** — in `api/app/models.py`, add `Index` to the `sqlalchemy` import, add to `Scan`:

```python
    plugin_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    profile_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scan_profiles.id", ondelete="SET NULL"))
```

and append:

```python
class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint("kind", "value", name="assets_kind_value_key"),
        Index("ix_assets_last_seen", "last_seen"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    kind: Mapped[str] = mapped_column(String(32))
    value: Mapped[str] = mapped_column(String(2000))
    data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id", ondelete="SET NULL"))


class Finding(Base):
    __tablename__ = "findings"
    __table_args__ = (
        CheckConstraint("severity in ('critical', 'high', 'medium', 'low', 'info')", name="findings_severity_check"),
        CheckConstraint(
            "status in ('open', 'confirmed', 'false_positive', 'accepted_risk', 'fixed')", name="findings_status_check"
        ),
        Index("ix_findings_severity", "severity"),
        Index("ix_findings_status", "status"),
        Index("ix_findings_last_seen", "last_seen"),
        Index("ix_findings_asset_id", "asset_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True)
    plugin_id: Mapped[str] = mapped_column(String(120))
    template_id: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(300))
    severity: Mapped[str] = mapped_column(String(8))
    matched_at: Mapped[str] = mapped_column(String(2000))
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"))
    data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    status: Mapped[str] = mapped_column(String(16), default="open", server_default="open")
    status_note: Mapped[str | None] = mapped_column(Text)
    status_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FindingOccurrence(Base):
    __tablename__ = "finding_occurrences"
    __table_args__ = (Index("ix_finding_occurrences_scan_id", "scan_id"),)

    finding_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("findings.id", ondelete="CASCADE"), primary_key=True)
    scan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), primary_key=True)
    run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("plugin_runs.id", ondelete="SET NULL"))
    event_seq: Mapped[int | None] = mapped_column(Integer)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScanProfile(Base):
    __tablename__ = "scan_profiles"
    __table_args__ = (CheckConstraint("max_depth between 1 and 3", name="scan_profiles_depth_check"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    builtin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    plugin_ids: Mapped[list[str]] = mapped_column(ARRAY(String))
    plugin_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    max_depth: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

`Scan` is defined before `ScanProfile`; the string FK resolves at mapper configuration, so order does not matter.

- [ ] **Step 5: Update test cleanup** — in `api/tests/conftest.py`:

```python
TABLES = (
    "users, sessions, scope_targets, plugins, plugin_versions, plugin_installations, "
    "scans, scan_targets, plugin_runs, plugin_events, assets, findings, finding_occurrences"
)
```

`TRUNCATE users … CASCADE` empties every table with a foreign key to `users` — `scan_profiles` included, builtins too. So `clean` also truncates `scan_profiles` and re-seeds the built-ins from the migration's own `BUILTIN` list. Add near the top of `conftest.py` (after the existing imports):

```python
import importlib.util  # noqa: E402
import json  # noqa: E402

_spec = importlib.util.spec_from_file_location("m0006", "alembic/versions/0006_findings.py")
_m0006 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m0006)
```

add `scan_profiles` to the end of `TABLES` (`"… assets, findings, finding_occurrences, scan_profiles"`), and in `clean`, after the truncate in the same `engine.begin()` block:

```python
        for name, description, ids, cfg in _m0006.BUILTIN:
            c.execute(
                text(
                    "insert into scan_profiles (name, description, builtin, plugin_ids, plugin_config, max_depth) "
                    "values (:n, :d, true, :ids, cast(:cfg as jsonb), 3)"
                ),
                {"n": name, "d": description, "ids": ids, "cfg": json.dumps(cfg)},
            )
```

- [ ] **Step 6: Run migration test, `alembic check` and the full suite**

Run: `cd api && uv run pytest tests/test_migrations.py -v && uv run alembic upgrade head && uv run alembic check && uv run pytest -q`
Expected: all PASS; `alembic check` prints `No new upgrade operations detected.` If it reports differences, align the model (name, index, nullability) with the migration — never the other way round.

- [ ] **Step 7: Commit**

```bash
git add api/alembic/versions/0006_findings.py api/app/models.py api/tests/conftest.py api/tests/test_migrations.py
git commit -m "feat(api): assets, findings, occurrences and scan profiles tables; built-in Quick and Balanced"
```

---

### Task 2: Event contract for findings, SDK config

**Files:**
- Modify: `plugins/schemas/event.schema.json`
- Modify: `plugins/sdk/nyx_plugin.py`
- Test: `api/tests/test_contract.py`

**Interfaces:**
- Produces: valid `finding` events require `data.title` (string) and `data.severity` ∈ severities; optional typed fields `template_id, matched_at, description, curl, matcher` (strings), `references, cve, cwe, extracted` (arrays of strings). SDK: `CONFIG: dict`.

- [ ] **Step 1: Write failing tests** — append to `api/tests/test_contract.py`:

```python
def _finding(**data):
    return {
        "event_version": "1",
        "type": "finding",
        "plugin_run_id": "r1",
        "plugin_id": "p",
        "plugin_version": "1",
        "timestamp": "2026-10-11T12:00:00Z",
        "target": {"type": "url", "value": "http://a.example.com"},
        "data": {"title": "Exposed .git", "severity": "medium", **data},
    }


def test_finding_with_optional_fields_is_valid():
    e = _finding(template_id="git-config", matched_at="http://a.example.com/.git/config", references=["https://x"],
                 cve=["CVE-2024-1"], cwe=["CWE-200"], extracted=["[core]"], curl="curl ...", matcher="word",
                 description="d")
    assert validate_event(e) == []


@pytest.mark.parametrize("data", [{"severity": "urgent"}, {"references": "https://x"}, {"cve": [1]}])
def test_finding_rejects_bad_fields(data):
    assert validate_event(_finding(**data)) != []
```

(`validate_event` and `pytest` are already imported in that file; add the imports if not.)

- [ ] **Step 2: Run to verify failure**

Run: `cd api && uv run pytest tests/test_contract.py -k finding -v`
Expected: `test_finding_rejects_bad_fields` FAILS (schema accepts anything today).

- [ ] **Step 3: Extend the schema** — in `plugins/schemas/event.schema.json`, replace the finding rule in `allOf`:

```json
{ "if": { "properties": { "type": { "const": "finding" } } }, "then": { "properties": { "data": {
  "required": ["title", "severity"],
  "properties": {
    "title": { "type": "string", "minLength": 1 },
    "severity": { "enum": ["critical", "high", "medium", "low", "info"] },
    "template_id": { "type": "string" },
    "matched_at": { "type": "string" },
    "description": { "type": "string" },
    "curl": { "type": "string" },
    "matcher": { "type": "string" },
    "references": { "type": "array", "items": { "type": "string" } },
    "cve": { "type": "array", "items": { "type": "string" } },
    "cwe": { "type": "array", "items": { "type": "string" } },
    "extracted": { "type": "array", "items": { "type": "string" } }
  }
} } } }
```

- [ ] **Step 4: SDK config** — in `plugins/sdk/nyx_plugin.py` after `TARGETS`:

```python
# Per-plugin settings chosen for this scan, already validated against the manifest's config_schema.
CONFIG: dict = INPUT.get("config") or {}
```

- [ ] **Step 5: Run contract and adapter tests**

Run: `cd api && uv run pytest tests/test_contract.py tests/test_adapters.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/schemas/event.schema.json plugins/sdk/nyx_plugin.py api/tests/test_contract.py
git commit -m "feat(plugins): typed finding fields in the event contract; CONFIG in the SDK"
```

---

### Task 3: Indexing assets and findings after every batch

**Files:**
- Create: `api/app/findings.py`
- Modify: `api/app/scans.py` (`harvest`: call `index` before its `db.commit()`)
- Test: `api/tests/test_findings_index.py`

**Interfaces:**
- Consumes: models from Task 1; `scans.harvest(db, run)`; test helpers `make_plugins`, `add_scope`, `new_scan`, `add_run`, `asset`, `trailer` from `tests/test_scans.py`.
- Produces: `app.findings.SEVERITIES: tuple[str, ...]`, `app.findings.STATUSES: tuple[str, ...]`, `app.findings.OPEN = ("open", "confirmed")`, `app.findings.fingerprint(plugin_id: str, template_id: str, matched_at: str) -> str`, `app.findings.index(db: Session, run: PluginRun) -> None`. Test helper `tests.test_findings_index.finding(title=..., severity=..., **data)` (a line factory like `asset`).

- [ ] **Step 1: Write the failing tests** — `api/tests/test_findings_index.py`:

```python
import json

import pytest
from sqlalchemy import select, update

from app.db import SessionLocal
from app.findings import fingerprint
from app.models import Asset, Finding, FindingOccurrence
from app.runs import execute_run
from tests.test_scans import add_run, add_scope, asset, make_plugins, new_scan, trailer


def finding(title="Exposed .git", severity="medium", **data):
    def line(body):
        i = body["input"]
        return json.dumps(
            {
                "event_version": "1",
                "type": "finding",
                "plugin_run_id": i["run_id"],
                "plugin_id": i["plugin_id"],
                "plugin_version": i["plugin_version"],
                "timestamp": "2026-10-11T12:00:00Z",
                "target": {"type": "url", "value": "http://a.example.com"},
                "data": {"title": title, "severity": severity, **data},
            }
        )

    return line


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(tmp_path, runner, {"t.nuc": ("safe_active", ["url"])})
    add_scope(client, "example.com", active=True)
    return runner


def batch(world, lines, scan=None):
    scan = scan or new_scan(["t.nuc"], root=("url", "http://a.example.com"))
    run = add_run(scan, "t.nuc", [{"type": "url", "value": "http://a.example.com"}])
    world.lines = [*lines, trailer(0)]
    execute_run(run, world)
    return scan, run


def all_(model):
    with SessionLocal() as db:
        return db.scalars(select(model)).all()


def test_assets_upsert_keeps_first_seen(world):
    batch(world, [asset("http_service", "http://a.example.com")])
    [a1] = all_(Asset)
    batch(world, [asset("http_service", "http://a.example.com")])
    [a2] = all_(Asset)
    assert a2.id == a1.id and a2.first_seen == a1.first_seen and a2.last_seen >= a1.last_seen


def test_finding_fingerprint_links_asset_and_records_occurrence(world):
    scan, run = batch(
        world,
        [
            asset("http_service", "http://a.example.com"),
            finding(template_id="git-config", matched_at="http://a.example.com/.git/config"),
        ],
    )
    [f] = all_(Finding)
    assert f.fingerprint == fingerprint("t.nuc", "git-config", "http://a.example.com/.git/config")
    assert (f.status, f.severity, f.title) == ("open", "medium", "Exposed .git")
    [a] = all_(Asset)
    assert f.asset_id == a.id  # no asset at matched_at; the event target is one
    [o] = all_(FindingOccurrence)
    assert (o.scan_id, o.run_id) == (scan, run)


def test_without_template_and_matched_at_title_and_target_are_used(world):
    batch(world, [finding(title="Weak TLS")])
    [f] = all_(Finding)
    assert (f.template_id, f.matched_at) == ("Weak TLS", "http://a.example.com")
    assert f.fingerprint == fingerprint("t.nuc", "Weak TLS", "http://a.example.com")


def test_same_finding_twice_in_one_batch_is_one_row(world):
    batch(world, [finding(template_id="x"), finding(template_id="x")])
    assert len(all_(Finding)) == 1 and len(all_(FindingOccurrence)) == 1


@pytest.mark.parametrize(
    "before,after",
    [("fixed", "open"), ("false_positive", "false_positive"), ("accepted_risk", "accepted_risk"), ("confirmed", "confirmed")],
)
def test_review_status_on_resight(world, before, after):
    batch(world, [finding(template_id="x")])
    with SessionLocal() as db:
        db.execute(update(Finding).values(status=before, status_note="n"))
        db.commit()
    batch(world, [finding(template_id="x")])
    [f] = all_(Finding)
    assert f.status == after
    assert (f.status_note is None) == (before == "fixed")


def test_rescan_adds_an_occurrence_per_scan(world):
    batch(world, [finding(template_id="x")])
    batch(world, [finding(template_id="x")])
    assert len(all_(Finding)) == 1 and len(all_(FindingOccurrence)) == 2


def test_long_values_are_skipped_or_truncated(world):
    long = "http://a.example.com/" + "a" * 3000
    batch(world, [asset("http_service", long), finding(title="T" * 400, template_id="x", matched_at=long)])
    assert all_(Asset) == []
    [f] = all_(Finding)
    assert len(f.title) == 300 and len(f.matched_at) == 2000
    assert f.data["title"] == "T" * 400 and f.data["matched_at"] == long


def test_invalid_findings_are_ignored(world):
    batch(world, [finding(severity="urgent")])
    assert all_(Finding) == []
```

- [ ] **Step 2: Run to verify failure**

Run: `cd api && uv run pytest tests/test_findings_index.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.findings'`.

- [ ] **Step 3: Implement** `api/app/findings.py`:

```python
"""Assets and findings across scans, upserted from a finished batch's valid events.

Called by scans.harvest inside its transaction: a batch's targets, assets and findings commit together.
"""

import hashlib

from sqlalchemy import case, func, null, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Asset, Finding, FindingOccurrence, PluginEvent, PluginRun, PluginVersion

SEVERITIES = ("critical", "high", "medium", "low", "info")
STATUSES = ("open", "confirmed", "false_positive", "accepted_risk", "fixed")
OPEN = ("open", "confirmed")
LINKABLE = ("http_service", "subdomain", "domain", "ip")


def fingerprint(plugin_id: str, template_id: str, matched_at: str) -> str:
    return hashlib.sha256(f"{plugin_id}|{template_id}|{matched_at}".encode()).hexdigest()


def _events(db: Session, run: PluginRun, type: str):
    return db.execute(
        select(PluginEvent.seq, PluginEvent.payload)
        .where(PluginEvent.run_id == run.id, PluginEvent.type == type, PluginEvent.valid.is_(True))
        .order_by(PluginEvent.seq)
    ).all()


def index(db: Session, run: PluginRun) -> None:
    now = func.now()  # one value for the whole transaction
    # ponytail: one statement per event; batch the upserts if a run ever reports tens of thousands.
    for _, payload in _events(db, run, "asset"):
        data = payload.get("data") or {}
        kind, value = str(data.get("kind", ""))[:32], str(data.get("value", ""))
        if not kind or not value or len(value) > 2000:
            continue
        attrs = {k: v for k, v in data.items() if k not in ("kind", "value")}
        stmt = insert(Asset).values(
            kind=kind, value=value, data=attrs, first_seen=now, last_seen=now, last_scan_id=run.scan_id
        )
        db.execute(
            stmt.on_conflict_do_update(
                constraint="assets_kind_value_key",
                set_={"data": stmt.excluded.data, "last_seen": now, "last_scan_id": run.scan_id},
            )
        )
    plugin_id = db.scalar(select(PluginVersion.plugin_id).where(PluginVersion.id == run.plugin_version_id))
    for seq, payload in _events(db, run, "finding"):
        data = payload.get("data") or {}
        if data.get("severity") not in SEVERITIES:
            continue
        target_value = str((payload.get("target") or {}).get("value", ""))
        template_id = str(data.get("template_id") or data["title"])
        matched_at = str(data.get("matched_at") or target_value)
        asset_id = db.scalar(
            select(Asset.id)
            .where(Asset.kind.in_(LINKABLE), Asset.value.in_([matched_at, target_value]))
            .order_by((Asset.value == matched_at).desc())
            .limit(1)
        )
        stmt = insert(Finding).values(
            fingerprint=fingerprint(plugin_id, template_id, matched_at),
            plugin_id=plugin_id,
            template_id=template_id[:200],
            title=str(data["title"])[:300],
            severity=data["severity"],
            matched_at=matched_at[:2000],
            asset_id=asset_id,
            data={**data, "matched_at": matched_at},
            status="open",
            first_seen=now,
            last_seen=now,
        )
        reopen = Finding.status == "fixed"  # inside ON CONFLICT, Finding.* is the existing row
        finding_id = db.scalar(
            stmt.on_conflict_do_update(
                index_elements=["fingerprint"],
                set_={
                    "last_seen": now,
                    "title": stmt.excluded.title,
                    "severity": stmt.excluded.severity,
                    "data": stmt.excluded.data,
                    "asset_id": func.coalesce(stmt.excluded.asset_id, Finding.asset_id),
                    "status": case((reopen, "open"), else_=Finding.status),
                    "status_note": case((reopen, null()), else_=Finding.status_note),
                    "status_by": case((reopen, null()), else_=Finding.status_by),
                    "status_at": case((reopen, null()), else_=Finding.status_at),
                },
            ).returning(Finding.id)
        )
        occ = insert(FindingOccurrence).values(
            finding_id=finding_id, scan_id=run.scan_id, run_id=run.id, event_seq=seq, seen_at=now
        )
        db.execute(
            occ.on_conflict_do_update(
                index_elements=["finding_id", "scan_id"], set_={"run_id": run.id, "event_seq": seq, "seen_at": now}
            )
        )
```

- [ ] **Step 4: Call it from harvest** — in `api/app/scans.py` add `from app.findings import index` and change the end of `harvest` to:

```python
    if new:
        # Two batches of one scan can find the same host at the same moment: the second insert just skips it.
        db.execute(insert(ScanTarget).values(list(new.values())).on_conflict_do_nothing())
    index(db, run)
    db.commit()
    return len(new)
```

(The target-cap `break` leaves only the payload loop, so `index` still runs.)

- [ ] **Step 5: Run new and existing scan tests**

Run: `cd api && uv run pytest tests/test_findings_index.py tests/test_scans.py tests/test_scan_routes.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/app/findings.py api/app/scans.py api/tests/test_findings_index.py
git commit -m "feat(api): index assets and fingerprinted findings after every batch, keep review across scans"
```

---

### Task 4: Plugin config and profiles on `POST /scans`

**Files:**
- Modify: `api/app/contract.py` (add `validate_config`)
- Modify: `api/app/scans.py` (`create_scan` signature)
- Modify: `api/app/runs.py:71` (send the scan's config)
- Modify: `api/app/routes/scans.py` (`ScanIn`, `ScanOut`, `create`, helpers)
- Test: `api/tests/test_plugin_config.py`

**Interfaces:**
- Consumes: `ScanProfile`, `Scan.plugin_config`, `Scan.profile_id` (Task 1); `make_plugins`, `add_scope`, `trailer` (tests/test_scans.py).
- Produces:
  - `app.contract.validate_config(schema: dict, doc: object) -> list[str]`
  - `app.scans.create_scan(db, root: dict, plugin_ids: list[str], max_depth: int, user_id, plugin_config: dict | None = None, profile_id: uuid.UUID | None = None) -> Scan`
  - `app.routes.scans.check_plugins(rows: dict, ids: list[str], from_profile: bool = False) -> None` (raises 422)
  - `app.routes.scans.check_config(rows: dict, ids: list[str], config: dict) -> None` (raises 422)
  - `rows` everywhere is `{plugin_id: (Plugin, PluginVersion, PluginInstallation)}` from `installed_plugins()`.
  - `ScanOut` gains `plugin_config: dict`, `profile_id: uuid.UUID | None`. Test helper `tests.test_plugin_config.set_config_schema(plugin_id, schema)`.

- [ ] **Step 1: Write the failing tests** — `api/tests/test_plugin_config.py`:

```python
import pytest
from sqlalchemy import select

from app.db import SessionLocal
from app.models import PluginVersion, ScanProfile
from tests.test_scans import add_scope, make_plugins, trailer

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"severity": {"type": "array", "items": {"enum": ["low", "high"]}, "minItems": 1}},
}


def set_config_schema(plugin_id, schema):
    with SessionLocal() as db:
        v = db.scalar(select(PluginVersion).where(PluginVersion.plugin_id == plugin_id))
        v.manifest = {**v.manifest, "config_schema": schema}
        db.commit()


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(tmp_path, runner, {"t.sub": ("passive", ["domain"]), "t.cfg": ("passive", ["domain"])})
    set_config_schema("t.cfg", SCHEMA)
    add_scope(client, "example.com")
    runner.lines = [trailer(0)]
    return runner


def profile(plugin_ids, plugin_config=None, max_depth=1, name="Mine"):
    with SessionLocal() as db:
        p = ScanProfile(name=name, plugin_ids=plugin_ids, plugin_config=plugin_config or {}, max_depth=max_depth)
        db.add(p)
        db.commit()
        return str(p.id)


def start(client, **body):
    return client.post("/api/v1/scans", json={"target": {"type": "domain", "value": "example.com"}, **body})


def config_sent(runner, plugin_id):
    return next(c["input"]["config"] for c in runner.calls if c["input"]["plugin_id"] == plugin_id)


def test_config_reaches_the_plugin(client, world):
    r = start(client, plugin_ids=["t.cfg"], plugin_config={"t.cfg": {"severity": ["high"]}})
    assert r.status_code == 202, r.text
    assert r.json()["plugin_config"] == {"t.cfg": {"severity": ["high"]}}
    assert config_sent(world, "t.cfg") == {"severity": ["high"]}


def test_plugins_without_config_get_an_empty_object(client, world):
    start(client, plugin_ids=["t.sub"])
    assert config_sent(world, "t.sub") == {}


@pytest.mark.parametrize(
    "config,msg",
    [
        ({"t.sub": {}}, "Config for t.sub, which is not selected."),
        ({"t.cfg": {"severity": ["urgent"]}}, "t.cfg config: severity/0: 'urgent' is not one of ['low', 'high']"),
        ({"t.cfg": {"nope": 1}}, "t.cfg config: (root): Additional properties are not allowed ('nope' was unexpected)"),
    ],
)
def test_bad_config_is_422(client, world, config, msg):
    r = start(client, plugin_ids=["t.cfg"], plugin_config=config)
    assert (r.status_code, r.json()["detail"]) == (422, msg)


def test_profile_fills_the_scan(client, world):
    pid = profile(["t.sub", "t.cfg"], {"t.cfg": {"severity": ["low"]}}, max_depth=2)
    scan = start(client, profile_id=pid).json()
    assert (sorted(scan["plugin_ids"]), scan["max_depth"], scan["profile_id"]) == (["t.cfg", "t.sub"], 2, pid)
    assert config_sent(world, "t.cfg") == {"severity": ["low"]}


def test_explicit_fields_override_the_profile(client, world):
    pid = profile(["t.sub", "t.cfg"], {"t.cfg": {"severity": ["low"]}}, max_depth=2)
    r = start(client, profile_id=pid, plugin_ids=["t.sub"], max_depth=1)
    assert r.status_code == 202, r.text  # the profile's t.cfg config is dropped with t.cfg, not refused
    assert (r.json()["plugin_ids"], r.json()["max_depth"], r.json()["plugin_config"]) == (["t.sub"], 1, {})


def test_unavailable_profile_plugin_is_422(client, world):
    client.patch("/api/v1/plugins/t.cfg", json={"enabled": False})
    pid = profile(["t.sub", "t.cfg"])
    r = start(client, profile_id=pid)
    assert (r.status_code, r.json()["detail"]) == (422, "t.cfg in this profile is not available.")


def test_unknown_profile_is_404(client, world):
    r = start(client, profile_id="00000000-0000-0000-0000-000000000000")
    assert (r.status_code, r.json()["detail"]) == (404, "No such profile.")
```

The exact jsonschema messages above are what jsonschema 4.x prints; if the installed version words them differently, copy the actual message into the test (the format `"<id> config: <path>: <message>"` is what matters).

- [ ] **Step 2: Run to verify failure**

Run: `cd api && uv run pytest tests/test_plugin_config.py -v`
Expected: FAIL — `plugin_config` missing from the response / extra fields ignored.

- [ ] **Step 3: `validate_config`** — in `api/app/contract.py` replace `_errors` with a shared formatter and add the new function:

```python
def _messages(validator: Draft202012Validator, doc: object) -> list[str]:
    return [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in validator.iter_errors(doc)]


def _errors(name: str, doc: object) -> list[str]:
    return _messages(_validator(name), doc)


def validate_config(schema: dict, doc: object) -> list[str]:
    """A plugin's settings against its manifest's config_schema."""
    return _messages(Draft202012Validator(schema, format_checker=FormatChecker()), doc)
```

- [ ] **Step 4: `create_scan`** — in `api/app/scans.py`:

```python
def create_scan(
    db: Session,
    root: dict,
    plugin_ids: list[str],
    max_depth: int,
    user_id,
    plugin_config: dict | None = None,
    profile_id: uuid.UUID | None = None,
) -> Scan:
    scan = Scan(
        root_target=root,
        plugin_ids=plugin_ids,
        max_depth=max_depth,
        status="CREATED",
        requested_by=user_id,
        plugin_config=plugin_config or {},
        profile_id=profile_id,
    )
```

(rest of the function unchanged).

- [ ] **Step 5: Send the config** — in `api/app/runs.py`, import `Scan` from `app.models` and replace `"config": {},` with:

```python
                "config": (db.get(Scan, run.scan_id).plugin_config if run.scan_id else {}).get(version.plugin_id, {}),
```

- [ ] **Step 6: Route** — in `api/app/routes/scans.py`: import `ScanProfile` from `app.models` and `validate_config` from `app.contract`; change the models and `create`:

```python
class ScanIn(BaseModel):
    target: Target
    plugin_ids: list[str] | None = Field(default=None, max_length=200)
    max_depth: int | None = Field(default=None, ge=1, le=3)
    profile_id: uuid.UUID | None = None
    plugin_config: dict[str, dict] | None = None


class ScanOut(BaseModel):
    id: uuid.UUID
    root_target: dict
    plugin_ids: list[str]
    plugin_config: dict
    profile_id: uuid.UUID | None
    max_depth: int
    max_targets: int
    status: str
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    model_config = {"from_attributes": True}


def check_plugins(rows: dict, ids: list[str], from_profile: bool = False) -> None:
    for pid in ids:
        runnable = pid in rows and rows[pid][2].enabled and rows[pid][1].digest
        if runnable:
            continue
        if from_profile:
            raise HTTPException(422, f"{pid} in this profile is not available.")
        if pid not in rows:
            raise HTTPException(422, f"Unknown plugin {pid}.")
        raise HTTPException(422, f"{rows[pid][0].name} can't run: it is disabled or its image is missing.")


def check_config(rows: dict, ids: list[str], config: dict) -> None:
    for pid, value in config.items():
        if pid not in ids:
            raise HTTPException(422, f"Config for {pid}, which is not selected.")
        if errors := validate_config(rows[pid][1].manifest.get("config_schema", {}), value):
            raise HTTPException(422, f"{pid} config: {errors[0]}")


@router.post("", status_code=202, response_model=ScanOut)
def create(body: ScanIn, db: DB, user: Operator, engine: Engine):
    try:
        root = normalized_target(body.target.type, body.target.value)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    if find_entry(root["type"], root["value"], db.scalars(select(ScopeTarget)).all()) is None:
        raise HTTPException(403, f"{root['value']} is not in scope.")
    profile = None
    if body.profile_id is not None:
        profile = db.get(ScanProfile, body.profile_id)
        if profile is None:
            raise HTTPException(404, "No such profile.")
    rows = {p.id: (p, v, i) for p, v, i in db.execute(installed_plugins()).all()}
    if body.plugin_ids is not None:
        ids = list(dict.fromkeys(body.plugin_ids))
        check_plugins(rows, ids)
    elif profile is not None:
        ids = list(profile.plugin_ids)
        check_plugins(rows, ids, from_profile=True)
    else:
        ids = sorted(pid for pid, (p, v, i) in rows.items() if i.enabled and v.digest and p.risk_level != "intrusive")
    if not ids:
        raise HTTPException(422, "Select at least one plugin.")
    if body.plugin_config is not None:
        config = body.plugin_config
    elif profile is not None:  # an overridden plugin list drops the profile's settings for plugins it left out
        config = {k: v for k, v in profile.plugin_config.items() if k in ids}
    else:
        config = {}
    check_config(rows, ids, config)
    depth = body.max_depth or (profile.max_depth if profile else 2)
    scan = scans.create_scan(db, root, ids, depth, user.id, config, profile.id if profile else None)
    launch(db, scan, engine)
    return scan
```

- [ ] **Step 7: Run config tests and all scan tests**

Run: `cd api && uv run pytest tests/test_plugin_config.py tests/test_scan_routes.py tests/test_runs.py -v`
Expected: PASS. If `test_scan_routes` asserted the exact old 422 messages ("Unknown plugin nope.", "... can't run ..."), they still match because the non-profile path keeps them.

- [ ] **Step 8: Commit**

```bash
git add api/app/contract.py api/app/scans.py api/app/runs.py api/app/routes/scans.py api/tests/test_plugin_config.py
git commit -m "feat(api): per-plugin config validated against manifests, scans from profiles with overrides"
```

---

### Task 5: Profiles API

**Files:**
- Create: `api/app/routes/profiles.py`
- Modify: `api/app/main.py` (include router)
- Test: `api/tests/test_profiles.py`

**Interfaces:**
- Consumes: `check_config`, `rows` shape (Task 4); `ScanProfile` (Task 1); `set_config_schema` (tests/test_plugin_config.py).
- Produces: `GET/POST /api/v1/profiles`, `PATCH/DELETE /api/v1/profiles/{id}`. `ProfileOut = {id, name, description, builtin, plugin_ids, plugin_config, max_depth, created_at, updated_at, available: bool, unavailable: list[str]}`.

- [ ] **Step 1: Write the failing tests** — `api/tests/test_profiles.py`:

```python
import pytest

from app.db import SessionLocal
from app.models import User
from tests.test_plugin_config import SCHEMA, set_config_schema
from tests.test_scans import make_plugins

URL = "/api/v1/profiles"


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(tmp_path, runner, {"t.sub": ("passive", ["domain"]), "t.cfg": ("passive", ["domain"])})
    set_config_schema("t.cfg", SCHEMA)
    return runner


def body(**over):
    return {"name": "Mine", "plugin_ids": ["t.sub", "t.cfg"], "plugin_config": {"t.cfg": {"severity": ["low"]}},
            "max_depth": 2, **over}


def test_list_has_builtins_first_marked_unavailable_without_their_plugins(client, world):
    client.post(URL, json=body())
    rows = client.get(URL).json()
    assert [(r["name"], r["builtin"]) for r in rows] == [("Balanced", True), ("Quick", True), ("Mine", False)]
    assert rows[0]["available"] is False and "projectdiscovery.nuclei" in rows[0]["unavailable"]
    assert rows[2]["available"] is True and rows[2]["unavailable"] == []


def test_create_edit_delete(client, world):
    created = client.post(URL, json=body())
    assert created.status_code == 201, created.text
    pid = created.json()["id"]
    r = client.patch(f"{URL}/{pid}", json={"name": "Renamed", "max_depth": 3})
    assert (r.status_code, r.json()["name"], r.json()["max_depth"]) == (200, "Renamed", 3)
    assert client.delete(f"{URL}/{pid}").status_code == 204
    assert [p["name"] for p in client.get(URL).json()] == ["Balanced", "Quick"]


@pytest.mark.parametrize(
    "over,code,msg",
    [
        ({"name": "Quick"}, 409, "A profile named Quick already exists."),
        ({"plugin_ids": ["nope"]}, 422, "Unknown plugin nope."),
        ({"plugin_config": {"t.cfg": {"severity": []}}}, 422, None),
        ({"plugin_ids": ["t.sub"]}, 422, "Config for t.cfg, which is not selected."),
    ],
)
def test_create_validation(client, world, over, code, msg):
    r = client.post(URL, json=body(**over))
    assert r.status_code == code, r.text
    if msg:
        assert r.json()["detail"] == msg
    else:
        assert r.json()["detail"].startswith("t.cfg config:")


def test_builtins_are_read_only(client, world):
    quick = next(p for p in client.get(URL).json() if p["name"] == "Quick")
    for r in (client.patch(f"{URL}/{quick['id']}", json={"max_depth": 1}), client.delete(f"{URL}/{quick['id']}")):
        assert (r.status_code, r.json()["detail"]) == (409, "Built-in profiles are read-only.")


def test_viewers_can_read_but_not_write(client, world):
    with SessionLocal() as db:
        db.query(User).update({"role": "viewer"})
        db.commit()
    assert client.get(URL).status_code == 200
    assert client.post(URL, json=body()).status_code == 403


def test_deleting_a_profile_keeps_its_scans(client, world, temporal):
    temporal.drive = False
    client.post("/api/v1/scope", json={"kind": "domain", "value": "example.com", "authorization": "t"})
    pid = client.post(URL, json=body()).json()["id"]
    scan = client.post("/api/v1/scans", json={"target": {"type": "domain", "value": "example.com"}, "profile_id": pid}).json()
    client.delete(f"{URL}/{pid}")
    kept = client.get(f"/api/v1/scans/{scan['id']}").json()
    assert (kept["profile_id"], kept["plugin_config"]) == (None, {"t.cfg": {"severity": ["low"]}})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd api && uv run pytest tests/test_profiles.py -v`
Expected: FAIL — 404 on `/api/v1/profiles`.

- [ ] **Step 3: Implement** `api/app/routes/profiles.py`:

```python
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.models import ScanProfile, User
from app.registry import installed_plugins
from app.routes.scans import check_config
from app.security import DB, current_user, require_role

router = APIRouter(prefix="/api/v1/profiles", tags=["profiles"])
Anyone = Annotated[User, Depends(current_user)]
Operator = Annotated[User, Depends(require_role("admin", "analyst"))]
READ_ONLY = "Built-in profiles are read-only."


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)
    plugin_ids: list[str] = Field(min_length=1, max_length=200)
    plugin_config: dict[str, dict] = {}
    max_depth: int = Field(ge=1, le=3)


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    plugin_ids: list[str] | None = Field(default=None, min_length=1, max_length=200)
    plugin_config: dict[str, dict] | None = None
    max_depth: int | None = Field(default=None, ge=1, le=3)


class ProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    builtin: bool
    plugin_ids: list[str]
    plugin_config: dict
    max_depth: int
    created_at: datetime
    updated_at: datetime
    available: bool
    unavailable: list[str]


def _rows(db) -> dict:
    return {p.id: (p, v, i) for p, v, i in db.execute(installed_plugins()).all()}


def _out(profile: ScanProfile, rows: dict) -> dict:
    missing = [pid for pid in profile.plugin_ids if not (pid in rows and rows[pid][2].enabled and rows[pid][1].digest)]
    return {
        **{k: getattr(profile, k) for k in ProfileOut.model_fields if k not in ("available", "unavailable")},
        "available": not missing,
        "unavailable": missing,
    }


def _validate(db, rows: dict, name: str, ids: list[str], config: dict, own_id=None) -> None:
    clash = db.scalar(select(ScanProfile.id).where(ScanProfile.name == name))
    if clash is not None and clash != own_id:
        raise HTTPException(409, f"A profile named {name} already exists.")
    for pid in ids:
        if pid not in rows:
            raise HTTPException(422, f"Unknown plugin {pid}.")
    check_config(rows, ids, config)


def _editable(db, profile_id: uuid.UUID) -> ScanProfile:
    profile = db.get(ScanProfile, profile_id)
    if profile is None:
        raise HTTPException(404, "No such profile.")
    if profile.builtin:
        raise HTTPException(409, READ_ONLY)
    return profile


@router.get("", response_model=list[ProfileOut])
def list_profiles(db: DB, _: Anyone):
    rows = _rows(db)
    profiles = db.scalars(select(ScanProfile).order_by(ScanProfile.builtin.desc(), ScanProfile.name)).all()
    return [_out(p, rows) for p in profiles]


@router.post("", status_code=201, response_model=ProfileOut)
def create(body: ProfileIn, db: DB, user: Operator):
    rows, ids = _rows(db), list(dict.fromkeys(body.plugin_ids))
    _validate(db, rows, body.name, ids, body.plugin_config)
    profile = ScanProfile(
        name=body.name,
        description=body.description,
        plugin_ids=ids,
        plugin_config=body.plugin_config,
        max_depth=body.max_depth,
        created_by=user.id,
    )
    db.add(profile)
    db.commit()
    return _out(profile, rows)


@router.patch("/{profile_id}", response_model=ProfileOut)
def edit(profile_id: uuid.UUID, body: ProfilePatch, db: DB, _: Operator):
    profile, rows = _editable(db, profile_id), _rows(db)
    changes = body.model_dump(exclude_unset=True)
    name = changes.get("name", profile.name)
    ids = list(dict.fromkeys(changes.get("plugin_ids", profile.plugin_ids)))
    config = changes.get("plugin_config", {k: v for k, v in profile.plugin_config.items() if k in ids})
    _validate(db, rows, name, ids, config, own_id=profile.id)
    profile.name, profile.plugin_ids, profile.plugin_config = name, ids, config
    profile.description = changes.get("description", profile.description)
    profile.max_depth = changes.get("max_depth", profile.max_depth)
    db.commit()
    return _out(profile, rows)


@router.delete("/{profile_id}", status_code=204)
def delete(profile_id: uuid.UUID, db: DB, _: Operator):
    db.delete(_editable(db, profile_id))
    db.commit()
    return Response(status_code=204)
```

In `api/app/main.py` add `profiles` to the routes import and to the `for r in (...)` tuple.

- [ ] **Step 4: Run tests**

Run: `cd api && uv run pytest tests/test_profiles.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/app/routes/profiles.py api/app/main.py api/tests/test_profiles.py
git commit -m "feat(api): scan profiles API, built-ins read-only"
```

---

### Task 6: Findings API and findings per scan

**Files:**
- Create: `api/app/routes/findings.py`
- Modify: `api/app/main.py` (include router)
- Modify: `api/app/routes/scans.py` (`ScanDetailOut.findings_by_severity`)
- Test: `api/tests/test_findings_routes.py`

**Interfaces:**
- Consumes: `SEVERITIES`, `STATUSES`, `OPEN` (Task 3); models (Task 1); `tests.test_findings_index.finding`, `batch`, `world` pattern.
- Produces:
  - `GET /api/v1/findings` → `{items: FindingRow[], total: int}`; `FindingRow = {id, title, severity, status, plugin_id, template_id, matched_at, asset: {id, kind, value} | null, first_seen, last_seen, occurrences}`.
  - `GET /api/v1/findings/{id}` → `FindingRow & {data, status_note, status_by, status_at, occurrences_list: [{scan_id, root_target, run_id, event_seq, seen_at}], raw: dict | null}`.
  - `PATCH /api/v1/findings/{id}` `{status, note?}` → `FindingRow` fields + review fields.
  - `GET /scans/{id}` gains `findings_by_severity: {severity: count}` (all statuses).
  - Test helper `tests.test_findings_routes.seed(...)` used by Task 7.

- [ ] **Step 1: Write the failing tests** — `api/tests/test_findings_routes.py`:

```python
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.db import SessionLocal
from app.findings import fingerprint
from app.models import Asset, Finding, FindingOccurrence, Scan, User

URL = "/api/v1/findings"


def seed(title, severity="medium", status="open", plugin_id="t.nuc", asset=None, scan=None, days_ago=0):
    """One finding (and its asset/scan when named). Returns the finding id as str."""
    when = datetime.now(UTC) - timedelta(days=days_ago)
    with SessionLocal() as db:
        asset_id = None
        if asset:
            row = db.query(Asset).filter_by(kind="http_service", value=asset).one_or_none()
            if row is None:
                row = Asset(kind="http_service", value=asset, data={}, first_seen=when, last_seen=when)
                db.add(row)
                db.flush()
            asset_id = row.id
        f = Finding(
            fingerprint=fingerprint(plugin_id, title, asset or "x"),
            plugin_id=plugin_id,
            template_id=title.lower().replace(" ", "-"),
            title=title,
            severity=severity,
            matched_at=asset or "x",
            asset_id=asset_id,
            data={"title": title, "description": "d"},
            status=status,
            first_seen=when,
            last_seen=when,
        )
        db.add(f)
        db.flush()
        if scan:
            db.add(FindingOccurrence(finding_id=f.id, scan_id=scan, seen_at=when))
        db.commit()
        return str(f.id)


def make_scan():
    with SessionLocal() as db:
        s = Scan(root_target={"type": "domain", "value": "example.com"}, plugin_ids=["t.nuc"], status="COMPLETED")
        db.add(s)
        db.commit()
        return s.id


@pytest.fixture
def data(admin):
    scan = make_scan()
    ids = {
        "crit": seed("SQL error", "critical", asset="http://a.example.com", scan=scan),
        "low": seed("Banner", "low", asset="http://a.example.com"),
        "fp": seed("Git config", "medium", status="false_positive", plugin_id="t.other"),
    }
    return scan, ids


def titles(r):
    return [f["title"] for f in r.json()["items"]]


def test_list_orders_by_severity_and_counts(client, data):
    r = client.get(URL)
    assert r.status_code == 200
    assert titles(r) == ["SQL error", "Git config", "Banner"] and r.json()["total"] == 3
    crit = r.json()["items"][0]
    assert crit["asset"]["value"] == "http://a.example.com" and crit["occurrences"] == 1


@pytest.mark.parametrize(
    "query,expected",
    [
        ("severity=critical,low", ["SQL error", "Banner"]),
        ("status=false_positive", ["Git config"]),
        ("plugin_id=t.other", ["Git config"]),
        ("q=git", ["Git config"]),
        ("q=a.example", ["SQL error", "Banner"]),
    ],
)
def test_filters(client, data, query, expected):
    assert titles(client.get(f"{URL}?{query}")) == expected


def test_scan_filter(client, data):
    scan, _ = data
    assert titles(client.get(f"{URL}?scan_id={scan}")) == ["SQL error"]


def test_bad_filter_values_are_422(client, data):
    r = client.get(f"{URL}?severity=bogus")
    assert (r.status_code, r.json()["detail"]) == (422, "Unknown severity: bogus.")
    assert client.get(f"{URL}?status=bogus").status_code == 422


def test_paging(client, data):
    page = client.get(f"{URL}?after=2").json()
    assert [f["title"] for f in page["items"]] == ["Banner"] and page["total"] == 3


def test_detail_has_occurrences(client, data):
    scan, ids = data
    d = client.get(f"{URL}/{ids['crit']}").json()
    assert d["data"]["description"] == "d"
    assert [o["scan_id"] for o in d["occurrences_list"]] == [str(scan)]
    assert d["occurrences_list"][0]["root_target"] == {"type": "domain", "value": "example.com"}
    assert d["raw"] is None  # seeded without a run
    assert client.get(f"{URL}/{uuid.uuid4()}").status_code == 404


def test_review(client, data, admin):
    _, ids = data
    r = client.patch(f"{URL}/{ids['low']}", json={"status": "accepted_risk", "note": "Public banner"})
    assert r.status_code == 200
    assert (r.json()["status"], r.json()["status_note"], r.json()["status_by"]) == ("accepted_risk", "Public banner", admin["id"])
    assert client.patch(f"{URL}/{ids['low']}", json={"status": "gone"}).status_code == 422


def test_viewer_cannot_review(client, data):
    _, ids = data
    with SessionLocal() as db:
        db.query(User).update({"role": "viewer"})
        db.commit()
    assert client.get(URL).status_code == 200
    assert client.patch(f"{URL}/{ids['low']}", json={"status": "confirmed"}).status_code == 403


def test_scan_detail_counts_findings(client, data):
    scan, _ = data
    assert client.get(f"/api/v1/scans/{scan}").json()["findings_by_severity"] == {"critical": 1}
```

And one end-to-end check that `raw` is filled from a real run — append to `api/tests/test_findings_index.py`:

```python
def test_detail_returns_the_raw_event(client, world):
    batch(world, [finding(template_id="x", curl="curl http://a.example.com")])
    [f] = all_(Finding)
    raw = client.get(f"/api/v1/findings/{f.id}").json()["raw"]
    assert raw["data"]["curl"] == "curl http://a.example.com"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd api && uv run pytest tests/test_findings_routes.py -v`
Expected: FAIL — 404 on `/api/v1/findings`.

- [ ] **Step 3: Implement** `api/app/routes/findings.py`:

```python
import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select

from app.findings import SEVERITIES, STATUSES
from app.models import Asset, Finding, FindingOccurrence, PluginEvent, Scan, User
from app.security import DB, current_user, require_role

router = APIRouter(prefix="/api/v1/findings", tags=["findings"])
Anyone = Annotated[User, Depends(current_user)]
Operator = Annotated[User, Depends(require_role("admin", "analyst"))]
PAGE = 200
RANK = case({s: i for i, s in enumerate(SEVERITIES)}, value=Finding.severity)


class ReviewIn(BaseModel):
    status: Literal["open", "confirmed", "false_positive", "accepted_risk", "fixed"]
    note: str | None = Field(default=None, max_length=2000)


def _many(raw: str | None, allowed: tuple[str, ...], what: str) -> list[str] | None:
    if not raw:
        return None
    values = [v.strip() for v in raw.split(",") if v.strip()]
    for v in values:
        if v not in allowed:
            raise HTTPException(422, f"Unknown {what}: {v}.")
    return values


def occurrences_count():
    return (
        select(func.count()).where(FindingOccurrence.finding_id == Finding.id).correlate(Finding).scalar_subquery()
    )


def row(f: Finding, a: Asset | None, occurrences: int) -> dict:
    return {
        "id": f.id,
        "title": f.title,
        "severity": f.severity,
        "status": f.status,
        "plugin_id": f.plugin_id,
        "template_id": f.template_id,
        "matched_at": f.matched_at,
        "asset": {"id": a.id, "kind": a.kind, "value": a.value} if a else None,
        "first_seen": f.first_seen,
        "last_seen": f.last_seen,
        "occurrences": occurrences,
    }


def _review(f: Finding) -> dict:
    return {"data": f.data, "status_note": f.status_note, "status_by": f.status_by, "status_at": f.status_at}


@router.get("")
def list_findings(
    db: DB,
    _: Anyone,
    severity: str | None = None,
    status: str | None = None,
    plugin_id: str | None = None,
    scan_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    after: Annotated[int, Query(ge=0)] = 0,
):
    where = []
    if sev := _many(severity, SEVERITIES, "severity"):
        where.append(Finding.severity.in_(sev))
    if st := _many(status, STATUSES, "status"):
        where.append(Finding.status.in_(st))
    if plugin_id:
        where.append(Finding.plugin_id == plugin_id)
    if scan_id:
        where.append(Finding.id.in_(select(FindingOccurrence.finding_id).where(FindingOccurrence.scan_id == scan_id)))
    if q:
        where.append(
            or_(
                Finding.title.icontains(q, autoescape=True),
                Finding.template_id.icontains(q, autoescape=True),
                Finding.matched_at.icontains(q, autoescape=True),
            )
        )
    total = db.scalar(select(func.count()).select_from(Finding).where(*where))
    rows = db.execute(
        select(Finding, Asset, occurrences_count())
        .outerjoin(Asset, Asset.id == Finding.asset_id)
        .where(*where)
        .order_by(RANK, Finding.last_seen.desc(), Finding.id)
        .offset(after)
        .limit(PAGE)
    ).all()
    return {"items": [row(f, a, n) for f, a, n in rows], "total": total}


def _get(db, finding_id: uuid.UUID) -> Finding:
    f = db.get(Finding, finding_id)
    if f is None:
        raise HTTPException(404, "No such finding.")
    return f


@router.get("/{finding_id}")
def get_finding(finding_id: uuid.UUID, db: DB, _: Anyone):
    f = _get(db, finding_id)
    a = db.get(Asset, f.asset_id) if f.asset_id else None
    occ = db.execute(
        select(FindingOccurrence, Scan.root_target)
        .join(Scan, Scan.id == FindingOccurrence.scan_id)
        .where(FindingOccurrence.finding_id == f.id)
        .order_by(FindingOccurrence.seen_at.desc())
    ).all()
    raw = None
    if occ and occ[0][0].run_id is not None:
        raw = db.scalar(
            select(PluginEvent.payload).where(
                PluginEvent.run_id == occ[0][0].run_id, PluginEvent.seq == occ[0][0].event_seq
            )
        )
    return {
        **row(f, a, len(occ)),
        **_review(f),
        "occurrences_list": [
            {"scan_id": o.scan_id, "root_target": t, "run_id": o.run_id, "event_seq": o.event_seq, "seen_at": o.seen_at}
            for o, t in occ
        ],
        "raw": raw,
    }


@router.patch("/{finding_id}")
def review(finding_id: uuid.UUID, body: ReviewIn, db: DB, user: Operator):
    f = _get(db, finding_id)
    f.status, f.status_note, f.status_by, f.status_at = body.status, body.note, user.id, datetime.now(UTC)
    db.commit()
    a = db.get(Asset, f.asset_id) if f.asset_id else None
    n = db.scalar(select(func.count()).where(FindingOccurrence.finding_id == f.id))
    return {**row(f, a, n), **_review(f)}
```

In `api/app/main.py` add `findings` to the imported routes and the `for r in (...)` tuple.

- [ ] **Step 4: Scan detail count** — in `api/app/routes/scans.py` import `Finding, FindingOccurrence`; add `findings_by_severity: dict[str, int]` to `ScanDetailOut`; in `get_scan` before the `return`:

```python
    by_severity = dict(
        db.execute(
            select(Finding.severity, func.count())
            .join(FindingOccurrence, FindingOccurrence.finding_id == Finding.id)
            .where(FindingOccurrence.scan_id == scan_id)
            .group_by(Finding.severity)
        ).all()
    )
```

and add `"findings_by_severity": by_severity,` to the returned dict.

- [ ] **Step 5: Run tests**

Run: `cd api && uv run pytest tests/test_findings_routes.py tests/test_findings_index.py tests/test_scan_routes.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/app/routes/findings.py api/app/routes/scans.py api/app/main.py api/tests/test_findings_routes.py api/tests/test_findings_index.py
git commit -m "feat(api): findings list, detail and review; findings per scan"
```

---

### Task 7: Assets and dashboard API

**Files:**
- Create: `api/app/routes/assets.py`, `api/app/routes/dashboard.py`
- Modify: `api/app/main.py`
- Test: `api/tests/test_assets_dashboard.py`

**Interfaces:**
- Consumes: `seed`, `make_scan` (tests/test_findings_routes.py); `row`, `occurrences_count`, `RANK` from `app.routes.findings`; `ScanOut` from `app.routes.scans`; `OPEN`, `SEVERITIES` from `app.findings`.
- Produces:
  - `GET /api/v1/assets?kind=&q=&after=` → `{items: [{id, kind, value, data, first_seen, last_seen, open_findings}], total}`.
  - `GET /api/v1/assets/{id}` → asset fields + `findings: FindingRow[]` + `scans: ScanOut[]`.
  - `GET /api/v1/dashboard` → `{open_by_severity: {critical, high, medium, low, info}, open_total, assets_total, assets_new_7d, findings_per_day: [{date: "YYYY-MM-DD", count}] (30, oldest first, ends today UTC), recent_scans: ScanOut[] (≤5), top_assets: [{id, kind, value, open_findings, worst_severity}] (≤5)}`.

- [ ] **Step 1: Write the failing tests** — `api/tests/test_assets_dashboard.py`:

```python
from datetime import UTC, datetime

from sqlalchemy import update

from app.db import SessionLocal
from app.models import Asset
from tests.test_findings_routes import make_scan, seed


def test_assets_list_counts_open_findings_only(client, admin):
    seed("A", "high", asset="http://a.example.com")
    seed("B", "low", status="false_positive", asset="http://a.example.com")
    seed("C", "low", asset="http://b.example.com", status="fixed")
    page = client.get("/api/v1/assets").json()
    counts = {a["value"]: a["open_findings"] for a in page["items"]}
    assert counts == {"http://a.example.com": 1, "http://b.example.com": 0} and page["total"] == 2
    assert [a["value"] for a in client.get("/api/v1/assets?q=b.example").json()["items"]] == ["http://b.example.com"]
    assert client.get("/api/v1/assets?kind=ip").json()["items"] == []


def test_asset_detail_lists_findings_and_scans(client, admin):
    scan = make_scan()
    seed("A", "high", asset="http://a.example.com", scan=scan)
    with SessionLocal() as db:
        db.execute(update(Asset).values(last_scan_id=scan))
        db.commit()
    [a] = client.get("/api/v1/assets").json()["items"]
    d = client.get(f"/api/v1/assets/{a['id']}").json()
    assert [f["title"] for f in d["findings"]] == ["A"]
    assert [s["id"] for s in d["scans"]] == [str(scan)]


def test_dashboard_on_an_empty_database(client, admin):
    d = client.get("/api/v1/dashboard").json()
    assert d["open_by_severity"] == {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    assert (d["open_total"], d["assets_total"], d["assets_new_7d"]) == (0, 0, 0)
    assert len(d["findings_per_day"]) == 30 and {p["count"] for p in d["findings_per_day"]} == {0}
    assert d["findings_per_day"][-1]["date"] == datetime.now(UTC).date().isoformat()
    assert (d["recent_scans"], d["top_assets"]) == ([], [])


def test_dashboard_numbers(client, admin):
    make_scan()
    seed("A", "critical", asset="http://a.example.com")
    seed("B", "high", status="confirmed", asset="http://a.example.com")
    seed("C", "low", status="false_positive", asset="http://b.example.com", days_ago=3)
    seed("D", "medium", asset="http://b.example.com", days_ago=40)
    d = client.get("/api/v1/dashboard").json()
    assert d["open_by_severity"] == {"critical": 1, "high": 1, "medium": 1, "low": 0, "info": 0}
    assert (d["open_total"], d["assets_total"]) == (3, 2)
    assert d["assets_new_7d"] == 2  # a first seen today, b 3 days ago ("D" reuses b's row)
    assert d["findings_per_day"][-1]["count"] == 2 and d["findings_per_day"][-4]["count"] == 1
    assert len(d["recent_scans"]) == 1
    top = d["top_assets"]
    assert [(t["value"], t["open_findings"], t["worst_severity"]) for t in top] == [
        ("http://a.example.com", 2, "critical"),
        ("http://b.example.com", 1, "medium"),
    ]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd api && uv run pytest tests/test_assets_dashboard.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Implement** `api/app/routes/assets.py`:

```python
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select

from app.findings import OPEN
from app.models import Asset, Finding, Scan, ScanTarget, User
from app.routes.findings import RANK, occurrences_count, row
from app.routes.scans import ScanOut
from app.security import DB, current_user

router = APIRouter(prefix="/api/v1/assets", tags=["assets"])
Anyone = Annotated[User, Depends(current_user)]
PAGE = 200


def open_count():
    return (
        select(func.count())
        .where(Finding.asset_id == Asset.id, Finding.status.in_(OPEN))
        .correlate(Asset)
        .scalar_subquery()
    )


def _asset(a: Asset, open_findings: int) -> dict:
    return {
        "id": a.id,
        "kind": a.kind,
        "value": a.value,
        "data": a.data,
        "first_seen": a.first_seen,
        "last_seen": a.last_seen,
        "open_findings": open_findings,
    }


@router.get("")
def list_assets(
    db: DB,
    _: Anyone,
    kind: str | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    after: Annotated[int, Query(ge=0)] = 0,
):
    where = []
    if kind:
        where.append(Asset.kind == kind)
    if q:
        where.append(Asset.value.icontains(q, autoescape=True))
    total = db.scalar(select(func.count()).select_from(Asset).where(*where))
    rows = db.execute(
        select(Asset, open_count()).where(*where).order_by(Asset.last_seen.desc(), Asset.id).offset(after).limit(PAGE)
    ).all()
    return {"items": [_asset(a, n) for a, n in rows], "total": total}


@router.get("/{asset_id}")
def get_asset(asset_id: uuid.UUID, db: DB, _: Anyone):
    a = db.get(Asset, asset_id)
    if a is None:
        raise HTTPException(404, "No such asset.")
    findings = db.execute(
        select(Finding, occurrences_count()).where(Finding.asset_id == a.id).order_by(RANK, Finding.last_seen.desc())
    ).all()
    scans = db.scalars(
        select(Scan)
        .where(or_(Scan.id == a.last_scan_id, Scan.id.in_(select(ScanTarget.scan_id).where(ScanTarget.value == a.value))))
        .order_by(Scan.created_at.desc())
        .limit(20)
    ).all()
    return {
        **_asset(a, sum(1 for f, _ in findings if f.status in OPEN)),
        "findings": [row(f, a, n) for f, n in findings],
        "scans": [ScanOut.model_validate(s).model_dump() for s in scans],
    }
```

`api/app/routes/dashboard.py`:

```python
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.findings import OPEN, SEVERITIES
from app.models import Asset, Finding, Scan, User
from app.routes.findings import RANK
from app.routes.scans import ScanOut
from app.security import DB, current_user

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])
Anyone = Annotated[User, Depends(current_user)]


@router.get("")
def dashboard(db: DB, _: Anyone):
    today = datetime.now(UTC).date()
    since = today - timedelta(days=29)
    by_sev = dict(
        db.execute(select(Finding.severity, func.count()).where(Finding.status.in_(OPEN)).group_by(Finding.severity))
    )
    day = func.date(func.timezone("UTC", Finding.first_seen))
    per_day = dict(db.execute(select(day, func.count()).where(day >= since).group_by(day)).all())
    week_ago = datetime.now(UTC) - timedelta(days=7)
    top = db.execute(
        select(Asset, func.count(Finding.id), func.min(RANK))
        .join(Finding, Finding.asset_id == Asset.id)
        .where(Finding.status.in_(OPEN))
        .group_by(Asset.id)
        .order_by(func.count(Finding.id).desc(), func.min(RANK), Asset.value)
        .limit(5)
    ).all()
    return {
        "open_by_severity": {s: by_sev.get(s, 0) for s in SEVERITIES},
        "open_total": sum(by_sev.values()),
        "assets_total": db.scalar(select(func.count()).select_from(Asset)),
        "assets_new_7d": db.scalar(select(func.count()).select_from(Asset).where(Asset.first_seen >= week_ago)),
        "findings_per_day": [
            {"date": (since + timedelta(days=i)).isoformat(), "count": per_day.get(since + timedelta(days=i), 0)}
            for i in range(30)
        ],
        "recent_scans": [
            ScanOut.model_validate(s).model_dump()
            for s in db.scalars(select(Scan).order_by(Scan.created_at.desc()).limit(5))
        ],
        "top_assets": [
            {"id": a.id, "kind": a.kind, "value": a.value, "open_findings": n, "worst_severity": SEVERITIES[w]}
            for a, n, w in top
        ],
    }
```

Add `assets` and `dashboard` to the routes import and router tuple in `api/app/main.py`.

- [ ] **Step 4: Run tests**

Run: `cd api && uv run pytest tests/test_assets_dashboard.py -v && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: PASS everywhere. Run `uv run ruff format .` if the format check fails, then re-run.

- [ ] **Step 5: Commit**

```bash
git add api/app/routes/assets.py api/app/routes/dashboard.py api/app/main.py api/tests/test_assets_dashboard.py
git commit -m "feat(api): assets with open findings, dashboard numbers"
```

---

### Task 8: Nuclei plugin

**Files:**
- Create: `plugins/projectdiscovery.nuclei/plugin.yaml`, `Dockerfile`, `adapter.py`, `fixtures/output.jsonl`
- Modify: `docker-compose.yml` (service `plugin-nuclei`)
- Modify: `api/tests/test_adapters.py`

**Interfaces:**
- Consumes: SDK `INPUT`, `TARGETS`, `CONFIG`, `emit`, `progress`, `run_tool` (Task 2); finding event fields (Task 2).
- Produces: plugin `projectdiscovery.nuclei`; `adapter.command(config: dict, rate_limit: int) -> list[str]`; constants `HARD_TAGS`, `HARD_TYPES`.

- [ ] **Step 1: Pick and verify versions.** Find the latest releases and their checksums:

```bash
gh release view -R projectdiscovery/nuclei --json tagName,assets -q '.tagName'
gh release view -R projectdiscovery/nuclei-templates --json tagName -q '.tagName'
```

For nuclei vX.Y.Z download `nuclei_X.Y.Z_checksums.txt` from that release and copy the SHA-256 of `nuclei_X.Y.Z_linux_amd64.zip` and `..._linux_arm64.zip`. For templates vA.B.C compute:

```bash
curl -sL https://github.com/projectdiscovery/nuclei-templates/archive/refs/tags/vA.B.C.tar.gz | sha256sum
```

Use these exact values below wherever `X.Y.Z`, `A.B.C` and `<sha…>` appear.

- [ ] **Step 2: Write the failing adapter tests** — in `api/tests/test_adapters.py` add to `CASES`:

```python
    "projectdiscovery.nuclei": ({"type": "url", "value": "http://testbed.nyx-lab.test"}, {"finding"}),
```

and append:

```python
def _nuclei():
    import importlib.util

    sys.path.insert(0, str(ROOT / "sdk"))
    spec = importlib.util.spec_from_file_location("nuclei_adapter", ROOT / "projectdiscovery.nuclei" / "adapter.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # main() only runs under __main__
    return mod


@pytest.mark.parametrize(
    "config", [{}, {"severity": ["critical"]}, {"exclude_tags": ["cve"]}, {"exclude_tags": ["dos"], "severity": ["info"]}]
)
def test_nuclei_hard_exclusions_survive_any_config(config):
    m = _nuclei()
    cmd = m.command(config, 10)
    tags = cmd[cmd.index("-etags") + 1].split(",")
    assert set(m.HARD_TAGS) <= set(tags)
    assert cmd[cmd.index("-exclude-type") + 1] == ",".join(m.HARD_TYPES)
    assert "-no-interactsh" in cmd and "-duc" in cmd
    assert cmd[cmd.index("-severity") + 1] == ",".join(config.get("severity", ["low", "medium", "high", "critical"]))


def test_nuclei_fixture_maps_fields():
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "sdk"),
        "NYX_FIXTURE": str(ROOT / "projectdiscovery.nuclei" / "fixtures" / "output.jsonl"),
        "NYX_INPUT": json.dumps(
            {"run_id": "r1", "plugin_id": "projectdiscovery.nuclei", "plugin_version": "x",
             "targets": [{"type": "url", "value": "http://testbed.nyx-lab.test"}],
             "target": {"type": "url", "value": "http://testbed.nyx-lab.test"}, "config": {}, "rate_limit": 10}
        ),
    }
    out = subprocess.run(
        [sys.executable, str(ROOT / "projectdiscovery.nuclei" / "adapter.py")], env=env, capture_output=True, text=True, check=True
    )
    found = [json.loads(line) for line in out.stdout.splitlines() if '"finding"' in line]
    git = next(e for e in found if e["data"]["template_id"] == "git-config")
    assert git["data"]["matched_at"] == "http://testbed.nyx-lab.test/.git/config"
    assert git["data"]["severity"] in ("low", "medium", "high", "critical", "info")
    assert git["target"] == {"type": "url", "value": "http://testbed.nyx-lab.test"}
    full = next(e for e in found if e["data"].get("cve"))
    assert full["data"]["cve"] == ["CVE-2021-41773"] and full["data"]["references"] and full["data"]["curl"]
```

- [ ] **Step 3: Run to verify failure**

Run: `cd api && uv run pytest tests/test_adapters.py -k nuclei -v`
Expected: FAIL — adapter file missing.

- [ ] **Step 4: Manifest** `plugins/projectdiscovery.nuclei/plugin.yaml`:

```yaml
api_version: platform.security/v1
kind: ScannerPlugin
metadata:
  id: projectdiscovery.nuclei
  name: Nuclei
  publisher: ProjectDiscovery
  version: X.Y.Z
  license: MIT
  description: "Checks live web services against nuclei-templates vA.B.C. Safe checks only: no DoS, fuzzing, brute force, headless or code templates, no out-of-band callbacks."
runtime:
  type: oci
  image: nyx-plugin/nuclei:X.Y.Z
classification:
  categories: [vulnerability, web]
  risk_level: safe_active
  trust_level: verified
io:
  accepts: [url]
  produces: [finding, log, progress]
resources:
  cpu: 1.0
  memory_mb: 512
  timeout_seconds: 1800
permissions:
  network: target_scope
  filesystem: temporary
  raw_socket: false
  host_mounts: false
  docker_socket: false
limits:
  default_rate_limit: 10
config_schema:
  type: object
  additionalProperties: false
  properties:
    severity:
      type: array
      items: {enum: [info, low, medium, high, critical]}
      minItems: 1
      uniqueItems: true
      default: [low, medium, high, critical]
    exclude_tags:
      type: array
      items: {type: string, pattern: "^[a-z0-9-]{1,40}$"}
      maxItems: 50
      default: []
```

Check it validates: `cd api && uv run python -c "from pathlib import Path; from app.contract import load_manifest, validate_manifest; print(validate_manifest(load_manifest(Path('../plugins/projectdiscovery.nuclei/plugin.yaml'))))"` → `[]`.

- [ ] **Step 5: Adapter** `plugins/projectdiscovery.nuclei/adapter.py`:

```python
"""Nuclei -> NYX events: every template hit becomes a finding.

Templates are baked into the image at a pinned version; nothing is downloaded at run time.
"""

from nyx_plugin import CONFIG, INPUT, TARGETS, emit, progress, run_tool

# Never configurable: checks that can hurt a target, run code, or call out of scope.
HARD_TAGS = ("dos", "fuzz", "fuzzing", "intrusive", "brute-force", "bruteforce")
HARD_TYPES = ("headless", "code", "javascript")
DEFAULT_SEVERITY = ["low", "medium", "high", "critical"]
SEVERITIES = {"critical", "high", "medium", "low", "info"}


def command(config: dict, rate_limit: int) -> list[str]:
    tags = list(dict.fromkeys([*HARD_TAGS, *config.get("exclude_tags", [])]))
    return [
        "nuclei", "-jsonl", "-silent", "-duc", "-no-interactsh",
        "-t", "/templates", "-ud", "/templates",
        "-rl", str(rate_limit),
        "-severity", ",".join(config.get("severity", DEFAULT_SEVERITY)),
        "-etags", ",".join(tags),
        "-exclude-type", ",".join(HARD_TYPES),
    ]


def _list(value) -> list[str]:
    if value is None:
        return []
    return [str(v) for v in (value if isinstance(value, list) else [value])]


def main() -> None:
    urls = [t["value"] for t in TARGETS]
    progress(0)
    for rec in run_tool(command(CONFIG, INPUT.get("rate_limit", 10)), stdin="\n".join(urls) + "\n"):
        info = rec.get("info") or {}
        cls = info.get("classification") or {}
        severity = str(info.get("severity", "info")).lower()
        data = {
            "template_id": str(rec.get("template-id", "")),
            "title": str(info.get("name") or rec.get("template-id") or "Nuclei finding"),
            "severity": severity if severity in SEVERITIES else "info",
            "matched_at": str(rec.get("matched-at") or rec.get("host") or ""),
            "description": str(info.get("description") or ""),
            "references": _list(info.get("reference")),
            "cve": _list(cls.get("cve-id")),
            "cwe": _list(cls.get("cwe-id")),
            "extracted": _list(rec.get("extracted-results")),
            "curl": str(rec.get("curl-command") or ""),
            "matcher": str(rec.get("matcher-name") or ""),
        }
        source = rec.get("url") or rec.get("host") or urls[0]
        target = next((u for u in urls if source.startswith(u)), source)
        # title and severity are never empty, so dropping empty fields keeps the required ones
        emit("finding", {k: v for k, v in data.items() if v not in ("", [])}, target={"type": "url", "value": target})
    progress(100)


if __name__ == "__main__":
    main()
```

Run `cd api && uv run ruff format ../plugins` if CI formats plugins; otherwise keep within the repo line length by hand.

- [ ] **Step 6: Fixture** `plugins/projectdiscovery.nuclei/fixtures/output.jsonl` — two lines in Nuclei's JSONL format (one per line, no wrapping):

```json
{"template-id":"git-config","info":{"name":"Git Configuration - Detect","severity":"medium","description":"Git configuration was detected via the pattern /.git/config and log file on passed URLs.","reference":["https://github.com/arthaud/git-dumper"],"classification":{"cwe-id":["cwe-200"]}},"type":"http","host":"testbed.nyx-lab.test","url":"http://testbed.nyx-lab.test","matched-at":"http://testbed.nyx-lab.test/.git/config","extracted-results":null,"matcher-name":"","curl-command":"curl -X 'GET' 'http://testbed.nyx-lab.test/.git/config'","timestamp":"2026-10-11T12:00:00Z","matcher-status":true}
{"template-id":"CVE-2021-41773","info":{"name":"Apache 2.4.49 - Path Traversal and Remote Code Execution","severity":"high","description":"A flaw was found in a change made to path normalization in Apache HTTP Server 2.4.49.","reference":["https://nvd.nist.gov/vuln/detail/CVE-2021-41773"],"classification":{"cve-id":["CVE-2021-41773"],"cwe-id":["cwe-22"]}},"type":"http","host":"testbed.nyx-lab.test","url":"http://testbed.nyx-lab.test","matched-at":"http://testbed.nyx-lab.test/cgi-bin/.%2e/.%2e/etc/passwd","extracted-results":["root:x:0:0"],"matcher-name":"","curl-command":"curl -X 'GET' 'http://testbed.nyx-lab.test/cgi-bin/.%2e/.%2e/etc/passwd'","timestamp":"2026-10-11T12:00:01Z","matcher-status":true}
```

The second record is synthetic (the testbed is nginx): it exists to exercise every optional field. Replace the first one with a real recording after Task 9's manual run if its fields differ.

- [ ] **Step 7: Dockerfile** `plugins/projectdiscovery.nuclei/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
# Context: plugins/   (docker compose --profile plugins build)
FROM python:3.12-slim AS fetch
ARG TARGETARCH
ARG VERSION=X.Y.Z
ARG SHA256_amd64=<sha of nuclei_X.Y.Z_linux_amd64.zip>
ARG SHA256_arm64=<sha of nuclei_X.Y.Z_linux_arm64.zip>
ARG TEMPLATES=A.B.C
ARG TEMPLATES_SHA256=<sha of vA.B.C.tar.gz>
ADD https://github.com/projectdiscovery/nuclei/releases/download/v${VERSION}/nuclei_${VERSION}_linux_${TARGETARCH}.zip /tmp/tool.zip
ADD https://github.com/projectdiscovery/nuclei-templates/archive/refs/tags/v${TEMPLATES}.tar.gz /tmp/templates.tar.gz
RUN eval "sum=\$SHA256_${TARGETARCH}" && echo "$sum  /tmp/tool.zip" | sha256sum -c - \
 && echo "$TEMPLATES_SHA256  /tmp/templates.tar.gz" | sha256sum -c - \
 && python -m zipfile -e /tmp/tool.zip /tmp/tool && chmod 0755 /tmp/tool/nuclei \
 && mkdir /templates && tar -xzf /tmp/templates.tar.gz -C /templates --strip-components=1

FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY --from=fetch /tmp/tool/nuclei /usr/local/bin/nuclei
COPY --from=fetch /templates /templates
COPY sdk/nyx_plugin.py projectdiscovery.nuclei/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]
```

(`ADD` of a `.tar.gz` URL does not auto-extract; only local archives are. `/templates` stays root-owned and read-only for uid 65534.)

- [ ] **Step 8: Compose** — in `docker-compose.yml` after `plugin-httpx`:

```yaml
  plugin-nuclei:
    profiles: ["plugins"]
    image: nyx-plugin/nuclei:X.Y.Z
    build: {context: ./plugins, dockerfile: projectdiscovery.nuclei/Dockerfile}
```

- [ ] **Step 9: Run adapter tests and build the image**

Run: `cd api && uv run pytest tests/test_adapters.py -v`
Expected: PASS.
Run: `docker compose --profile plugins build plugin-nuclei && docker run --rm --entrypoint nuclei nyx-plugin/nuclei:X.Y.Z -version`
Expected: build succeeds (checksums pass), `nuclei -version` prints `X.Y.Z`.

- [ ] **Step 10: Commit**

```bash
git add plugins/projectdiscovery.nuclei docker-compose.yml api/tests/test_adapters.py
git commit -m "feat(plugins): nuclei with pinned templates, safe-only exclusions and severity config"
```

---

### Task 9: Lab testbed with something to find

**Files:**
- Create: `lab/testbed/default.conf`, `lab/testbed/html/index.html`, `lab/testbed/html/git-config`, `lab/testbed/html/env.txt`, `lab/testbed/html/files/readme.txt`
- Modify: `docker-compose.yml` (`testbed` volumes)

**Interfaces:**
- Produces: `http://testbed.nyx-lab.test/.git/config`, `/.env`, `/files/` (autoindex) on the `nyx-plugins` network.

Git refuses paths containing a `.git` component and the repo ignores `.env`, so the files are stored under plain names and nginx maps the URLs.

- [ ] **Step 1: nginx config** `lab/testbed/default.conf`:

```nginx
# NYX lab target: deliberate, harmless misconfigurations for Nuclei to find. Every value is fake.
server {
    listen 80 default_server;
    server_name testbed.nyx-lab.test;
    root /usr/share/nginx/html;
    server_tokens on;

    location = /.git/config { default_type text/plain; alias /usr/share/nginx/html/git-config; }
    location = /.env { default_type text/plain; alias /usr/share/nginx/html/env.txt; }
    location /files/ { autoindex on; }
}
```

- [ ] **Step 2: Files**

`lab/testbed/html/index.html`:

```html
<!doctype html><title>NYX lab</title><h1>NYX lab testbed</h1><p>Deliberately misconfigured. Local use only.</p>
```

`lab/testbed/html/git-config`:

```ini
[core]
	repositoryformatversion = 0
	filemode = true
	bare = false
	logallrefupdates = true
[remote "origin"]
	url = https://git.nyx-lab.test/lab/testbed.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
	remote = origin
	merge = refs/heads/main
```

`lab/testbed/html/env.txt`:

```
APP_ENV=production
APP_KEY=NYX_LAB_FAKE_APP_KEY
DB_HOST=db.nyx-lab.test
DB_USERNAME=nyx_lab
DB_PASSWORD=NYX_LAB_FAKE_PASSWORD
MAIL_PASSWORD=NYX_LAB_FAKE_MAIL
```

`lab/testbed/html/files/readme.txt`:

```
Nothing to see here. This directory listing is on purpose.
```

- [ ] **Step 3: Mount it** — `testbed` in `docker-compose.yml`:

```yaml
  testbed:
    # Local lab target: add scope "nyx-lab.test" (active allowed) and scan testbed.nyx-lab.test.
    # lab/testbed serves a fake /.git/config, /.env and a directory listing for Nuclei to find.
    profiles: ["lab"]
    image: nginx:1.27-alpine
    volumes:
      - ./lab/testbed/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./lab/testbed/html:/usr/share/nginx/html:ro
    networks:
      nyx-plugins:
        aliases: [testbed.nyx-lab.test]
```

- [ ] **Step 4: Check it serves**

Run: `docker compose --profile lab up -d testbed && docker run --rm --network nyx-plugins curlimages/curl:8.10.1 -s http://testbed.nyx-lab.test/.git/config | head -2 && docker run --rm --network nyx-plugins curlimages/curl:8.10.1 -s http://testbed.nyx-lab.test/files/`
Expected: `[core]` line, then an nginx "Index of /files/" page.

- [ ] **Step 5: Commit**

```bash
git add lab docker-compose.yml
git commit -m "chore: lab testbed with a fake exposed git config, .env and directory listing"
```

---

## Web tasks (10–14)

The web app has no unit-test runner; each web task's gate is `pnpm lint` and `pnpm build` (type-checks) plus the listed manual check against the running stack (`docker compose up --build`, or `pnpm dev --port 3001` with the API from the README's "Developing without containers"). Before writing pages, skim `web/node_modules/next/dist/docs/` for `page.tsx` props (`PageProps<...>`, async `params`/`searchParams`) — the existing pages show the pattern.

### Task 10: Web data layer, findings screens

**Files:**
- Modify: `web/src/lib/types.ts`, `web/src/lib/api/client.ts`, `web/src/lib/api/hooks.ts`
- Delete: `web/src/lib/mocks/` (whole directory)
- Create: `web/src/components/findings/severity-badge.tsx`, `finding-status.tsx`, `findings-table.tsx`, `finding-detail.tsx`
- Modify: `web/src/app/app/findings/page.tsx`, `web/src/app/app/findings/[findingId]/page.tsx`, `web/src/app/app/scans/[scanId]/findings/page.tsx`, `web/src/components/scans/scan-overview.tsx`

**Interfaces:**
- Consumes: API from Tasks 4–7.
- Produces (used by Tasks 11–13):
  - types `Severity`, `severities`, `FindingStatus`, `findingStatuses`, `AssetRef`, `FindingRow`, `FindingDetail`, `Page<T>`, `FindingFilters`, `Asset`, `AssetDetail`, `Dashboard`, `Profile`, `ProfileInput`, `JsonSchema`; `Scan` gains `plugin_config`, `profile_id`; `ScanDetail` gains `findings_by_severity`; `ScanInput` gains optional `profile_id`, `plugin_config`, and `plugin_ids`/`max_depth` become optional; `PluginManifest` gains `config_schema?: JsonSchema`.
  - `api.listFindings(f, after)`, `api.getFinding(id)`, `api.reviewFinding(id, body)`, `api.listAssets(f, after)`, `api.getAsset(id)`, `api.dashboard()`, `api.listProfiles()`, `api.createProfile(body)`, `api.updateProfile(id, body)`, `api.deleteProfile(id)`.
  - hooks `useFindings(f)`, `useFinding(id)`, `useAssets(f)`, `useAsset(id | null)`, `useDashboard()`, `useProfiles()` (`useFindings`/`useAssets` are `useInfiniteQuery`).
  - components `SeverityBadge({ severity })`, `FindingStatusText({ status })`, `FindingsTable({ scanId? })`, `FindingDetail({ id })`, helper `when(iso: string): string` exported from `findings-table.tsx`.

- [ ] **Step 1: Types** — in `web/src/lib/types.ts` delete `Finding` and `DiffState` (mock-only) and keep `Severity`. Add:

```ts
export const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
export type FindingStatus = "open" | "confirmed" | "false_positive" | "accepted_risk" | "fixed";
export const findingStatuses: FindingStatus[] = ["open", "confirmed", "false_positive", "accepted_risk", "fixed"];

export type Page<T> = { items: T[]; total: number };
export type AssetRef = { id: string; kind: string; value: string };
export type FindingRow = {
  id: string; title: string; severity: Severity; status: FindingStatus; plugin_id: string; template_id: string;
  matched_at: string; asset: AssetRef | null; first_seen: string; last_seen: string; occurrences: number;
};
export type FindingDetail = FindingRow & {
  data: Record<string, unknown>; status_note: string | null; status_by: string | null; status_at: string | null;
  occurrences_list: { scan_id: string; root_target: Target; run_id: string | null; event_seq: number | null; seen_at: string }[];
  raw: Record<string, unknown> | null;
};
export type FindingFilters = { severity?: Severity[]; status?: FindingStatus[]; plugin_id?: string; scan_id?: string; q?: string };

export type Asset = AssetRef & { data: Record<string, unknown>; first_seen: string; last_seen: string; open_findings: number };
export type AssetDetail = Asset & { findings: FindingRow[]; scans: Scan[] };

export type Dashboard = {
  open_by_severity: Record<Severity, number>; open_total: number; assets_total: number; assets_new_7d: number;
  findings_per_day: { date: string; count: number }[]; recent_scans: Scan[];
  top_assets: (AssetRef & { open_findings: number; worst_severity: Severity })[];
};

export type JsonSchema = { type?: string; enum?: unknown[]; items?: JsonSchema; properties?: Record<string, JsonSchema>; default?: unknown; [k: string]: unknown };
export type PluginConfig = Record<string, Record<string, unknown>>;
export type ProfileInput = { name: string; description: string; plugin_ids: string[]; plugin_config: PluginConfig; max_depth: number };
export type Profile = ProfileInput & { id: string; builtin: boolean; created_at: string; updated_at: string; available: boolean; unavailable: string[] };
```

Change `PluginManifest` to add `config_schema?: JsonSchema;`. Change `Scan` to add `plugin_config: PluginConfig; profile_id: string | null;`, `ScanDetail` to add `findings_by_severity: Partial<Record<Severity, number>>;`, and:

```ts
export type ScanInput = { target: Target; plugin_ids?: string[]; max_depth?: number; profile_id?: string; plugin_config?: PluginConfig };
```

(`Severity` and `PluginConfig` must be declared before use only for readability; TS hoists types.)

- [ ] **Step 2: Client** — in `web/src/lib/api/client.ts` remove the mocks import, `delay`, and the two mock findings lines; update the comment to "The only module that knows where data comes from." Update the type import list, then add:

```ts
type Query = Record<string, string | number | string[] | undefined>;
const qs = (params: Query) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
    s.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const text = s.toString();
  return text ? `?${text}` : "";
};
```

and in `api`:

```ts
  listFindings: (f: FindingFilters, after = 0) => call<Page<FindingRow>>(`/findings${qs({ ...f, after })}`),
  getFinding: (id: string) => call<FindingDetail>(`/findings/${id}`),
  reviewFinding: (id: string, body: { status: FindingStatus; note?: string }) => send<FindingDetail>("PATCH", `/findings/${id}`, body),
  listAssets: (f: { kind?: string; q?: string }, after = 0) => call<Page<Asset>>(`/assets${qs({ ...f, after })}`),
  getAsset: (id: string) => call<AssetDetail>(`/assets/${id}`),
  dashboard: () => call<Dashboard>("/dashboard"),
  listProfiles: () => call<Profile[]>("/profiles"),
  createProfile: (body: ProfileInput) => post<Profile>("/profiles", body),
  updateProfile: (id: string, body: Partial<ProfileInput>) => send<Profile>("PATCH", `/profiles/${id}`, body),
  deleteProfile: (id: string) => send<void>("DELETE", `/profiles/${id}`),
```

- [ ] **Step 3: Hooks** — in `web/src/lib/api/hooks.ts` import `useInfiniteQuery` and the new types, replace the two mock-backed findings hooks with:

```ts
const nextAfter = <T,>(last: Page<T>, pages: Page<T>[]) => {
  const loaded = pages.reduce((n, p) => n + p.items.length, 0);
  return loaded < last.total ? loaded : undefined;
};
export const useFindings = (f: FindingFilters) =>
  useInfiniteQuery({ queryKey: ["findings", f], queryFn: ({ pageParam }) => api.listFindings(f, pageParam), initialPageParam: 0, getNextPageParam: nextAfter });
export const useFinding = (id: string) => useQuery({ queryKey: ["findings", "one", id], queryFn: () => api.getFinding(id) });
export const useAssets = (f: { kind?: string; q?: string }) =>
  useInfiniteQuery({ queryKey: ["assets", f], queryFn: ({ pageParam }) => api.listAssets(f, pageParam), initialPageParam: 0, getNextPageParam: nextAfter });
export const useAsset = (id: string | null) => useQuery({ queryKey: ["assets", "one", id], queryFn: () => api.getAsset(id!), enabled: !!id });
export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 15000 });
export const useProfiles = () => useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
```

Delete `web/src/lib/mocks/`: `git rm -r web/src/lib/mocks`. Then `grep -rn "mocks" web/src` must print nothing.

- [ ] **Step 4: Badges** — `web/src/components/findings/severity-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const tone: Record<Severity, string> = {
  critical: "border-sev-critical/40 text-sev-critical",
  high: "border-sev-high/40 text-sev-high",
  medium: "border-sev-medium/40 text-sev-medium",
  low: "border-sev-low/40 text-sev-low",
  info: "border-sev-info/40 text-sev-info",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider", tone[severity])}>{severity}</span>;
}
```

`web/src/components/findings/finding-status.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { FindingStatus } from "@/lib/types";

export const statusLabel: Record<FindingStatus, string> = {
  open: "Open", confirmed: "Confirmed", false_positive: "False positive", accepted_risk: "Accepted risk", fixed: "Fixed",
};
const tone: Record<FindingStatus, string> = {
  open: "text-sev-high", confirmed: "text-sev-critical", false_positive: "text-subtle", accepted_risk: "text-muted-foreground", fixed: "text-sev-low",
};

export function FindingStatusText({ status }: { status: FindingStatus }) {
  return <span className={cn("text-xs", tone[status])}>{statusLabel[status]}</span>;
}
```

- [ ] **Step 5: Findings table** — `web/src/components/findings/findings-table.tsx`:

```tsx
"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FindingStatusText, statusLabel } from "@/components/findings/finding-status";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { useFindings, usePlugins } from "@/lib/api/hooks";
import { findingStatuses, severities, type FindingStatus, type Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

export const when = (iso: string) => new Date(iso).toLocaleString();
const ACTIVE: FindingStatus[] = ["open", "confirmed"];

export function FindingsTable({ scanId }: { scanId?: string }) {
  const [sev, setSev] = useState<Severity[]>([]);
  const [status, setStatus] = useState<string>("active");
  const [plugin, setPlugin] = useState("");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const { data: plugins } = usePlugins();
  const statuses = status === "active" ? ACTIVE : status === "all" ? [] : [status as FindingStatus];
  const { data, error, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useFindings({
    severity: sev, status: statuses, plugin_id: plugin || undefined, scan_id: scanId, q: query || undefined,
  });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const toggle = (s: Severity) => setSev(sev.includes(s) ? sev.filter((x) => x !== s) : [...sev, s]);
  const select = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {severities.map((s) => (
          <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={sev.includes(s)}
            className={cn("rounded-lg border px-2 py-1 text-xs", sev.includes(s) ? "border-border-strong bg-surface-2" : "border-border text-muted-foreground")}>
            {s}
          </button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={select}>
          <option value="active">Open and confirmed</option>
          <option value="all">Every status</option>
          {findingStatuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
        </select>
        <select value={plugin} onChange={(e) => setPlugin(e.target.value)} aria-label="Plugin" className={select}>
          <option value="">Every plugin</option>
          {(plugins ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, template, URL" aria-label="Search" className="max-w-xs" />
        <span className="ml-auto text-xs text-subtle">{total} findings</span>
      </div>
      {error && <p role="alert" className="text-sm text-sev-critical">{error.message}</p>}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading findings…</p> : !rows.length ? (
        <p className="text-sm text-muted-foreground">Nothing matches. {scanId ? "This scan reported no findings with these filters." : "Run a scan with Nuclei to get findings."}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-subtle">
              <tr>{["Severity", "Finding", "Where", "Plugin", "Status", "Last seen"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0 hover:bg-surface-1">
                  <td className="px-4 py-3"><SeverityBadge severity={f.severity} /></td>
                  <td className="px-4 py-3"><Link href={`/app/findings/${f.id}`} className="font-medium hover:underline">{f.title}</Link><p className="font-mono text-[11px] text-subtle">{f.template_id}</p></td>
                  <td className="max-w-80 truncate px-4 py-3 font-mono text-xs" title={f.matched_at}>{f.matched_at}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{f.plugin_id}</td>
                  <td className="px-4 py-3"><FindingStatusText status={f.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{when(f.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasNextPage && <div><Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage ? "Loading…" : "Load more"}</Button></div>}
    </div>
  );
}
```

- [ ] **Step 6: Finding detail** — `web/src/components/findings/finding-detail.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FindingStatusText, statusLabel } from "@/components/findings/finding-status";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { when } from "@/components/findings/findings-table";
import { api, ApiError } from "@/lib/api/client";
import { useFinding, useMe } from "@/lib/api/hooks";
import { findingStatuses, type FindingStatus } from "@/lib/types";

const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

export function FindingDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: f, error } = useFinding(id);
  const { data: me } = useMe();
  const [status, setStatus] = useState<FindingStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!f) return <p className="text-sm text-muted-foreground">Loading the finding…</p>;
  const canReview = me?.role === "admin" || me?.role === "analyst";
  const d = f.data;

  const save = async () => {
    setMsg("");
    try {
      await api.reviewFinding(id, { status: status ?? f.status, note: (note ?? f.status_note ?? "") || undefined });
      qc.invalidateQueries({ queryKey: ["findings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setMsg("Saved.");
    } catch (x) {
      setMsg(x instanceof ApiError ? x.message : "Something went wrong.");
    }
  };

  const section = "flex flex-col gap-2";
  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3"><SeverityBadge severity={f.severity} /><FindingStatusText status={f.status} /><span className="font-mono text-xs text-subtle">{f.plugin_id} · {f.template_id}</span></div>
        <h1 className="text-xl font-semibold tracking-tight">{f.title}</h1>
        <p className="break-all font-mono text-xs">{f.matched_at}</p>
        {f.asset && <p className="text-xs text-muted-foreground">On <Link href={`/app/assets?q=${encodeURIComponent(f.asset.value)}`} className="underline">{f.asset.value}</Link> · first seen {when(f.first_seen)} · last seen {when(f.last_seen)}</p>}
      </header>
      {typeof d.description === "string" && d.description && <section className={section}><h2 className="text-sm font-semibold">What it is</h2><p className="text-sm text-muted-foreground">{d.description}</p></section>}
      {(list(d.cve).length > 0 || list(d.cwe).length > 0) && <p className="font-mono text-xs">{[...list(d.cve), ...list(d.cwe)].join(" · ")}</p>}
      {list(d.references).length > 0 && (
        <section className={section}><h2 className="text-sm font-semibold">References</h2>
          <ul className="text-xs">{list(d.references).map((r) => <li key={r}><a href={r} target="_blank" rel="noreferrer noopener" className="break-all underline">{r}</a></li>)}</ul>
        </section>
      )}
      {list(d.extracted).length > 0 && <section className={section}><h2 className="text-sm font-semibold">Extracted</h2><pre className="overflow-x-auto rounded-lg border border-border p-3 font-mono text-xs">{list(d.extracted).join("\n")}</pre></section>}
      {typeof d.curl === "string" && d.curl && <section className={section}><h2 className="text-sm font-semibold">Reproduce</h2><pre className="overflow-x-auto rounded-lg border border-border p-3 font-mono text-xs">{d.curl}</pre></section>}
      <section className={section}>
        <h2 className="text-sm font-semibold">Review</h2>
        {f.status_at && <p className="text-xs text-subtle">Last changed {when(f.status_at)}{f.status_note ? ` — ${f.status_note}` : ""}</p>}
        {canReview ? (
          <div className="flex max-w-xl flex-col gap-2">
            <select value={status ?? f.status} onChange={(e) => setStatus(e.target.value as FindingStatus)} aria-label="Status" className="h-8 max-w-xs rounded-lg border border-input bg-transparent px-2 text-sm">
              {findingStatuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
            </select>
            <Textarea value={note ?? f.status_note ?? ""} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" maxLength={2000} aria-label="Note" />
            <div className="flex items-center gap-3"><Button onClick={save}>Save review</Button>{msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}</div>
          </div>
        ) : <p className="text-xs text-subtle">Viewers can't change the review.</p>}
      </section>
      <section className={section}>
        <h2 className="text-sm font-semibold">Seen in {f.occurrences_list.length} scan{f.occurrences_list.length === 1 ? "" : "s"}</h2>
        <ul className="rounded-lg border border-border text-xs">
          {f.occurrences_list.map((o) => (
            <li key={o.scan_id} className="flex gap-3 border-b border-border px-4 py-2 last:border-0">
              <Link href={`/app/scans/${o.scan_id}`} className="underline">{o.root_target.value}</Link><span className="ml-auto text-subtle">{when(o.seen_at)}</span>
            </li>
          ))}
        </ul>
      </section>
      {f.raw && <details><summary className="cursor-pointer text-sm font-semibold">Raw event</summary><pre className="mt-2 overflow-x-auto rounded-lg border border-border p-3 font-mono text-xs">{JSON.stringify(f.raw, null, 2)}</pre></details>}
    </div>
  );
}
```

(Check `web/src/components/ui/textarea.tsx` exports `Textarea`; it does in this repo.)

- [ ] **Step 7: Pages** — `web/src/app/app/findings/page.tsx`:

```tsx
import type { Metadata } from "next";
import { FindingsTable } from "@/components/findings/findings-table";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Findings" };

export default function Page() {
  return (
    <>
      <PageHeader title="Findings" description="Everything my scanners reported, once per issue, across every scan. Review it here." />
      <FindingsTable />
    </>
  );
}
```

`web/src/app/app/findings/[findingId]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { FindingDetail } from "@/components/findings/finding-detail";

export const metadata: Metadata = { title: "Finding" };

export default async function Page(props: PageProps<"/app/findings/[findingId]">) {
  const { findingId } = await props.params;
  return <FindingDetail id={findingId} />;
}
```

`web/src/app/app/scans/[scanId]/findings/page.tsx`:

```tsx
import type { Metadata } from "next";
import { FindingsTable } from "@/components/findings/findings-table";

export const metadata: Metadata = { title: "Scan findings" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/findings">) {
  const { scanId } = await props.params;
  return <FindingsTable scanId={scanId} />;
}
```

- [ ] **Step 8: Overview counters** — in `web/src/components/scans/scan-overview.tsx`, import `Link`, `SeverityBadge` and `severities`; add after the counters `<section>`:

```tsx
      <section className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-xs text-subtle">Findings</span>
        {severities.filter((s) => scan.findings_by_severity[s]).map((s) => (
          <span key={s} className="flex items-center gap-1.5"><SeverityBadge severity={s} /><span className="font-mono text-xs">{scan.findings_by_severity[s]}</span></span>
        ))}
        {!Object.keys(scan.findings_by_severity).length && <span className="text-xs text-muted-foreground">none yet</span>}
        <Link href={`/app/scans/${id}/findings`} className="text-xs underline">Open the list</Link>
      </section>
```

- [ ] **Step 9: Lint, build, check**

Run: `cd web && pnpm lint && pnpm build`
Expected: both succeed with no type errors.
Manual: with findings in the database (run Task 14's lab scan, or a Balanced scan once Task 13 is in), `/app/findings` lists them; filter chips, status select and search narrow the list; the detail page saves a review and the list shows the new status; `/app/scans/<id>/findings` shows only that scan's findings; a viewer sees no review form.

- [ ] **Step 10: Commit**

```bash
git add -A web/src
git commit -m "feat(web): findings list, detail with review, findings per scan; mocks removed"
```

---

### Task 11: Assets screen

**Files:**
- Create: `web/src/components/assets/assets-view.tsx`
- Modify: `web/src/app/app/assets/page.tsx`

**Interfaces:**
- Consumes: `useAssets`, `useAsset`, `Asset`, `AssetDetail` (Task 10); `SeverityBadge`, `FindingStatusText`, `when` (Task 10); `Dialog*` from `@/components/ui/dialog`; `StatusText` from `@/components/scans/scan-status`.
- Produces: `AssetsView({ initialQuery }: { initialQuery?: string })`.

- [ ] **Step 1: Component** — `web/src/components/assets/assets-view.tsx`:

```tsx
"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FindingStatusText } from "@/components/findings/finding-status";
import { when } from "@/components/findings/findings-table";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { StatusText } from "@/components/scans/scan-status";
import { useAsset, useAssets } from "@/lib/api/hooks";
import type { Asset } from "@/lib/types";

const KINDS = ["http_service", "subdomain", "domain", "ip"];

/** The attributes worth a glance in the table; the panel shows everything. */
function summary(a: Asset) {
  const d = a.data;
  const tech = Array.isArray(d.tech) ? d.tech.slice(0, 3).join(", ") : "";
  return [d.status_code, d.title, tech, d.ip].filter((v) => v !== undefined && v !== null && v !== "").map(String).join(" · ");
}

export function AssetsView({ initialQuery = "" }: { initialQuery?: string }) {
  const [kind, setKind] = useState("");
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState<string | null>(null);
  const query = useDeferredValue(q.trim());
  const { data, error, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useAssets({ kind: kind || undefined, q: query || undefined });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind" className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value="">Every kind</option>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search assets" className="max-w-xs" />
        <span className="ml-auto text-xs text-subtle">{data?.pages[0]?.total ?? 0} assets</span>
      </div>
      {error && <p role="alert" className="text-sm text-sev-critical">{error.message}</p>}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading assets…</p> : !rows.length ? (
        <p className="text-sm text-muted-foreground">No assets yet. Every host and service a scan finds lands here.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-subtle">
              <tr>{["Asset", "Kind", "Details", "Open findings", "First seen", "Last seen"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-1">
                  <td className="max-w-80 truncate px-4 py-3"><button type="button" onClick={() => setOpen(a.id)} className="font-mono text-xs hover:underline" title={a.value}>{a.value}</button></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{a.kind}</td>
                  <td className="max-w-72 truncate px-4 py-3 text-xs text-muted-foreground">{summary(a)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.open_findings || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{when(a.first_seen)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{when(a.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasNextPage && <div><Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage ? "Loading…" : "Load more"}</Button></div>}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">{open && <AssetPanel id={open} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function AssetPanel({ id }: { id: string }) {
  const { data: a, error } = useAsset(id);
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!a) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader><DialogTitle className="break-all font-mono text-sm">{a.value}</DialogTitle></DialogHeader>
      <p className="text-xs text-subtle">{a.kind} · first seen {when(a.first_seen)} · last seen {when(a.last_seen)}</p>
      <pre className="overflow-x-auto rounded-lg border border-border p-3 font-mono text-xs">{JSON.stringify(a.data, null, 2)}</pre>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Findings</h3>
        {!a.findings.length ? <p className="text-xs text-muted-foreground">None.</p> : (
          <ul className="rounded-lg border border-border text-sm">
            {a.findings.map((f) => (
              <li key={f.id} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
                <SeverityBadge severity={f.severity} /><Link href={`/app/findings/${f.id}`} className="hover:underline">{f.title}</Link><span className="ml-auto"><FindingStatusText status={f.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Scans</h3>
        <ul className="rounded-lg border border-border text-xs">
          {a.scans.map((s) => (
            <li key={s.id} className="flex gap-3 border-b border-border px-3 py-2 last:border-0">
              <Link href={`/app/scans/${s.id}`} className="underline">{s.root_target.value}</Link><StatusText status={s.status} /><span className="ml-auto text-subtle">{when(s.created_at)}</span>
            </li>
          ))}
          {!a.scans.length && <li className="px-3 py-2 text-muted-foreground">No scans recorded.</li>}
        </ul>
      </section>
    </div>
  );
}
```

Check the `Dialog` props in `web/src/components/ui/dialog.tsx` (Base UI: `open`, `onOpenChange(open, event)`); adjust the handler signature if the type differs.

- [ ] **Step 2: Page** — `web/src/app/app/assets/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AssetsView } from "@/components/assets/assets-view";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Assets" };

export default async function Page(props: PageProps<"/app/assets">) {
  const { q } = await props.searchParams;
  return (
    <>
      <PageHeader title="Assets" description="Every host, address and web service my scans have seen, with what is still open on it." />
      <AssetsView initialQuery={typeof q === "string" ? q : ""} />
    </>
  );
}
```

- [ ] **Step 3: Lint, build, check**

Run: `cd web && pnpm lint && pnpm build`
Expected: success.
Manual: `/app/assets` lists assets with open counts; kind filter and search work; clicking a value opens the panel with data, findings and scans; the asset link on a finding page opens `/app/assets?q=…` pre-filtered.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/assets web/src/app/app/assets/page.tsx
git commit -m "feat(web): assets table with an asset panel"
```

---

### Task 12: Dashboard

**Files:**
- Create: `web/src/components/dashboard/dashboard-view.tsx`
- Modify: `web/src/app/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useDashboard`, `Dashboard`, `severities` (Task 10); `SeverityBadge`; `StatusText`.
- Produces: `DashboardView()`.

- [ ] **Step 1: Component** — `web/src/components/dashboard/dashboard-view.tsx`:

```tsx
"use client";

import Link from "next/link";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { StatusText } from "@/components/scans/scan-status";
import { useDashboard } from "@/lib/api/hooks";
import { severities, type Severity } from "@/lib/types";

const fill: Record<Severity, string> = {
  critical: "bg-sev-critical", high: "bg-sev-high", medium: "bg-sev-medium", low: "bg-sev-low", info: "bg-sev-info",
};

function Tile({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = <><p className="text-xs text-subtle">{label}</p><p className="mt-1 font-mono text-2xl">{value}</p></>;
  return href ? <Link href={href} className="rounded-lg border border-border p-4 hover:bg-surface-1">{body}</Link> : <div className="rounded-lg border border-border p-4">{body}</div>;
}

function Sparkline({ points }: { points: { date: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const w = 300, h = 60, step = w / Math.max(1, points.length - 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - (p.count / max) * (h - 4) - 2).toFixed(1)}`).join(" ");
  const total = points.reduce((n, p) => n + p.count, 0);
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" role="img" aria-label={`${total} new findings in the last 30 days`} preserveAspectRatio="none">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-subtle"><span>{points[0]?.date}</span><span>{total} new in 30 days</span><span>{points.at(-1)?.date}</span></figcaption>
    </figure>
  );
}

export function DashboardView() {
  const { data: d, error } = useDashboard();
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const sevTotal = severities.reduce((n, s) => n + d.open_by_severity[s], 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Open critical + high" value={d.open_by_severity.critical + d.open_by_severity.high} href="/app/findings" />
        <Tile label="Open findings" value={d.open_total} href="/app/findings" />
        <Tile label="Assets" value={d.assets_total} href="/app/assets" />
        <Tile label="New assets, 7 days" value={d.assets_new_7d} href="/app/assets" />
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-semibold">Open by severity</h2>
          {sevTotal ? (
            <div className="flex h-2.5 overflow-hidden rounded-full" role="img" aria-label={severities.map((s) => `${s} ${d.open_by_severity[s]}`).join(", ")}>
              {severities.map((s) => d.open_by_severity[s] > 0 && <span key={s} className={fill[s]} style={{ width: `${(d.open_by_severity[s] / sevTotal) * 100}%` }} />)}
            </div>
          ) : <p className="text-xs text-muted-foreground">Nothing open.</p>}
          <ul className="mt-3 flex flex-wrap gap-3">{severities.map((s) => <li key={s} className="flex items-center gap-1.5"><SeverityBadge severity={s} /><span className="font-mono text-xs">{d.open_by_severity[s]}</span></li>)}</ul>
        </div>
        <div className="rounded-lg border border-border p-4"><h2 className="mb-3 text-sm font-semibold">New findings per day</h2><Sparkline points={d.findings_per_day} /></div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold">Recent scans</h2>
          <ul className="rounded-lg border border-border text-sm">
            {d.recent_scans.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <Link href={`/app/scans/${s.id}`} className="font-medium hover:underline">{s.root_target.value}</Link><StatusText status={s.status} />
                <span className="ml-auto text-xs text-subtle">{new Date(s.created_at).toLocaleString()}</span>
              </li>
            ))}
            {!d.recent_scans.length && <li className="px-4 py-2.5 text-xs text-muted-foreground">No scans yet. <Link href="/app/scans/new" className="underline">Start one.</Link></li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Assets with the most open findings</h2>
          <ul className="rounded-lg border border-border text-sm">
            {d.top_assets.map((a) => (
              <li key={a.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <SeverityBadge severity={a.worst_severity} />
                <Link href={`/app/assets?q=${encodeURIComponent(a.value)}`} className="truncate font-mono text-xs hover:underline">{a.value}</Link>
                <span className="ml-auto font-mono text-xs">{a.open_findings}</span>
              </li>
            ))}
            {!d.top_assets.length && <li className="px-4 py-2.5 text-xs text-muted-foreground">No open findings on any asset.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
```

If `text-brand` is not a valid utility, use `text-foreground`; the tokens live in `web/src/app/globals.css` (`--color-brand` exists).

- [ ] **Step 2: Page** — `web/src/app/app/dashboard/page.tsx`:

```tsx
import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <>
      <PageHeader title="Dashboard" description="What is open, what is new, and where it sits." />
      <DashboardView />
    </>
  );
}
```

- [ ] **Step 3: Lint, build, check**

Run: `cd web && pnpm lint && pnpm build`
Expected: success.
Manual: on an empty database the dashboard shows zeros, "Nothing open." and a flat line; after a lab scan the tiles, severity bar, sparkline, recent scans and top assets fill in; tiles link to Findings/Assets. Check both light and dark themes.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/dashboard web/src/app/app/dashboard/page.tsx
git commit -m "feat(web): dashboard from live numbers"
```

---

### Task 13: Profiles screen and profiles on New scan

**Files:**
- Create: `web/src/components/profiles/config-fields.tsx`, `profile-form.tsx`, `profiles-view.tsx`
- Modify: `web/src/app/app/profiles/page.tsx`, `web/src/app/app/scans/new/page.tsx`, `web/src/components/scans/new-scan-form.tsx`

**Interfaces:**
- Consumes: `useProfiles`, `usePlugins`, `usePlugin`, `useMe`, `api.createProfile/updateProfile/deleteProfile`, `Profile`, `ProfileInput`, `PluginConfig`, `JsonSchema` (Task 10); `RiskBadge`; `Dialog*`.
- Produces: `ConfigFields({ pluginId, value, onChange })`, `ProfileForm({ initial, mode, onDone })`, `ProfilesView()`, `NewScanForm({ initialProfile })`.

- [ ] **Step 1: Config fields** — `web/src/components/profiles/config-fields.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePlugin } from "@/lib/api/hooks";
import type { JsonSchema } from "@/lib/types";

type Value = Record<string, unknown>;

/** A form for one plugin's config, generated from its manifest's config_schema. */
export function ConfigFields({ pluginId, value, onChange }: { pluginId: string; value: Value; onChange: (v: Value) => void }) {
  const { data: plugin } = usePlugin(pluginId);
  const props = plugin?.manifest.config_schema?.properties ?? {};
  const names = Object.keys(props);
  if (!plugin || !names.length) return null;
  const simple = names.every((n) => kindOf(props[n]) !== "json");
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold">{plugin.name} settings</legend>
      {simple ? names.map((n) => <Field key={n} name={n} schema={props[n]} value={value[n]} onChange={(v) => onChange(set(value, n, v))} />)
        : <JsonField value={value} onChange={onChange} />}
    </fieldset>
  );
}

function kindOf(s: JsonSchema): "choices" | "strings" | "json" {
  if (s.type === "array" && s.items?.enum) return "choices";
  if (s.type === "array" && s.items?.type === "string") return "strings";
  return "json";
}

function set(value: Value, name: string, v: unknown): Value {
  const next = { ...value };
  if (v === undefined) delete next[name];
  else next[name] = v;
  return next;
}

function Field({ name, schema, value, onChange }: { name: string; schema: JsonSchema; value: unknown; onChange: (v: unknown) => void }) {
  const current = (Array.isArray(value) ? value : Array.isArray(schema.default) ? schema.default : []) as string[];
  if (kindOf(schema) === "choices") {
    const options = (schema.items?.enum ?? []).map(String);
    const toggle = (o: string) => {
      const next = current.includes(o) ? current.filter((x) => x !== o) : [...current, o];
      onChange(options.filter((x) => next.includes(x)));
    };
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">{name}</span>
        <div className="flex flex-wrap gap-3">{options.map((o) => <label key={o} className="flex items-center gap-1.5"><input type="checkbox" checked={current.includes(o)} onChange={() => toggle(o)} />{o}</label>)}</div>
      </div>
    );
  }
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs text-muted-foreground">{name} (comma-separated)</span>
      <Input defaultValue={current.join(", ")} onChange={(e) => {
        const items = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
        onChange(items.length ? items : undefined);
      }} />
    </label>
  );
}

function JsonField({ value, onChange }: { value: Value; onChange: (v: Value) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <Textarea value={text} aria-invalid={bad} className="font-mono text-xs" onChange={(e) => {
      setText(e.target.value);
      try { onChange(JSON.parse(e.target.value || "{}")); setBad(false); } catch { setBad(true); }
    }} />
  );
}
```

- [ ] **Step 2: Profile form** — `web/src/components/profiles/profile-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { ConfigFields } from "@/components/profiles/config-fields";
import { api, ApiError } from "@/lib/api/client";
import { usePlugins } from "@/lib/api/hooks";
import type { Profile, ProfileInput } from "@/lib/types";

export function ProfileForm({ initial, mode, onDone }: { initial?: Profile; mode: "create" | "edit" | "duplicate"; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: plugins } = usePlugins();
  const [form, setForm] = useState<ProfileInput>({
    name: mode === "duplicate" && initial ? `${initial.name} copy` : initial?.name ?? "",
    description: initial?.description ?? "",
    plugin_ids: initial?.plugin_ids ?? [],
    plugin_config: initial?.plugin_config ?? {},
    max_depth: initial?.max_depth ?? 3,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const choosable = (plugins ?? []).filter((p) => p.risk_level !== "intrusive");

  const toggle = (id: string) => {
    const on = form.plugin_ids.includes(id);
    const plugin_config = { ...form.plugin_config };
    if (on) delete plugin_config[id];
    setForm({ ...form, plugin_ids: on ? form.plugin_ids.filter((x) => x !== id) : [...form.plugin_ids, id], plugin_config });
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "edit" && initial) await api.updateProfile(initial.id, form);
      else await api.createProfile(form);
      qc.invalidateQueries({ queryKey: ["profiles"] });
      onDone();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm"><span className="font-semibold">Name</span>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required /></label>
      <label className="flex flex-col gap-1.5 text-sm"><span className="font-semibold">Description</span>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={2000} /></label>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Plugins</legend>
        <ul className="flex flex-col gap-1.5">
          {choosable.map((p) => (
            <li key={p.id}><label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={form.plugin_ids.includes(p.id)} onChange={() => toggle(p.id)} />
              <span className="font-medium">{p.name}</span><RiskBadge risk={p.risk_level} />
              {(!p.enabled || !p.digest) && <span className="text-xs text-subtle">not runnable now</span>}
            </label></li>
          ))}
        </ul>
      </fieldset>
      {form.plugin_ids.map((id) => (
        <ConfigFields key={id} pluginId={id} value={form.plugin_config[id] ?? {}} onChange={(v) => {
          const plugin_config = { ...form.plugin_config };
          if (Object.keys(v).length) plugin_config[id] = v;
          else delete plugin_config[id];
          setForm({ ...form, plugin_config });
        }} />
      ))}
      <label className="flex flex-col gap-1.5 text-sm"><span className="font-semibold">Depth</span>
        <select value={form.max_depth} onChange={(e) => setForm({ ...form, max_depth: Number(e.target.value) })} className="h-8 max-w-xs rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value={1}>1 · only the target</option><option value={2}>2 · the target and what it reveals</option><option value={3}>3 · one more hop</option>
        </select></label>
      {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy || !form.name.trim() || !form.plugin_ids.length}>{busy ? "Saving…" : "Save profile"}</Button>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}
```

- [ ] **Step 3: Profiles view** — `web/src/components/profiles/profiles-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfileForm } from "@/components/profiles/profile-form";
import { api, ApiError } from "@/lib/api/client";
import { useMe, useProfiles } from "@/lib/api/hooks";
import type { Profile } from "@/lib/types";

type Editing = { mode: "create" | "edit" | "duplicate"; profile?: Profile } | null;

const configLine = (p: Profile) =>
  Object.entries(p.plugin_config).map(([id, c]) => `${id.split(".").at(-1)}: ${Object.entries(c).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("/") : String(v)}`).join(", ")}`).join(" · ");

export function ProfilesView() {
  const qc = useQueryClient();
  const { data: profiles, error } = useProfiles();
  const { data: me } = useMe();
  const [editing, setEditing] = useState<Editing>(null);
  const [err, setErr] = useState("");
  const canWrite = me?.role === "admin" || me?.role === "analyst";

  const remove = async (p: Profile) => {
    if (!window.confirm(`Delete the profile "${p.name}"? Scans that used it keep their settings.`)) return;
    setErr("");
    try { await api.deleteProfile(p.id); qc.invalidateQueries({ queryKey: ["profiles"] }); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Something went wrong."); }
  };

  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  return (
    <div className="flex flex-col gap-4">
      {canWrite && <div><Button onClick={() => setEditing({ mode: "create" })}>New profile</Button></div>}
      {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {(profiles ?? []).map((p) => (
          <li key={p.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              {p.builtin && <Lock className="size-3.5 text-subtle" aria-label="Built-in, read-only" />}
              <h2 className="font-semibold">{p.name}</h2><span className="ml-auto font-mono text-xs text-subtle">depth {p.max_depth}</span>
            </div>
            {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            <p className="font-mono text-xs">{p.plugin_ids.join(", ")}</p>
            {configLine(p) && <p className="text-xs text-subtle">{configLine(p)}</p>}
            {!p.available && <p className="text-xs text-sev-high">Not runnable now: {p.unavailable.join(", ")} is disabled or not built.</p>}
            <div className="mt-auto flex flex-wrap gap-2">
              {p.available && <Link href={`/app/scans/new?profile=${p.id}`} className={buttonVariants({ size: "sm" })}>Scan with this profile</Link>}
              {canWrite && <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "duplicate", profile: p })}>Duplicate</Button>}
              {canWrite && !p.builtin && <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "edit", profile: p })}>Edit</Button>}
              {canWrite && !p.builtin && <Button size="sm" variant="outline" onClick={() => remove(p)}>Delete</Button>}
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing?.mode === "edit" ? "Edit profile" : "New profile"}</DialogTitle></DialogHeader>
          {editing && <ProfileForm initial={editing.profile} mode={editing.mode} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Check `buttonVariants`/`Button` support `size: "sm"` in `web/src/components/ui/button.tsx`; use the closest existing size if not.

- [ ] **Step 4: Profiles page** — `web/src/app/app/profiles/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ProfilesView } from "@/components/profiles/profiles-view";

export const metadata: Metadata = { title: "Scan Profiles" };

export default function Page() {
  return (
    <>
      <PageHeader title="Scan profiles" description="Saved sets of plugins, settings and depth. Quick and Balanced are built in and stay the same, so their results are comparable." />
      <ProfilesView />
    </>
  );
}
```

- [ ] **Step 5: New scan with profiles** — `web/src/app/app/scans/new/page.tsx`:

```tsx
export default async function Page(props: PageProps<"/app/scans/new">) {
  const { profile } = await props.searchParams;
  return (
    <>
      <PageHeader title="New scan" description="Pick a target in scope and a profile, or choose plugins by hand. I hand everything I find to every plugin that can use it." />
      <NewScanForm initialProfile={typeof profile === "string" ? profile : undefined} />
    </>
  );
}
```

In `web/src/components/scans/new-scan-form.tsx`:
- signature `export function NewScanForm({ initialProfile }: { initialProfile?: string })`; import `useProfiles`;
- add state and derived values after `runnable`:

```tsx
  const { data: profiles } = useProfiles();
  const [profileId, setProfileId] = useState<string | null>(initialProfile ?? null);
  // Until the user picks, Balanced is the default when it can run; "" means "choose plugins by hand".
  const fallback = profiles?.find((p) => p.name === "Balanced" && p.available)?.id ?? "";
  const chosen = profileId ?? fallback;
  const profile = profiles?.find((p) => p.id === chosen);
```

- change the `selected` and `depth` defaults so a profile fills them until the user edits:

```tsx
  const [depth, setDepth] = useState<number | null>(null);
  const selected = picked ?? profile?.plugin_ids.filter((id) => runnable.some((p) => p.id === id)) ?? runnable.map((p) => p.id);
  const maxDepth = depth ?? profile?.max_depth ?? 2;
```

  (replace the old `useState(2)` depth; use `maxDepth` in the depth `<select value>` and in the request; keep `setDepth` in `onChange`.)
- profile picker, first fieldset in the form:

```tsx
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Profile</span>
        <select value={chosen} onChange={(e) => { setProfileId(e.target.value); setPicked(null); setDepth(null); }} className="h-8 max-w-xs rounded-lg border border-input bg-transparent px-2 text-sm">
          {(profiles ?? []).filter((p) => p.available).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">Choose plugins by hand</option>
        </select>
        {profile?.description && <span className="text-xs text-muted-foreground">{profile.description}</span>}
      </label>
```

- request body:

```tsx
      const scan = await api.startScan({
        target: { type, value: value.trim() }, plugin_ids: selected, max_depth: maxDepth,
        ...(profile ? { profile_id: profile.id } : {}),
      });
```

  (The API keeps the profile's settings for the plugins still selected — Task 4.)

- [ ] **Step 6: Lint, build, check**

Run: `cd web && pnpm lint && pnpm build`
Expected: success.
Manual: `/app/profiles` shows Quick and Balanced locked, with nuclei severity listed; create a profile with nuclei severity `critical` only, edit it, duplicate Quick, delete the copy; "Scan with this profile" opens New scan with that profile selected; starting the scan shows the profile's plugins and depth on the scan page; a viewer sees no write buttons.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/profiles web/src/components/scans/new-scan-form.tsx web/src/app/app/profiles/page.tsx web/src/app/app/scans/new/page.tsx
git commit -m "feat(web): scan profiles with schema-driven plugin settings; profiles on New scan"
```

---

### Task 14: Honest placeholders, docs, end-to-end check

**Files:**
- Modify: `web/src/components/shared/placeholder-page.tsx`
- Modify: every remaining placeholder page (list below)
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `PlaceholderPage({ title, description?, route, phase? })`.

- [ ] **Step 1: Placeholder text** — `web/src/components/shared/placeholder-page.tsx`: add an optional `phase?: string` prop and render it under "Not built yet":

```tsx
export function PlaceholderPage({ title, description, route, phase }: { title: string; description?: string; route: string; phase?: string }) {
```

```tsx
        <p className="text-sm font-medium">Not built yet</p>
        {phase && <p className="max-w-md text-xs text-muted-foreground">{phase}</p>}
        <p className="font-mono text-xs text-subtle">{route}</p>
```

- [ ] **Step 2: Pass `phase`** on each remaining placeholder:

| Page | `phase` |
|---|---|
| `app/app/graph/page.tsx`, `app/app/scans/[scanId]/graph/page.tsx` | `"Arrives in Phase 5 — needs the entity graph in Memgraph."` |
| `app/app/evidence/[evidenceId]/page.tsx`, `app/app/scans/[scanId]/evidence/page.tsx` | `"Arrives in Phase 5 — needs hash-addressed evidence in MinIO. Until then, a finding's raw event is on its page."` |
| `app/app/scans/[scanId]/changes/page.tsx` | `"Arrives in Phase 8 — needs scan-to-scan diff."` |
| `app/app/scans/[scanId]/report/page.tsx`, `app/app/reports/page.tsx` | `"Arrives in Phase 8 — reports build on diff and risk."` |
| `app/app/experiments/page.tsx` | `"Arrives in Phase 9 — reproducible runs against the lab testbed."` |
| `app/app/settings/ai/page.tsx` | `"Arrives in Phase 7 — needs the AI gateway."` |
| `app/app/audit/page.tsx`, `app/app/settings/workspace/page.tsx`, `settings/resources/page.tsx`, `settings/system/page.tsx`, `settings/credentials/page.tsx`, `app/(auth)/onboarding/page.tsx` | `"Next small step after Phase 4a."` |

Then `grep -rL "phase=" $(grep -rl PlaceholderPage web/src/app)` must print nothing.

- [ ] **Step 3: README** — in `README.md`:
  - status line under the banner: "the platform core, durable scans and my first scanners, Nuclei included, run today".
  - "What a scan looks like" note: replace the blockquote with "Today I run Subfinder, dnsx, httpx and Nuclei as one chained scan, each in its own locked-down container and only against targets in your scope. The planner and correlation steps are next; see the roadmap."
  - "Run me": the plugin build comment lists Nuclei; the lab paragraph says: "`docker compose --profile lab up -d testbed` starts a local nginx at `testbed.nyx-lab.test` with a fake exposed `.git/config`, `.env` and a directory listing. Add `nyx-lab.test` to scope with active scanning allowed and scan `testbed.nyx-lab.test` with the Balanced profile."
  - Repository map: `web/` row → "The workspace UI: sign-in, scans, findings with review, assets, dashboard, profiles, plugins, scope. Graph, evidence, reports and experiments come with their phases."; add a `lab/` row: "The local testbed's deliberate misconfigurations."
  - Roadmap item 4: "- [ ] **4. Default plugin set** — 4a done: Nuclei, findings with review across scans, assets, profiles. Next: Naabu, tlsx, Katana, gau (4b); CVE/EPSS/KEV enrichment (4c)".

- [ ] **Step 4: Full verification**

Run: `cd api && uv run ruff check . && uv run ruff format --check . && uv run alembic check && uv run pytest -q`
Run: `cd web && pnpm lint && pnpm build`
Expected: all green.

Manual end-to-end (spec success criteria 1–5):

```bash
docker compose --profile plugins build
docker compose up --build -d
docker compose --profile lab up -d testbed
```

1. `/app/plugins` lists Nuclei as `safe_active` with a digest.
2. Settings → Scope: add `nyx-lab.test`, active allowed. New scan: target `testbed.nyx-lab.test`, profile Balanced. The scan runs httpx → nuclei and ends `COMPLETED`; the overview shows findings by severity (at least the exposed git config).
3. The findings show in `/app/findings`, the scan's Findings tab, the asset panel in `/app/assets`, and on `/app/dashboard`.
4. Mark the git-config finding "False positive", scan again: it stays false positive, `last_seen` moves, "Seen in 2 scans". Mark another "Fixed", scan again: it is "Open" again.
5. Profiles: Quick/Balanced cannot be edited (no Edit button; `curl -X PATCH` → 409); create, edit, duplicate, delete a profile; scan from one.

If a real nuclei record's fields differ from the fixture's first line, replace that line with the recorded one (copy from the run's event feed → raw) and re-run `uv run pytest tests/test_adapters.py`.

- [ ] **Step 5: Commit**

```bash
git add web/src README.md plugins/projectdiscovery.nuclei/fixtures
git commit -m "docs: phase 4a in the README, placeholders say which phase brings them"
```
