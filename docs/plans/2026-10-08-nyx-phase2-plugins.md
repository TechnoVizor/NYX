# NYX Phase 2 Implementation Plan — plugins

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plugin manifest and event contract, a Plugin Registry, three sandboxed plugins (Subfinder, dnsx, httpx), scope-gated single-plugin runs, and workspace UI for plugins and scope.

**Architecture:** `plugins/` holds the JSON Schemas, a one-file SDK and one directory per plugin (manifest, Dockerfile, adapter, fixture). The API (FastAPI) validates manifests, syncs them into Postgres, gates runs by scope and risk, and streams results from a new `runner/` service. The runner is the only service with the Docker socket, and it starts hardened plugin containers on an isolated `nyx-plugins` network. The web app replaces the mock plugin pages and the policies placeholder with real pages.

**Tech Stack:**
- Python 3.12 (FastAPI, SQLAlchemy 2, Alembic, jsonschema, PyYAML, httpx, docker SDK) with pytest.
- Next.js 16 with TanStack Query.
- Docker / Compose.
- ProjectDiscovery subfinder 2.16.0, dnsx 1.3.1, httpx 1.12.0.

**Spec:** `docs/specs/2026-10-08-nyx-phase2-plugins-design.md`

## Global Constraints

- Manifest `api_version: platform.security/v1`, `kind: ScannerPlugin`; event `event_version: "1"`.
- Risk levels `passive | safe_active | active | intrusive`; trust `verified | community | custom`; target types `domain | ip | cidr | url`.
- Gate:
  - passive needs a scope match;
  - safe_active and active need a match with `active_allowed`;
  - intrusive is always refused.
- Scope entry rules:
  - a domain needs a dot and no `*`;
  - a CIDR is no wider than /16;
  - a domain covers itself and `*.domain` only.
- Plugin container: `read_only`, `tmpfs /tmp size=64m`, `cap_drop ALL`, `no-new-privileges`, `user 65534:65534`, `pids_limit 256`, memory/cpu from the manifest, network `nyx-plugins`, no volumes, image referenced by digest, removed after the run.
- The runner allows max 4 concurrent runs (5th → 429) and requires a bearer `NYX_RUNNER_TOKEN` (wrong or missing → 401).
- Run statuses `PENDING | RUNNING | SUCCEEDED | FAILED | TIMED_OUT`. Runs left in flight at API startup become FAILED with `Interrupted by restart.`
- Events page size ≤ 500. Invalid plugin output lines are stored with `valid = false`, never dropped.
- Upstream binaries are pinned with sha256 (from the release `checksums.txt`, recorded here):
  - subfinder 2.16.0 — amd64 `1b7f9c608e9a5bd59e609a5e09710d63c5485e92d3d49dc2c16eb4fdbe10cb60`, arm64 `c81d49559c0f630177be9e347e502e7a3d474aacc6ff78291ffcb4964367d63d`
  - dnsx 1.3.1 — amd64 `438b964653056dd51dcfe614b1a16f8bced3cc48a1d27bc07cc6fdf2ef2a9533`, arm64 `dd657dd1ccee5e137eca2dbad0e97dbd067555f744adb97efcda774f1b2fbde1`
  - httpx 1.12.0 — amd64 `9d8439e8b6c9aa7d1e2314817a392e00d5178da3af5652f7475f88868f418f76`, arm64 `fd7b123c1dfbc3d69f19f524e4eebcd6ec06b9a6cbd56813c76f11645197331e`
- Never scan targets without authorization. Fixtures are recorded only from passive lookups against `example.com` (IANA documentation domain) and active probes against a local container.
- Tests never touch the `nyx` database (`api/tests/conftest.py` forces `*_test`).
- Every commit ends with the session's attribution lines if the harness provides them.

## Review Focus

1. **Scope lookalikes and tricks:** `evil-example.com`, `example.com.evil.net`, `EXAMPLE.COM.`, `https://a.example.com:8443/x`, an IP literal sent as a "domain", and a bare `example.com` entered as a URL without a scheme. These must match or not exactly as the spec says. Pinned in Task 2 (`test_scope_matching` table).
2. **A plugin printing garbage or another run's id:** stored with `valid = false`, and the run still finishes. Pinned in Task 4 (`test_invalid_and_foreign_lines_are_kept_invalid`).
3. **Runner down or wrong token during a run:** the run ends FAILED with a readable error and never stays RUNNING. Pinned in Task 4 (`test_runner_unreachable_fails_the_run`).
4. **Plugin that hangs forever:** killed at the manifest timeout, status TIMED_OUT, container gone. Pinned in Task 5 (`test_timeout_kills_container`).
5. **Deleting a scope entry while a run against it is in flight:** the run already passed the gate and finishes. New runs are refused. Pinned in Task 4 (`test_gate_rechecked_on_every_start`).

---

## File map

```
plugins/
  schemas/manifest.schema.json  schemas/event.schema.json        Task 1
  sdk/nyx_plugin.py                                               Task 1
  _template/{plugin.yaml,Dockerfile,adapter.py}                   Task 1
  projectdiscovery.{subfinder,dnsx,httpx}/{plugin.yaml,Dockerfile,adapter.py,fixtures/*.jsonl}   Task 6
api/
  app/config.py            + plugins_dir, runner_url, runner_token          Task 3
  app/contract.py          schema loading + validate_manifest/validate_event Task 1
  app/scope.py             pure matching + gate                              Task 2
  app/models.py            + ScopeTarget (T2), Plugin/PluginVersion/PluginInstallation (T3), PluginRun/PluginEvent (T4)
  alembic/versions/0002_scope.py  0003_plugins.py  0004_runs.py
  app/runner.py            RunnerClient (httpx)                               Task 3
  app/registry.py          sync_plugins                                       Task 3
  app/runs.py              start gate, execute_run, fail_interrupted_runs     Task 4
  app/routes/scope.py  app/routes/plugins.py  app/routes/runs.py
  app/main.py              lifespan: sync + fail interrupted                  Task 4
  tests/test_contract.py test_scope.py test_registry.py test_runs.py test_adapters.py
runner/
  pyproject.toml uv.lock Dockerfile .dockerignore
  app/main.py app/sandbox.py                                                  Task 5
  tests/test_sandbox.py tests/test_runs.py tests/fixtures/echo/Dockerfile
docker-compose.yml  .github/workflows/ci.yml  .dockerignore (root)            Task 7
web/src/lib/{types.ts,api/client.ts,api/hooks.ts,nav.ts}                      Task 8
web/src/components/plugins/{plugins-table,plugin-detail,run-panel}.tsx        Task 8
web/src/components/scope/scope-manager.tsx                                    Task 8
web/src/app/app/plugins/page.tsx  plugins/[pluginSlug]/page.tsx  settings/policies/page.tsx  Task 8
README.md                                                                     Task 9
```

---

### Task 1: Plugin contract (schemas, SDK, template)

**Files:**
- Create: `plugins/schemas/manifest.schema.json`, `plugins/schemas/event.schema.json`, `plugins/sdk/nyx_plugin.py`, `plugins/_template/plugin.yaml`, `plugins/_template/Dockerfile`, `plugins/_template/adapter.py`, `api/app/contract.py`, `api/tests/test_contract.py`
- Modify: `api/pyproject.toml` (deps `jsonschema`, `pyyaml`)

**Interfaces:**
- Produces:
  - `app.contract.validate_manifest(doc: dict) -> list[str]` (empty list = valid; messages otherwise);
  - `app.contract.validate_event(doc: dict) -> list[str]`;
  - `app.contract.load_manifest(path: Path) -> dict`.
  - SDK: `nyx_plugin.INPUT: dict`, `emit(type: str, data: dict, target: dict | None = None, confidence: float | None = None) -> None`, `log(message: str, level: str = "info")`, `progress(percent: int)`, `run_tool(cmd: list[str], stdin: str | None = None) -> Iterator[dict]`.

- [ ] **Step 1: Dependencies**

```bash
cd api && uv add jsonschema pyyaml httpx && uv add --dev types-pyyaml
```

- [ ] **Step 2: Write the failing tests**

`api/tests/test_contract.py`:
```python
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.contract import load_manifest, validate_event, validate_manifest

ROOT = Path(__file__).resolve().parents[2] / "plugins"


def good_manifest() -> dict:
    return load_manifest(ROOT / "_template" / "plugin.yaml")


def good_event(**over) -> dict:
    e = {
        "event_version": "1",
        "type": "asset",
        "plugin_run_id": "00000000-0000-0000-0000-000000000001",
        "plugin_id": "example.template",
        "plugin_version": "0.1.0",
        "timestamp": "2026-10-08T12:00:00Z",
        "target": {"type": "domain", "value": "example.com"},
        "data": {"kind": "subdomain", "value": "a.example.com"},
    }
    e.update(over)
    return e


def test_template_manifest_is_valid():
    assert validate_manifest(good_manifest()) == []


@pytest.mark.parametrize(
    "path,value",
    [
        (("permissions", "docker_socket"), True),
        (("permissions", "host_mounts"), True),
        (("classification", "risk_level"), "nuclear"),
        (("io", "accepts"), ["email"]),
        (("api_version",), "platform.security/v2"),
    ],
)
def test_manifest_rejects_unsafe_or_unknown_values(path, value):
    m = good_manifest()
    node = m
    for k in path[:-1]:
        node = node[k]
    node[path[-1]] = value
    assert validate_manifest(m) != []


def test_event_valid():
    assert validate_event(good_event()) == []


@pytest.mark.parametrize(
    "over",
    [
        {"type": "teleport"},
        {"event_version": "2"},
        {"confidence": 1.5},
        {"data": {"value": "missing kind"}},
        {"type": "relation", "data": {"from": "a"}},
        {"type": "log", "data": {"level": "info"}},
    ],
)
def test_event_invalid(over):
    assert validate_event(good_event(**over)) != []


def test_sdk_emits_valid_events(tmp_path):
    fixture = tmp_path / "out.jsonl"
    fixture.write_text('{"host": "a.example.com"}\nnot json\n')
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "sdk"),
        "NYX_FIXTURE": str(fixture),
        "NYX_INPUT": json.dumps(
            {
                "run_id": "00000000-0000-0000-0000-000000000001",
                "plugin_id": "example.template",
                "plugin_version": "0.1.0",
                "target": {"type": "domain", "value": "example.com"},
                "config": {},
                "rate_limit": 10,
            }
        ),
    }
    out = subprocess.run(
        [sys.executable, str(ROOT / "_template" / "adapter.py")], env=env, capture_output=True, text=True, check=True
    )
    lines = [json.loads(line) for line in out.stdout.splitlines()]
    assert [e["type"] for e in lines] == ["progress", "asset", "log", "progress"]
    assert all(validate_event(e) == [] for e in lines)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd api && uv run pytest -q tests/test_contract.py`
Expected: collection error `No module named 'app.contract'`.

- [ ] **Step 4: Schemas**

`plugins/schemas/manifest.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/TechnoVizor/NYX/plugins/schemas/manifest.schema.json",
  "title": "NYX plugin manifest",
  "type": "object",
  "required": ["api_version", "kind", "metadata", "runtime", "classification", "io", "resources", "permissions", "limits", "config_schema"],
  "additionalProperties": false,
  "properties": {
    "api_version": { "const": "platform.security/v1" },
    "kind": { "const": "ScannerPlugin" },
    "metadata": {
      "type": "object",
      "required": ["id", "name", "publisher", "version", "license", "description"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9-]+\\.[a-z0-9-]+$" },
        "name": { "type": "string", "minLength": 1, "maxLength": 80 },
        "publisher": { "type": "string", "minLength": 1, "maxLength": 80 },
        "version": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
        "license": { "type": "string" },
        "description": { "type": "string", "maxLength": 400 }
      }
    },
    "runtime": {
      "type": "object",
      "required": ["type", "image"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "oci" },
        "image": { "type": "string", "pattern": "^[a-z0-9./_-]+:[A-Za-z0-9._-]+$", "not": { "pattern": ":latest$" } }
      }
    },
    "classification": {
      "type": "object",
      "required": ["categories", "risk_level", "trust_level"],
      "additionalProperties": false,
      "properties": {
        "categories": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
        "risk_level": { "enum": ["passive", "safe_active", "active", "intrusive"] },
        "trust_level": { "enum": ["verified", "community", "custom"] }
      }
    },
    "io": {
      "type": "object",
      "required": ["accepts", "produces"],
      "additionalProperties": false,
      "properties": {
        "accepts": { "type": "array", "minItems": 1, "items": { "enum": ["domain", "ip", "cidr", "url"] } },
        "produces": { "type": "array", "minItems": 1, "items": { "enum": ["asset", "relation", "finding", "evidence", "metric", "log", "progress", "artifact"] } }
      }
    },
    "resources": {
      "type": "object",
      "required": ["cpu", "memory_mb", "timeout_seconds"],
      "additionalProperties": false,
      "properties": {
        "cpu": { "type": "number", "exclusiveMinimum": 0, "maximum": 4 },
        "memory_mb": { "type": "integer", "minimum": 32, "maximum": 4096 },
        "timeout_seconds": { "type": "integer", "minimum": 5, "maximum": 3600 }
      }
    },
    "permissions": {
      "type": "object",
      "required": ["network", "filesystem", "raw_socket", "host_mounts", "docker_socket"],
      "additionalProperties": false,
      "properties": {
        "network": { "enum": ["none", "target_scope"] },
        "filesystem": { "const": "temporary" },
        "raw_socket": { "const": false },
        "host_mounts": { "const": false },
        "docker_socket": { "const": false }
      }
    },
    "limits": {
      "type": "object",
      "required": ["default_rate_limit"],
      "additionalProperties": false,
      "properties": { "default_rate_limit": { "type": "integer", "minimum": 1, "maximum": 1000 } }
    },
    "config_schema": { "type": "object" }
  }
}
```

`plugins/schemas/event.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/TechnoVizor/NYX/plugins/schemas/event.schema.json",
  "title": "NYX plugin event (one JSONL line)",
  "type": "object",
  "required": ["event_version", "type", "plugin_run_id", "plugin_id", "plugin_version", "timestamp", "target", "data"],
  "properties": {
    "event_version": { "const": "1" },
    "type": { "enum": ["asset", "relation", "finding", "evidence", "metric", "log", "progress", "artifact"] },
    "scan_id": { "type": "string" },
    "plugin_run_id": { "type": "string", "minLength": 1 },
    "plugin_id": { "type": "string", "minLength": 1 },
    "plugin_version": { "type": "string", "minLength": 1 },
    "timestamp": { "type": "string", "format": "date-time" },
    "target": {
      "type": "object",
      "required": ["type", "value"],
      "properties": { "type": { "enum": ["domain", "ip", "cidr", "url"] }, "value": { "type": "string", "minLength": 1 } }
    },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "data": { "type": "object" }
  },
  "allOf": [
    { "if": { "properties": { "type": { "const": "asset" } } }, "then": { "properties": { "data": { "required": ["kind", "value"] } } } },
    { "if": { "properties": { "type": { "const": "relation" } } }, "then": { "properties": { "data": { "required": ["from", "to", "kind"] } } } },
    { "if": { "properties": { "type": { "const": "log" } } }, "then": { "properties": { "data": { "required": ["level", "message"] } } } },
    { "if": { "properties": { "type": { "const": "progress" } } }, "then": { "properties": { "data": { "required": ["percent"], "properties": { "percent": { "type": "integer", "minimum": 0, "maximum": 100 } } } } } },
    { "if": { "properties": { "type": { "const": "metric" } } }, "then": { "properties": { "data": { "required": ["name", "value"] } } } },
    { "if": { "properties": { "type": { "const": "finding" } } }, "then": { "properties": { "data": { "required": ["title", "severity"] } } } }
  ]
}
```

- [ ] **Step 5: SDK**

`plugins/sdk/nyx_plugin.py`:
```python
"""NYX plugin SDK. One file, stdlib only, copied into every plugin image.

The platform passes the run input as JSON in NYX_INPUT. A plugin writes one event per line to stdout
(see plugins/schemas/event.schema.json) and anything for humans to stderr. With NYX_FIXTURE set,
run_tool() replays a recorded tool output instead of running the tool, so adapters are testable offline.
"""

import json
import os
import subprocess
import sys
from collections.abc import Iterator
from datetime import UTC, datetime

INPUT: dict = json.loads(os.environ.get("NYX_INPUT", "{}"))


def emit(type: str, data: dict, target: dict | None = None, confidence: float | None = None) -> None:
    event = {
        "event_version": "1",
        "type": type,
        "plugin_run_id": INPUT.get("run_id", ""),
        "plugin_id": INPUT.get("plugin_id", ""),
        "plugin_version": INPUT.get("plugin_version", ""),
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "target": target or INPUT.get("target", {}),
        "data": data,
    }
    if confidence is not None:
        event["confidence"] = confidence
    print(json.dumps(event, separators=(",", ":")), flush=True)


def log(message: str, level: str = "info") -> None:
    emit("log", {"level": level, "message": message})


def progress(percent: int) -> None:
    emit("progress", {"percent": max(0, min(100, int(percent)))})


def run_tool(cmd: list[str], stdin: str | None = None) -> Iterator[dict]:
    """Yield each JSON line the tool prints. Non-JSON lines become warnings. A failing tool exits the plugin."""
    fixture = os.environ.get("NYX_FIXTURE")
    if fixture:
        with open(fixture, encoding="utf-8") as f:
            lines = f.read().splitlines()
        code, err = 0, ""
    else:
        proc = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
        lines, code, err = proc.stdout.splitlines(), proc.returncode, proc.stderr
    for line in lines:
        if not line.strip():
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            log(f"Skipped a line the tool printed that is not JSON: {line[:200]}", "warning")
    if code != 0:
        print(err[-4000:], file=sys.stderr)
        raise SystemExit(code)
```

- [ ] **Step 6: Template plugin**

`plugins/_template/plugin.yaml`:
```yaml
# Copy this directory to plugins/<publisher>.<tool>/ and change every field.
api_version: platform.security/v1
kind: ScannerPlugin
metadata:
  id: example.template
  name: Template
  publisher: NYX
  version: 0.1.0
  license: Apache-2.0
  description: Starting point for a new plugin. Reads a tool's JSON output and emits NYX events.
runtime:
  type: oci
  image: nyx-plugin/template:0.1.0
classification:
  categories: [discovery]
  risk_level: passive
  trust_level: custom
io:
  accepts: [domain]
  produces: [asset, log, progress]
resources:
  cpu: 0.5
  memory_mb: 128
  timeout_seconds: 60
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
  properties: {}
```

`plugins/_template/adapter.py`:
```python
"""Template adapter: run the tool, turn each JSON record into NYX events."""

from nyx_plugin import INPUT, emit, progress, run_tool

target = INPUT["target"]["value"]
progress(0)
for record in run_tool(["your-tool", "-d", target, "-json"]):
    emit("asset", {"kind": "subdomain", "value": record["host"]})
progress(100)
```

`plugins/_template/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
# Build context is plugins/ so the SDK can be copied in:
#   docker build -f plugins/_template/Dockerfile plugins
FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY sdk/nyx_plugin.py _template/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]
```

- [ ] **Step 7: Validation module**

`api/app/contract.py`:
```python
"""The plugin contract: manifest and event schemas from plugins/schemas, checked with jsonschema."""

import json
from functools import cache
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

from app.config import settings


@cache
def _validator(name: str) -> Draft202012Validator:
    schema = json.loads((Path(settings.plugins_dir) / "schemas" / f"{name}.schema.json").read_text())
    return Draft202012Validator(schema, format_checker=FormatChecker())


def _errors(name: str, doc: object) -> list[str]:
    return [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in _validator(name).iter_errors(doc)]


def validate_manifest(doc: object) -> list[str]:
    return _errors("manifest", doc)


def validate_event(doc: object) -> list[str]:
    return _errors("event", doc)


def load_manifest(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))
```

Add to `api/app/config.py` (inside `Settings`, after `session_ttl_hours`; Task 3 adds the runner fields next to it):
```python
    # Repo root /plugins locally (api/app/config.py -> parents[2]); /plugins inside the API image.
    plugins_dir: str = str(Path(__file__).resolve().parents[2] / "plugins")
```
and `from pathlib import Path` at the top.

`FormatChecker` needs `rfc3339-validator` to check `date-time`: `uv add rfc3339-validator`.

- [ ] **Step 8: Run tests**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass (23 earlier + new contract tests).

- [ ] **Step 9: Commit**

```bash
cd .. && git add plugins api && git commit -m "feat(plugins): manifest and event schemas, SDK, template"
```

---

### Task 2: Scope registry

**Files:**
- Create: `api/app/scope.py`, `api/alembic/versions/0002_scope.py`, `api/app/routes/scope.py`, `api/tests/test_scope.py`
- Modify: `api/app/models.py`, `api/app/main.py`

**Interfaces:**
- Consumes: `require_role`, `current_user`, `DB` from `app.security`.
- Produces:
  - `app.scope.normalize_entry(kind: str, value: str) -> str` (raises `ValueError` with a user-facing message);
  - `app.scope.parse_target(type: str, value: str) -> tuple[str, str | IPv4Address | IPv6Address | IPv4Network | IPv6Network]`;
  - `app.scope.find_entry(target_type: str, target_value: str, entries: Sequence[ScopeLike]) -> ScopeLike | None`;
  - `app.scope.refusal(risk_level: str, target_value: str, entry: ScopeLike | None) -> str | None`;
  - model `ScopeTarget(id, kind, value, active_allowed, authorization, created_by, created_at)`.
  - HTTP: `GET/POST /api/v1/scope`, `DELETE /api/v1/scope/{id}`.

- [ ] **Step 1: Write the failing tests**

`api/tests/test_scope.py`:
```python
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


@pytest.mark.parametrize("ttype,value", [("domain", "not a domain!"), ("ip", "999.1.1.1"), ("url", "https://"), ("email", "a@b.c")])
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
```

Add `scope_targets` to the `truncate` in `api/tests/conftest.py`: `truncate users, sessions, scope_targets cascade` (Tasks 3 and 4 extend this list with their tables).

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest -q tests/test_scope.py`
Expected: `No module named 'app.scope'`.

- [ ] **Step 3: Pure scope logic**

`api/app/scope.py`:
```python
"""Scope: which targets NYX may touch, and how hard. Pure functions, no database."""

import ipaddress
import re
from collections.abc import Sequence
from typing import Protocol
from urllib.parse import urlsplit

_LABEL = r"(?!-)[a-z0-9-]{1,63}(?<!-)"
_DOMAIN = re.compile(rf"^(?=.{{1,253}}$)(?:{_LABEL}\.)+{_LABEL}$")
WIDEST_PREFIX = {4: 16, 6: 48}


class ScopeLike(Protocol):
    kind: str
    value: str
    active_allowed: bool


def _domain(value: str) -> str:
    d = value.strip().lower().rstrip(".")
    # ponytail: ASCII names only; punycode (xn--) works, raw unicode IDNs are refused until someone needs them.
    if not _DOMAIN.fullmatch(d):
        raise ValueError(f"{value!r} is not a domain name.")
    return d


def normalize_entry(kind: str, value: str) -> str:
    if kind == "domain":
        if "*" in value:
            raise ValueError("Write example.com, not *.example.com: a domain entry already covers its subdomains.")
        return _domain(value)
    if kind == "cidr":
        try:
            net = ipaddress.ip_network(value.strip(), strict=False)
        except ValueError:
            raise ValueError(f"{value!r} is not an IP address or CIDR range.") from None
        if net.prefixlen < WIDEST_PREFIX[net.version]:
            raise ValueError(f"{net} is too wide. Use /{WIDEST_PREFIX[net.version]} or narrower.")
        return str(net)
    raise ValueError(f"Unknown scope kind {kind!r}.")


def parse_target(type: str, value: str):
    """Return ("domain", name) | ("ip", address) | ("cidr", network). Raise ValueError if it cannot be parsed."""
    if type == "url":
        host = urlsplit(value if "://" in value else f"//{value}").hostname
        if not host:
            raise ValueError(f"{value!r} has no host.")
        value, type = host, "domain"
    if type in ("domain", "ip"):
        try:
            return "ip", ipaddress.ip_address(value.strip().strip("[]"))
        except ValueError:
            if type == "ip":
                raise
        return "domain", _domain(value)
    if type == "cidr":
        return "cidr", ipaddress.ip_network(value.strip(), strict=False)
    raise ValueError(f"Unknown target type {type!r}.")


def _covers(entry: ScopeLike, kind: str, parsed) -> bool:
    if entry.kind == "domain":
        return kind == "domain" and (parsed == entry.value or parsed.endswith("." + entry.value))
    net = ipaddress.ip_network(entry.value)
    if kind == "ip":
        return parsed.version == net.version and parsed in net
    if kind == "cidr":
        return parsed.version == net.version and parsed.subnet_of(net)
    return False


def find_entry(target_type: str, target_value: str, entries: Sequence[ScopeLike]) -> ScopeLike | None:
    try:
        kind, parsed = parse_target(target_type, target_value)
    except ValueError:
        return None
    return next((e for e in entries if _covers(e, kind, parsed)), None)


def refusal(risk_level: str, target_value: str, entry: ScopeLike | None) -> str | None:
    """None when the run may go ahead, otherwise the sentence to show the user."""
    if risk_level == "intrusive":
        return "Intrusive plugins are disabled in this version of NYX."
    if entry is None:
        return f"{target_value} is not in scope."
    if risk_level != "passive" and not entry.active_allowed:
        return f"{target_value} is in scope for passive plugins only. Allow active scanning on its scope entry first."
    return None
```

- [ ] **Step 4: Model and migration**

Append to `api/app/models.py` (add `Boolean, Text` to the sqlalchemy import):
```python
class ScopeTarget(Base):
    __tablename__ = "scope_targets"
    __table_args__ = (
        CheckConstraint("kind in ('domain', 'cidr')", name="scope_targets_kind_check"),
        UniqueConstraint("kind", "value", name="scope_targets_kind_value_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(8))
    value: Mapped[str] = mapped_column(String(253))
    active_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    authorization: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```
(import `UniqueConstraint`.)

`api/alembic/versions/0002_scope.py`:
```python
"""scope targets

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scope_targets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("value", sa.String(253), nullable=False),
        sa.Column("active_allowed", sa.Boolean(), nullable=False),
        sa.Column("authorization", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("kind in ('domain', 'cidr')", name="scope_targets_kind_check"),
        sa.UniqueConstraint("kind", "value", name="scope_targets_kind_value_key"),
    )


def downgrade() -> None:
    op.drop_table("scope_targets")
```

- [ ] **Step 5: Routes**

`api/app/routes/scope.py`:
```python
import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import ScopeTarget, User
from app.scope import normalize_entry
from app.security import DB, current_user, require_role

router = APIRouter(prefix="/api/v1/scope", tags=["scope"])
Admin = Annotated[User, Depends(require_role("admin"))]
Anyone = Annotated[User, Depends(current_user)]


class ScopeIn(BaseModel):
    kind: Literal["domain", "cidr"]
    value: str = Field(max_length=253)
    active_allowed: bool = False
    authorization: str = Field(max_length=2000)

    @field_validator("authorization")
    @classmethod
    def _note(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Say who allowed this target and on what basis.")
        return v.strip()


class ScopeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: str
    value: str
    active_allowed: bool
    authorization: str
    created_at: datetime


@router.get("", response_model=list[ScopeOut])
def list_scope(db: DB, _: Anyone):
    return db.scalars(select(ScopeTarget).order_by(ScopeTarget.kind, ScopeTarget.value)).all()


@router.post("", status_code=201, response_model=ScopeOut)
def add_scope(body: ScopeIn, db: DB, user: Admin):
    try:
        value = normalize_entry(body.kind, body.value)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    entry = ScopeTarget(
        kind=body.kind, value=value, active_allowed=body.active_allowed, authorization=body.authorization, created_by=user.id
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"{value} is already in scope.") from None
    return entry


@router.delete("/{entry_id}", status_code=204)
def remove_scope(entry_id: uuid.UUID, db: DB, _: Admin) -> None:
    entry = db.get(ScopeTarget, entry_id)
    if entry is None:
        raise HTTPException(404, "No such scope entry.")
    db.delete(entry)
    db.commit()
```

In `api/app/main.py` include `scope.router` (import `from app.routes import auth, health, scope`).

- [ ] **Step 6: Migrate, test, lint**

Run: `uv run alembic upgrade head && uv run alembic check && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: `No new upgrade operations detected.`; all tests pass. Note: `alembic upgrade head` targets the `nyx` dev DB; the test DB is migrated by the session fixture.

- [ ] **Step 7: Commit**

```bash
cd .. && git add api && git commit -m "feat(api): scope registry with domain/CIDR matching and risk gate"
```

---

### Task 3: Plugin registry and runner client

**Files:**
- Create: `api/app/runner.py`, `api/app/registry.py`, `api/alembic/versions/0003_plugins.py`, `api/app/routes/plugins.py`, `api/tests/test_registry.py`
- Modify: `api/app/models.py`, `api/app/config.py`, `api/app/main.py`, `api/tests/conftest.py`

**Interfaces:**
- Consumes: `validate_manifest`, `load_manifest` (Task 1).
- Produces:
  - `app.runner.RunnerClient(url: str, token: str)` with `.digest(image: str) -> str | None` and `.run(body: dict) -> Iterator[str]` (raises `RunnerError`);
  - `app.runner.get_runner() -> RunnerClient` (FastAPI dependency; tests override it);
  - `app.registry.sync_plugins(db: Session, runner: RunnerClient, root: Path | None = None) -> list[str]` (returns the synced plugin ids);
  - models `Plugin`, `PluginVersion`, `PluginInstallation`;
  - `app.routes.plugins.installed_version(db, plugin_id) -> PluginVersion | None`.
  - HTTP: `GET /api/v1/plugins`, `GET /api/v1/plugins/{id}`, `PATCH /api/v1/plugins/{id}`.
  - Test fixture `StubRunner` in `api/tests/conftest.py`.

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/conftest.py`:
```python
class StubRunner:
    """Stands in for nyx-runner: digests per image, and canned output lines per run."""

    def __init__(self, digests=None, lines=None, error=None):
        self.digests = digests or {}
        self.lines = lines or []
        self.error = error
        self.calls = []

    def digest(self, image):
        return self.digests.get(image)

    def run(self, body):
        self.calls.append(body)
        if self.error:
            raise self.error
        yield from (line(body) if callable(line) else line for line in self.lines)


@pytest.fixture
def runner():
    from app.runner import get_runner

    stub = StubRunner()
    app.dependency_overrides[get_runner] = lambda: stub
    yield stub
    app.dependency_overrides.pop(get_runner, None)
```
and extend the truncate to `users, sessions, scope_targets, plugins, plugin_versions, plugin_installations cascade`.

`api/tests/test_registry.py`:
```python
import shutil
from pathlib import Path

import yaml

from app.db import SessionLocal
from app.models import PluginVersion
from app.registry import sync_plugins

REPO = Path(__file__).resolve().parents[2] / "plugins"


def plugin_dir(tmp_path, **meta) -> Path:
    root = tmp_path / "plugins"
    shutil.copytree(REPO / "schemas", root / "schemas")
    d = root / "example.tool"
    d.mkdir()
    m = yaml.safe_load((REPO / "_template" / "plugin.yaml").read_text())
    m["metadata"].update({"id": "example.tool", "name": "Tool", **meta})
    (d / "plugin.yaml").write_text(yaml.safe_dump(m))
    return root


def test_sync_registers_valid_plugins(tmp_path, runner):
    runner.digests = {"nyx-plugin/template:0.1.0": "sha256:aaa"}
    with SessionLocal() as db:
        assert sync_plugins(db, runner, plugin_dir(tmp_path)) == ["example.tool"]


def test_sync_skips_invalid_manifest(tmp_path, runner):
    root = plugin_dir(tmp_path)
    m = yaml.safe_load((root / "example.tool" / "plugin.yaml").read_text())
    m["permissions"]["docker_socket"] = True
    (root / "example.tool" / "plugin.yaml").write_text(yaml.safe_dump(m))
    with SessionLocal() as db:
        assert sync_plugins(db, runner, root) == []


def test_missing_image_is_listed_without_digest(tmp_path, runner, client, admin):
    with SessionLocal() as db:
        sync_plugins(db, runner, plugin_dir(tmp_path))
    [p] = client.get("/api/v1/plugins").json()
    assert p["id"] == "example.tool"
    assert p["digest"] is None


def test_new_digest_becomes_installed_version(tmp_path, runner, client, admin):
    root = plugin_dir(tmp_path)
    with SessionLocal() as db:
        runner.digests = {"nyx-plugin/template:0.1.0": "sha256:aaa"}
        sync_plugins(db, runner, root)
        runner.digests = {"nyx-plugin/template:0.1.0": "sha256:bbb"}
        sync_plugins(db, runner, root)
        sync_plugins(db, runner, root)  # unchanged: no third row
        assert db.query(PluginVersion).count() == 2
    assert client.get("/api/v1/plugins/example.tool").json()["digest"] == "sha256:bbb"


def test_admin_can_disable_plugin_analyst_cannot(tmp_path, runner, client, admin):
    with SessionLocal() as db:
        sync_plugins(db, runner, plugin_dir(tmp_path))
    r = client.patch("/api/v1/plugins/example.tool", json={"enabled": False})
    assert r.status_code == 200
    assert r.json()["enabled"] is False
    assert client.get("/api/v1/plugins/nope.nope").status_code == 404


def test_repo_manifests_are_valid():
    from app.contract import load_manifest, validate_manifest

    manifests = sorted(p for p in REPO.glob("*/plugin.yaml"))
    assert manifests, "no plugins found"
    for p in manifests:
        assert validate_manifest(load_manifest(p)) == [], p
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest -q tests/test_registry.py`
Expected: `No module named 'app.registry'`.

- [ ] **Step 3: Config and runner client**

Add to `Settings` in `api/app/config.py`:
```python
    runner_url: str = "http://127.0.0.1:8100"
    runner_token: str = ""
```

`api/app/runner.py`:
```python
"""Client for nyx-runner, the only service allowed to start containers."""

from collections.abc import Iterator

import httpx

from app.config import settings


class RunnerError(Exception):
    pass


class RunnerClient:
    def __init__(self, url: str, token: str):
        self.url = url.rstrip("/")
        self.headers = {"authorization": f"Bearer {token}"}

    def digest(self, image: str) -> str | None:
        try:
            r = httpx.get(f"{self.url}/v1/images/{image}", headers=self.headers, timeout=10)
        except httpx.HTTPError:
            return None
        return r.json()["digest"] if r.status_code == 200 else None

    def run(self, body: dict) -> Iterator[str]:
        timeout = httpx.Timeout(10, read=body["resources"]["timeout_seconds"] + 30)
        try:
            with httpx.stream("POST", f"{self.url}/v1/runs", json=body, headers=self.headers, timeout=timeout) as r:
                if r.status_code != 200:
                    raise RunnerError(f"Runner refused the run ({r.status_code}).")
                yield from r.iter_lines()
        except httpx.HTTPError:
            raise RunnerError("Runner unreachable.") from None


def get_runner() -> RunnerClient:
    return RunnerClient(settings.runner_url, settings.runner_token)
```

- [ ] **Step 4: Models and migration**

Append to `api/app/models.py` (import `JSON` from `sqlalchemy.dialects.postgresql` as `JSONB`, and `ARRAY`):
```python
class Plugin(Base):
    __tablename__ = "plugins"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    publisher: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    categories: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    risk_level: Mapped[str] = mapped_column(String(16))
    trust_level: Mapped[str] = mapped_column(String(16))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PluginVersion(Base):
    __tablename__ = "plugin_versions"
    __table_args__ = (UniqueConstraint("plugin_id", "version", "digest", name="plugin_versions_key"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plugin_id: Mapped[str] = mapped_column(ForeignKey("plugins.id", ondelete="CASCADE"), index=True)
    version: Mapped[str] = mapped_column(String(40))
    image: Mapped[str] = mapped_column(String(200))
    digest: Mapped[str | None] = mapped_column(String(80))
    manifest: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PluginInstallation(Base):
    __tablename__ = "plugin_installations"

    plugin_id: Mapped[str] = mapped_column(ForeignKey("plugins.id", ondelete="CASCADE"), primary_key=True)
    plugin_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plugin_versions.id", ondelete="CASCADE"))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
```

Ruling vs spec §3: `plugin_installations` is keyed by `plugin_id` (one installed version per plugin) with a `plugin_version_id` column, instead of a unique `plugin_version_id`. This is the same data, but "which version is installed" becomes a single-row update. Record it in the ledger.

Unique `(plugin_id, version, digest)` with `digest` NULL allows duplicates in Postgres. Sync therefore looks up the existing row first (Step 5) instead of relying on the constraint.

`api/alembic/versions/0003_plugins.py`:
```python
"""plugin registry

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plugins",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("publisher", sa.String(80), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("categories", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("risk_level", sa.String(16), nullable=False),
        sa.Column("trust_level", sa.String(16), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "plugin_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("plugin_id", sa.String(120), sa.ForeignKey("plugins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.String(40), nullable=False),
        sa.Column("image", sa.String(200), nullable=False),
        sa.Column("digest", sa.String(80), nullable=True),
        sa.Column("manifest", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("plugin_id", "version", "digest", name="plugin_versions_key"),
    )
    op.create_index("ix_plugin_versions_plugin_id", "plugin_versions", ["plugin_id"])
    op.create_table(
        "plugin_installations",
        sa.Column("plugin_id", sa.String(120), sa.ForeignKey("plugins.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("plugin_version_id", sa.Uuid(), sa.ForeignKey("plugin_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("plugin_installations")
    op.drop_table("plugin_versions")
    op.drop_table("plugins")
```

- [ ] **Step 5: Sync**

`api/app/registry.py`:
```python
"""Plugin Registry sync: plugins/*/plugin.yaml -> validated -> Postgres, with image digests from the runner."""

import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.contract import load_manifest, validate_manifest
from app.models import Plugin, PluginInstallation, PluginVersion
from app.runner import RunnerClient

log = logging.getLogger("nyx.registry")


def sync_plugins(db: Session, runner: RunnerClient, root: Path | None = None) -> list[str]:
    root = root or Path(settings.plugins_dir)
    synced = []
    for path in sorted(root.glob("*/plugin.yaml")):
        if path.parent.name.startswith("_"):
            continue  # _template and friends are examples, not plugins
        try:
            m = load_manifest(path)
        except Exception as e:  # noqa: BLE001  a broken file must not stop the others
            log.warning("skipping %s: unreadable (%s)", path, e)
            continue
        if errors := validate_manifest(m):
            log.warning("skipping %s: %s", path, "; ".join(errors))
            continue
        meta, cls = m["metadata"], m["classification"]
        plugin = db.get(Plugin, meta["id"]) or Plugin(id=meta["id"])
        plugin.name, plugin.publisher, plugin.description = meta["name"], meta["publisher"], meta["description"]
        plugin.categories, plugin.risk_level, plugin.trust_level = cls["categories"], cls["risk_level"], cls["trust_level"]
        db.add(plugin)
        digest = runner.digest(m["runtime"]["image"])
        version = db.scalar(
            select(PluginVersion).where(
                PluginVersion.plugin_id == meta["id"],
                PluginVersion.version == meta["version"],
                PluginVersion.digest.is_(None) if digest is None else PluginVersion.digest == digest,
            )
        )
        if version is None:
            version = PluginVersion(plugin_id=meta["id"], version=meta["version"], image=m["runtime"]["image"], digest=digest, manifest=m)
            db.add(version)
            db.flush()
        version.manifest = m
        install = db.get(PluginInstallation, meta["id"])
        if install is None:
            db.add(PluginInstallation(plugin_id=meta["id"], plugin_version_id=version.id, enabled=True, config={}))
        else:
            install.plugin_version_id = version.id
        synced.append(meta["id"])
    db.commit()
    return synced
```

- [ ] **Step 6: Routes**

`api/app/routes/plugins.py`:
```python
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.models import Plugin, PluginInstallation, PluginVersion, User
from app.security import DB, current_user, require_role

router = APIRouter(prefix="/api/v1/plugins", tags=["plugins"])
Anyone = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_role("admin"))]


class PluginOut(BaseModel):
    id: str
    name: str
    publisher: str
    description: str
    categories: list[str]
    risk_level: str
    trust_level: str
    version: str
    image: str
    digest: str | None
    enabled: bool
    updated_at: datetime


class PluginDetailOut(PluginOut):
    manifest: dict
    runs: list[dict] = []


class PluginPatch(BaseModel):
    enabled: bool


def _row(p: Plugin, v: PluginVersion, i: PluginInstallation) -> dict:
    return {
        "id": p.id, "name": p.name, "publisher": p.publisher, "description": p.description,
        "categories": p.categories, "risk_level": p.risk_level, "trust_level": p.trust_level,
        "version": v.version, "image": v.image, "digest": v.digest, "enabled": i.enabled, "updated_at": p.updated_at,
    }


def _query():
    return (
        select(Plugin, PluginVersion, PluginInstallation)
        .join(PluginInstallation, PluginInstallation.plugin_id == Plugin.id)
        .join(PluginVersion, PluginVersion.id == PluginInstallation.plugin_version_id)
    )


def installed(db, plugin_id: str):
    row = db.execute(_query().where(Plugin.id == plugin_id)).first()
    if row is None:
        raise HTTPException(404, "No such plugin.")
    return row


@router.get("", response_model=list[PluginOut])
def list_plugins(db: DB, _: Anyone):
    return [_row(*r) for r in db.execute(_query().order_by(Plugin.name)).all()]


@router.get("/{plugin_id}", response_model=PluginDetailOut)
def get_plugin(plugin_id: str, db: DB, _: Anyone):
    p, v, i = installed(db, plugin_id)
    return {**_row(p, v, i), "manifest": v.manifest, "runs": []}


@router.patch("/{plugin_id}", response_model=PluginOut)
def patch_plugin(plugin_id: str, body: PluginPatch, db: DB, _: Admin):
    p, v, i = installed(db, plugin_id)
    i.enabled = body.enabled
    db.commit()
    return _row(p, v, i)
```
(Task 4 fills `runs` in `get_plugin`.)

In `api/app/main.py` include `plugins.router`.

- [ ] **Step 7: Migrate, test, lint, commit**

Run: `uv run alembic upgrade head && uv run alembic check && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: pass. `test_repo_manifests_are_valid` fails until Task 6 adds plugins. Mark it `@pytest.mark.skipif(not list(REPO.glob("projectdiscovery.*/plugin.yaml")), reason="plugins land in Task 6")` now, and remove the marker in Task 6.

```bash
cd .. && git add api && git commit -m "feat(api): plugin registry synced from manifests, runner client"
```

---

### Task 4: Scope-gated runs

**Files:**
- Create: `api/app/runs.py`, `api/app/routes/runs.py`, `api/alembic/versions/0004_runs.py`, `api/tests/test_runs.py`
- Modify: `api/app/models.py`, `api/app/routes/plugins.py` (start run + recent runs), `api/app/main.py` (lifespan), `api/tests/conftest.py` (truncate)

**Interfaces:**
- Consumes: `find_entry`, `refusal` (T2); `installed`, `_row` (T3); `RunnerClient`, `RunnerError`, `get_runner` (T3); `validate_event` (T1).
- Produces:
  - `app.runs.execute_run(run_id: uuid.UUID, runner: RunnerClient) -> None`;
  - `app.runs.fail_interrupted_runs(db) -> int`;
  - models `PluginRun`, `PluginEvent`.
  - HTTP:
    - `POST /api/v1/plugins/{id}/runs` → 202 `RunOut`;
    - `GET /api/v1/runs/{id}` → `RunOut`;
    - `GET /api/v1/runs/{id}/events?after=` → `list[EventOut]`.
  - `RunOut {id, plugin_id, plugin_version, target, status, error, exit_code, event_count, created_at, started_at, finished_at}`
  - `EventOut {seq, type, valid, payload}`
  - Runner request body:
    ```
    {image, digest, resources, input: {run_id, plugin_id, plugin_version, target, config, rate_limit}}
    ```
  - Trailer line: `{"runner": {"exit_code", "timed_out", "stderr_tail"}}`.

- [ ] **Step 1: Write the failing tests**

Extend the conftest truncate with `plugin_runs, plugin_events`.

`api/tests/test_runs.py`:
```python
import json
from pathlib import Path

import pytest

from app.db import SessionLocal
from app.models import PluginRun
from app.registry import sync_plugins
from app.runner import RunnerError
from app.runs import fail_interrupted_runs

REPO = Path(__file__).resolve().parents[2] / "plugins"


def event(body, **over):
    i = body["input"]
    e = {
        "event_version": "1", "type": "asset", "plugin_run_id": i["run_id"], "plugin_id": i["plugin_id"],
        "plugin_version": i["plugin_version"], "timestamp": "2026-10-08T12:00:00Z", "target": i["target"],
        "data": {"kind": "subdomain", "value": "a.example.com"},
    }
    e.update(over)
    return json.dumps(e)


def trailer(code=0, timed_out=False):
    return json.dumps({"runner": {"exit_code": code, "timed_out": timed_out, "stderr_tail": "boom" if code else ""}})


@pytest.fixture
def plugin(tmp_path, runner, client, admin):
    """The template plugin, synced with a digest, plus example.com in scope (passive only)."""
    import shutil

    root = tmp_path / "plugins"
    shutil.copytree(REPO / "schemas", root / "schemas")
    shutil.copytree(REPO / "_template", root / "example.template")
    runner.digests = {"nyx-plugin/template:0.1.0": "sha256:aaa"}
    with SessionLocal() as db:
        sync_plugins(db, runner, root)
    client.post("/api/v1/scope", json={"kind": "domain", "value": "example.com", "authorization": "test"})
    return "example.template"


def start(client, plugin, value="a.example.com", type="domain"):
    return client.post(f"/api/v1/plugins/{plugin}/runs", json={"target": {"type": type, "value": value}})


def test_run_stores_events_and_succeeds(client, runner, plugin):
    runner.lines = [event, trailer(0)]
    r = start(client, plugin)
    assert r.status_code == 202
    run = client.get(f"/api/v1/runs/{r.json()['id']}").json()
    assert run["status"] == "SUCCEEDED"
    assert run["event_count"] == 1
    [e] = client.get(f"/api/v1/runs/{run['id']}/events").json()
    assert e["valid"] is True
    assert e["payload"]["data"]["value"] == "a.example.com"
    assert runner.calls[0]["digest"] == "sha256:aaa"
    assert runner.calls[0]["input"]["target"] == {"type": "domain", "value": "a.example.com"}


def test_invalid_and_foreign_lines_are_kept_invalid(client, runner, plugin):
    runner.lines = ["not json", lambda b: event(b, plugin_run_id="someone-else"), event, trailer(0)]
    run_id = start(client, plugin).json()["id"]
    events = client.get(f"/api/v1/runs/{run_id}/events").json()
    assert [e["valid"] for e in events] == [False, False, True]
    assert client.get(f"/api/v1/runs/{run_id}").json()["status"] == "SUCCEEDED"


@pytest.mark.parametrize("tr,status", [(trailer(2), "FAILED"), (trailer(137, timed_out=True), "TIMED_OUT")])
def test_status_comes_from_trailer(client, runner, plugin, tr, status):
    runner.lines = [tr]
    run = client.get(f"/api/v1/runs/{start(client, plugin).json()['id']}").json()
    assert run["status"] == status
    if status == "FAILED":
        assert "boom" in run["error"]


def test_missing_trailer_fails(client, runner, plugin):
    runner.lines = [event]
    run = client.get(f"/api/v1/runs/{start(client, plugin).json()['id']}").json()
    assert run["status"] == "FAILED"


def test_runner_unreachable_fails_the_run(client, runner, plugin):
    runner.error = RunnerError("Runner unreachable.")
    run = client.get(f"/api/v1/runs/{start(client, plugin).json()['id']}").json()
    assert run["status"] == "FAILED"
    assert run["error"] == "Runner unreachable."


@pytest.mark.parametrize(
    "value,code,msg",
    [("example.org", 403, "not in scope"), ("evil-example.com", 403, "not in scope")],
)
def test_out_of_scope_is_refused(client, runner, plugin, value, code, msg):
    r = start(client, plugin, value)
    assert r.status_code == code
    assert msg in r.json()["detail"]
    assert runner.calls == []


def test_unsupported_target_type_is_422(client, runner, plugin):
    r = start(client, plugin, "10.0.0.1", type="ip")
    assert r.status_code == 422


def test_disabled_plugin_is_409(client, runner, plugin):
    client.patch(f"/api/v1/plugins/{plugin}", json={"enabled": False})
    assert start(client, plugin).status_code == 409


def test_gate_rechecked_on_every_start(client, runner, plugin):
    runner.lines = [trailer(0)]
    assert start(client, plugin).status_code == 202
    [entry] = client.get("/api/v1/scope").json()
    client.delete(f"/api/v1/scope/{entry['id']}")
    assert start(client, plugin).status_code == 403


def test_recent_runs_on_plugin_page(client, runner, plugin):
    runner.lines = [trailer(0)]
    start(client, plugin)
    assert len(client.get(f"/api/v1/plugins/{plugin}").json()["runs"]) == 1


def test_interrupted_runs_fail_on_startup(client, runner, plugin):
    runner.lines = [trailer(0)]
    run_id = start(client, plugin).json()["id"]
    with SessionLocal() as db:
        db.get(PluginRun, run_id).status = "RUNNING"
        db.commit()
        assert fail_interrupted_runs(db) == 1
    run = client.get(f"/api/v1/runs/{run_id}").json()
    assert (run["status"], run["error"]) == ("FAILED", "Interrupted by restart.")


def test_viewer_cannot_start_runs(client, runner, plugin):
    with SessionLocal() as db:
        from app.models import User

        db.query(User).update({"role": "viewer"})
        db.commit()
    assert start(client, plugin).status_code == 403
```

The template's risk level is passive, so a domain entry without `active_allowed` is enough. The safe_active gate is covered by the pure `test_risk_gate` table.

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest -q tests/test_runs.py`
Expected: `No module named 'app.runs'` / 404s.

- [ ] **Step 3: Models and migration**

Append to `api/app/models.py` (import `Integer`):
```python
RUN_STATUSES = ("PENDING", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT")


class PluginRun(Base):
    __tablename__ = "plugin_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plugin_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plugin_versions.id", ondelete="CASCADE"), index=True)
    target: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(12), default="PENDING")
    requested_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exit_code: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    event_count: Mapped[int] = mapped_column(Integer, default=0)


class PluginEvent(Base):
    __tablename__ = "plugin_events"

    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plugin_runs.id", ondelete="CASCADE"), primary_key=True)
    seq: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict] = mapped_column(JSONB)
    valid: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

`api/alembic/versions/0004_runs.py`:
```python
"""plugin runs and events

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plugin_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("plugin_version_id", sa.Uuid(), sa.ForeignKey("plugin_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("requested_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exit_code", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("event_count", sa.Integer(), nullable=False),
    )
    op.create_index("ix_plugin_runs_plugin_version_id", "plugin_runs", ["plugin_version_id"])
    op.create_table(
        "plugin_events",
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("plugin_runs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("seq", sa.Integer(), primary_key=True),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("valid", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("plugin_events")
    op.drop_table("plugin_runs")
```

- [ ] **Step 4: Run execution**

`api/app/runs.py`:
```python
"""Running one plugin against one target: gate, hand-off to the runner, event intake."""

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import update

from app.contract import validate_event
from app.db import SessionLocal
from app.models import PluginEvent, PluginRun, PluginVersion
from app.runner import RunnerClient, RunnerError

FINAL = ("SUCCEEDED", "FAILED", "TIMED_OUT")


def _now():
    return datetime.now(UTC)


def execute_run(run_id: uuid.UUID, runner: RunnerClient) -> None:
    with SessionLocal() as db:
        run = db.get(PluginRun, run_id)
        version = db.get(PluginVersion, run.plugin_version_id)
        m = version.manifest
        run.status, run.started_at = "RUNNING", _now()
        db.commit()
        body = {
            "image": version.image,
            "digest": version.digest,
            "resources": m["resources"],
            "input": {
                "run_id": str(run.id),
                "plugin_id": version.plugin_id,
                "plugin_version": version.version,
                "target": run.target,
                "config": {},
                "rate_limit": m["limits"]["default_rate_limit"],
            },
        }
        seq, trailer = 0, None
        try:
            for line in runner.run(body):
                if not line.strip():
                    continue
                try:
                    doc = json.loads(line)
                except json.JSONDecodeError:
                    doc = None
                if isinstance(doc, dict) and set(doc) == {"runner"}:
                    trailer = doc["runner"]
                    continue
                valid = isinstance(doc, dict) and not validate_event(doc) and doc.get("plugin_run_id") == str(run.id)
                seq += 1
                payload = doc if isinstance(doc, dict) else {"raw": line[:4000]}
                db.add(PluginEvent(run_id=run.id, seq=seq, type=str(payload.get("type", "invalid"))[:16], payload=payload, valid=valid))
                run.event_count = seq
                db.commit()
        except RunnerError as e:
            run.status, run.error = "FAILED", str(e)
        else:
            if trailer is None:
                run.status, run.error = "FAILED", "Runner ended without a result."
            else:
                run.exit_code = trailer.get("exit_code")
                if trailer.get("timed_out"):
                    run.status, run.error = "TIMED_OUT", "Stopped at the plugin's time limit."
                elif run.exit_code == 0:
                    run.status = "SUCCEEDED"
                else:
                    run.status, run.error = "FAILED", (trailer.get("stderr_tail") or f"Exit code {run.exit_code}.")[-4000:]
        run.finished_at = _now()
        db.commit()


def fail_interrupted_runs(db) -> int:
    result = db.execute(
        update(PluginRun)
        .where(PluginRun.status.in_(("PENDING", "RUNNING")))
        .values(status="FAILED", error="Interrupted by restart.", finished_at=_now())
    )
    db.commit()
    return result.rowcount
```

- [ ] **Step 5: Routes**

`api/app/routes/runs.py`:
```python
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.models import PluginEvent, PluginRun, PluginVersion, User
from app.security import DB, current_user

router = APIRouter(prefix="/api/v1/runs", tags=["runs"])
Anyone = Annotated[User, Depends(current_user)]


class RunOut(BaseModel):
    id: uuid.UUID
    plugin_id: str
    plugin_version: str
    target: dict
    status: str
    error: str | None
    exit_code: int | None
    event_count: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class EventOut(BaseModel):
    seq: int
    type: str
    valid: bool
    payload: dict


def run_out(run: PluginRun, version: PluginVersion) -> dict:
    return {
        "id": run.id, "plugin_id": version.plugin_id, "plugin_version": version.version, "target": run.target,
        "status": run.status, "error": run.error, "exit_code": run.exit_code, "event_count": run.event_count,
        "created_at": run.created_at, "started_at": run.started_at, "finished_at": run.finished_at,
    }


@router.get("/{run_id}", response_model=RunOut)
def get_run(run_id: uuid.UUID, db: DB, _: Anyone):
    run = db.get(PluginRun, run_id)
    if run is None:
        raise HTTPException(404, "No such run.")
    return run_out(run, db.get(PluginVersion, run.plugin_version_id))


@router.get("/{run_id}/events", response_model=list[EventOut])
def run_events(run_id: uuid.UUID, db: DB, _: Anyone, after: Annotated[int, Query(ge=0)] = 0):
    q = select(PluginEvent).where(PluginEvent.run_id == run_id, PluginEvent.seq > after).order_by(PluginEvent.seq)
    return db.scalars(q.limit(500)).all()
```

Add to `api/app/routes/plugins.py`:
```python
from typing import Literal

from fastapi import BackgroundTasks

from app.models import PluginRun, ScopeTarget
from app.routes.runs import RunOut, run_out
from app.runner import RunnerClient, get_runner
from app.runs import execute_run
from app.scope import find_entry, refusal

Operator = Annotated[User, Depends(require_role("admin", "analyst"))]


class Target(BaseModel):
    type: Literal["domain", "ip", "cidr", "url"]
    value: str = Field(min_length=1, max_length=2000)


class RunIn(BaseModel):
    target: Target


@router.post("/{plugin_id}/runs", status_code=202, response_model=RunOut)
def start_run(
    plugin_id: str, body: RunIn, db: DB, user: Operator, background: BackgroundTasks,
    runner: Annotated[RunnerClient, Depends(get_runner)],
):
    p, v, i = installed(db, plugin_id)
    if not i.enabled:
        raise HTTPException(409, f"{p.name} is disabled.")
    if not v.digest:
        raise HTTPException(409, f"{p.name}'s image is missing. Build it with: docker compose --profile plugins build")
    if body.target.type not in v.manifest["io"]["accepts"]:
        raise HTTPException(422, f"{p.name} does not accept {body.target.type} targets.")
    entry = find_entry(body.target.type, body.target.value, db.scalars(select(ScopeTarget)).all())
    if reason := refusal(p.risk_level, body.target.value, entry):
        raise HTTPException(403, reason)
    run = PluginRun(plugin_version_id=v.id, target=body.target.model_dump(), status="PENDING", requested_by=user.id, event_count=0)
    db.add(run)
    db.commit()
    background.add_task(execute_run, run.id, runner)
    return run_out(run, v)
```
(import `Field` from pydantic.) And in `get_plugin` fill `runs`:
```python
    recent = db.scalars(
        select(PluginRun).join(PluginVersion).where(PluginVersion.plugin_id == plugin_id).order_by(PluginRun.created_at.desc()).limit(10)
    ).all()
    return {**_row(p, v, i), "manifest": v.manifest, "runs": [run_out(r, db.get(PluginVersion, r.plugin_version_id)) for r in recent]}
```
and change `PluginDetailOut.runs` to `list[RunOut]`. Move `RunOut` and `run_out` imports above the class to avoid circular imports (`app.routes.runs` does not import `app.routes.plugins`).

- [ ] **Step 6: Startup lifespan**

`api/app/main.py`:
```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import SessionLocal
from app.registry import sync_plugins
from app.routes import auth, health, plugins, runs, scope
from app.runner import get_runner
from app.runs import fail_interrupted_runs


@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as db:
        if n := fail_interrupted_runs(db):
            logging.getLogger("nyx").warning("marked %d interrupted runs as failed", n)
        sync_plugins(db, get_runner())
    yield


app = FastAPI(title="NYX API", version="0.2.0", lifespan=lifespan)
for r in (health, auth, scope, plugins, runs):
    app.include_router(r.router)
```
(Tests use `TestClient(app)` without `with`, so the lifespan does not run in tests.)

- [ ] **Step 7: Migrate, test, lint, commit**

Run: `uv run alembic upgrade head && uv run alembic check && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: pass.

```bash
cd .. && git add api && git commit -m "feat(api): scope-gated plugin runs with streamed, validated events"
```

---

### Task 5: nyx-runner

**Files:**
- Create: `runner/pyproject.toml` (uv), `runner/app/__init__.py`, `runner/app/sandbox.py`, `runner/app/main.py`, `runner/Dockerfile`, `runner/.dockerignore`, `runner/tests/test_sandbox.py`, `runner/tests/test_runs.py`, `runner/tests/fixtures/echo/Dockerfile`

**Interfaces:**
- Consumes: the runner request body and trailer from Task 4.
- Produces:
  - `app.sandbox.container_config(resources: dict, input: dict) -> dict` (kwargs for `docker.containers.run`);
  - `app.sandbox.NETWORK = "nyx-plugins"`;
  - HTTP:
    - `GET /v1/images/{image:path}` → `{digest}` | 404;
    - `POST /v1/runs` → JSONL stream plus trailer;
    - 401 without the token; 429 when busy.

- [ ] **Step 1: Project**

```bash
mkdir -p runner/app runner/tests/fixtures/echo && cd runner
uv init --bare --python 3.12 --name nyx-runner
uv add fastapi "uvicorn[standard]" docker pydantic-settings
uv add --dev pytest httpx2 ruff
printf '3.12\n' > .python-version
```
Append the same `[tool.ruff]`, `[tool.ruff.lint]` and `[tool.pytest.ini_options]` (`testpaths`, `pythonpath = ["."]`) blocks as `api/pyproject.toml`. Add `runner/.dockerignore`: `.venv`, `__pycache__`, `.pytest_cache`, `.ruff_cache`, `tests`, `.env*`.

- [ ] **Step 2: Write the failing tests**

`runner/tests/test_sandbox.py`:
```python
import json

from app.sandbox import NETWORK, container_config


def test_container_is_locked_down():
    cfg = container_config({"cpu": 0.5, "memory_mb": 256, "timeout_seconds": 60}, {"run_id": "r1"})
    assert cfg["read_only"] is True
    assert cfg["tmpfs"] == {"/tmp": "size=64m"}
    assert cfg["cap_drop"] == ["ALL"]
    assert cfg["security_opt"] == ["no-new-privileges"]
    assert cfg["user"] == "65534:65534"
    assert cfg["pids_limit"] == 256
    assert cfg["mem_limit"] == "256m"
    assert cfg["nano_cpus"] == 500_000_000
    assert cfg["network"] == NETWORK
    assert cfg["privileged"] is False
    assert "volumes" not in cfg and "mounts" not in cfg
    assert json.loads(cfg["environment"]["NYX_INPUT"]) == {"run_id": "r1"}
```

`runner/tests/fixtures/echo/Dockerfile`:
```dockerfile
FROM busybox:1.37
# Two event-ish lines, one to stderr, then either exit or hang (SLEEP env) for the timeout test.
CMD ["sh", "-c", "echo '{\"a\":1}'; echo '{\"b\":2}'; echo oops >&2; sleep ${SLEEP:-0}; exit ${CODE:-0}"]
```

`runner/tests/test_runs.py`:
```python
import json
import os

import docker
import pytest
from fastapi.testclient import TestClient

TOKEN = "test-token"
os.environ["NYX_RUNNER_TOKEN"] = TOKEN

from app.main import app  # noqa: E402

try:
    client_docker = docker.from_env()
    client_docker.ping()
except Exception:  # noqa: BLE001
    client_docker = None
needs_docker = pytest.mark.skipif(client_docker is None, reason="Docker not available")
H = {"authorization": f"Bearer {TOKEN}"}


@pytest.fixture(scope="module")
def echo_image():
    image, _ = client_docker.images.build(path=os.path.join(os.path.dirname(__file__), "fixtures", "echo"), tag="nyx-test/echo:1")
    return image.id


def run(c, digest, timeout=30, env=None):
    body = {"image": "nyx-test/echo:1", "digest": digest, "resources": {"cpu": 0.5, "memory_mb": 64, "timeout_seconds": timeout}, "input": {"run_id": "r1", **(env or {})}}
    r = c.post("/v1/runs", json=body, headers=H)
    return r.status_code, [json.loads(line) for line in r.text.splitlines() if line]


def test_token_required():
    c = TestClient(app)
    assert c.get("/v1/images/x:1").status_code == 401
    assert c.get("/v1/images/x:1", headers={"authorization": "Bearer wrong"}).status_code == 401


@needs_docker
def test_image_digest(echo_image):
    c = TestClient(app)
    assert c.get("/v1/images/nyx-test/echo:1", headers=H).json() == {"digest": echo_image}
    assert c.get("/v1/images/nyx-test/missing:1", headers=H).status_code == 404


@needs_docker
def test_run_streams_stdout_then_trailer(echo_image):
    code, lines = run(TestClient(app), echo_image)
    assert code == 200
    assert lines[:2] == [{"a": 1}, {"b": 2}]
    assert lines[-1]["runner"]["exit_code"] == 0
    assert lines[-1]["runner"]["timed_out"] is False
    assert "oops" in lines[-1]["runner"]["stderr_tail"]


@needs_docker
def test_timeout_kills_container(echo_image, monkeypatch):
    monkeypatch.setattr("app.main.EXTRA_ENV", {"SLEEP": "60"})
    code, lines = run(TestClient(app), echo_image, timeout=5)
    assert lines[-1]["runner"]["timed_out"] is True
    assert not client_docker.containers.list(all=True, filters={"ancestor": echo_image})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run pytest -q`
Expected: `No module named 'app.sandbox'`.

- [ ] **Step 4: Sandbox**

`runner/app/sandbox.py`:
```python
"""How a plugin container is allowed to run. One pure function so every flag is visible and tested."""

import json

NETWORK = "nyx-plugins"


def container_config(resources: dict, input: dict, extra_env: dict | None = None) -> dict:
    return {
        "detach": True,
        "read_only": True,
        "tmpfs": {"/tmp": "size=64m"},
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges"],
        "user": "65534:65534",
        "privileged": False,
        "pids_limit": 256,
        "mem_limit": f"{int(resources['memory_mb'])}m",
        "nano_cpus": int(float(resources["cpu"]) * 1_000_000_000),
        "network": NETWORK,
        "environment": {"NYX_INPUT": json.dumps(input), **(extra_env or {})},
        "labels": {"nyx.run_id": str(input.get("run_id", ""))},
    }
```

- [ ] **Step 5: Service**

`runner/app/main.py`:
```python
"""nyx-runner: the only NYX component with the Docker socket. Starts one locked-down container per plugin run."""

import json
import secrets
import threading
from typing import Annotated

import docker
from docker.errors import ImageNotFound, NotFound
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.sandbox import NETWORK, container_config


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NYX_RUNNER_")
    token: str = ""
    max_runs: int = 4


settings = Settings()
app = FastAPI(title="NYX runner", version="0.1.0")
slots = threading.BoundedSemaphore(settings.max_runs)
EXTRA_ENV: dict = {}  # tests only


def authorized(authorization: Annotated[str, Header()] = "") -> None:
    if not settings.token or not secrets.compare_digest(authorization, f"Bearer {settings.token}"):
        raise HTTPException(401, "Bad runner token.")


Auth = Depends(authorized)


def engine() -> docker.DockerClient:
    return docker.from_env()


def ensure_network(d: docker.DockerClient) -> None:
    # Checked on every run (one cheap API call) so a deleted network heals itself and no startup hook is needed.
    if not d.networks.list(names=[NETWORK]):
        d.networks.create(NETWORK, driver="bridge")


@app.get("/v1/images/{image:path}", dependencies=[Auth])
def image_digest(image: str):
    try:
        return {"digest": engine().images.get(image).id}
    except ImageNotFound:
        raise HTTPException(404, "Image not found.") from None


class RunIn(BaseModel):
    image: str
    digest: str
    resources: dict
    input: dict


@app.post("/v1/runs", dependencies=[Auth])
def start(body: RunIn):
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Runner is busy. Try again in a moment.")
    try:
        d = engine()
        ensure_network(d)
        container = d.containers.run(body.digest, **container_config(body.resources, body.input, EXTRA_ENV))
    except Exception as e:  # noqa: BLE001
        slots.release()
        raise HTTPException(500, f"Could not start the plugin: {e}") from None
    return StreamingResponse(stream(container, int(body.resources["timeout_seconds"])), media_type="application/x-ndjson")


def stream(container, timeout: int):
    timed_out = threading.Event()

    def kill():
        timed_out.set()
        try:
            container.kill()
        except NotFound:
            pass

    timer = threading.Timer(timeout, kill)
    timer.start()
    try:
        buf = b""
        for chunk in container.logs(stream=True, follow=True, stdout=True, stderr=False):
            buf += chunk
            *lines, buf = buf.split(b"\n")
            for line in lines:
                yield line + b"\n"
        if buf:
            yield buf + b"\n"
        code = container.wait().get("StatusCode")
        stderr = container.logs(stdout=False, stderr=True)[-4096:].decode("utf-8", "replace")
        yield (json.dumps({"runner": {"exit_code": code, "timed_out": timed_out.is_set(), "stderr_tail": stderr}}) + "\n").encode()
    finally:
        timer.cancel()
        try:
            container.remove(force=True)
        except NotFound:
            pass
        slots.release()
```

- [ ] **Step 6: Image**

`runner/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH=/app/.venv/bin:$PATH
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY . .
# ponytail: runs as root because it talks to the Docker socket; it is the one privileged piece, reachable only on nyx-internal.
EXPOSE 8100
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
```

- [ ] **Step 7: Test, lint, commit**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass, including the Docker tests (Docker Desktop is running locally).

```bash
cd .. && git add runner && git commit -m "feat(runner): sandboxed plugin containers with streamed output and timeouts"
```

---

### Task 6: Three plugins

**Files:**
- Create, for each of `projectdiscovery.subfinder`, `projectdiscovery.dnsx`, `projectdiscovery.httpx`: `plugin.yaml`, `Dockerfile`, `adapter.py`, `fixtures/output.jsonl`
- Create: `api/tests/test_adapters.py`
- Modify: `api/tests/test_registry.py` (drop the skip marker)

**Interfaces:**
- Consumes: SDK (T1), schemas (T1).
- Produces: images `nyx-plugin/subfinder:2.16.0`, `nyx-plugin/dnsx:1.3.1`, `nyx-plugin/httpx:1.12.0`.

- [ ] **Step 1: Write the failing adapter tests**

`api/tests/test_adapters.py`:
```python
import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

from app.contract import validate_event

ROOT = Path(__file__).resolve().parents[2] / "plugins"
CASES = {
    "projectdiscovery.subfinder": ({"type": "domain", "value": "example.com"}, {"asset", "relation"}),
    "projectdiscovery.dnsx": ({"type": "domain", "value": "example.com"}, {"asset", "relation"}),
    "projectdiscovery.httpx": ({"type": "domain", "value": "testbed.nyx-lab.test"}, {"asset"}),
}


@pytest.mark.parametrize("plugin", sorted(CASES))
def test_adapter_turns_fixture_into_valid_events(plugin):
    target, must_have = CASES[plugin]
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "sdk"),
        "NYX_FIXTURE": str(ROOT / plugin / "fixtures" / "output.jsonl"),
        "NYX_INPUT": json.dumps(
            {"run_id": "r1", "plugin_id": plugin, "plugin_version": "x", "target": target, "config": {}, "rate_limit": 10}
        ),
    }
    out = subprocess.run([sys.executable, str(ROOT / plugin / "adapter.py")], env=env, capture_output=True, text=True, check=True)
    events = [json.loads(line) for line in out.stdout.splitlines()]
    assert all(validate_event(e) == [] for e in events)
    kinds = Counter(e["type"] for e in events)
    assert must_have <= set(kinds)
    assert kinds["progress"] == 2
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && uv run pytest -q tests/test_adapters.py`
Expected: FAIL (adapter files missing).

- [ ] **Step 3: Subfinder**

`plugins/projectdiscovery.subfinder/plugin.yaml`:
```yaml
api_version: platform.security/v1
kind: ScannerPlugin
metadata:
  id: projectdiscovery.subfinder
  name: Subfinder
  publisher: ProjectDiscovery
  version: 2.16.0
  license: MIT
  description: Finds subdomains from public sources (certificate logs, DNS datasets, search engines). Never touches the target.
runtime:
  type: oci
  image: nyx-plugin/subfinder:2.16.0
classification:
  categories: [discovery]
  risk_level: passive
  trust_level: verified
io:
  accepts: [domain]
  produces: [asset, relation, log, progress]
resources:
  cpu: 1.0
  memory_mb: 256
  timeout_seconds: 300
permissions:
  network: target_scope
  filesystem: temporary
  raw_socket: false
  host_mounts: false
  docker_socket: false
limits:
  default_rate_limit: 20
config_schema:
  type: object
  properties: {}
```

`plugins/projectdiscovery.subfinder/adapter.py`:
```python
"""Subfinder -> NYX events: every subdomain becomes an asset and a subdomain_of relation."""

from nyx_plugin import INPUT, emit, progress, run_tool

domain = INPUT["target"]["value"]
rate = str(INPUT.get("rate_limit", 20))
progress(0)
seen = set()
for rec in run_tool(["subfinder", "-d", domain, "-oJ", "-silent", "-duc", "-rl", rate]):
    host = rec.get("host", "").lower()
    if not host or host in seen:
        continue
    seen.add(host)
    emit("asset", {"kind": "subdomain", "value": host, "source": rec.get("source")})
    emit("relation", {"from": host, "to": domain, "kind": "subdomain_of"})
progress(100)
```

`plugins/projectdiscovery.subfinder/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
# Context: plugins/   (docker compose --profile plugins build)
FROM python:3.12-slim AS fetch
ARG TARGETARCH
ARG VERSION=2.16.0
ARG SHA256_amd64=1b7f9c608e9a5bd59e609a5e09710d63c5485e92d3d49dc2c16eb4fdbe10cb60
ARG SHA256_arm64=c81d49559c0f630177be9e347e502e7a3d474aacc6ff78291ffcb4964367d63d
ADD https://github.com/projectdiscovery/subfinder/releases/download/v${VERSION}/subfinder_${VERSION}_linux_${TARGETARCH}.zip /tmp/tool.zip
RUN eval "sum=\$SHA256_${TARGETARCH}" && echo "$sum  /tmp/tool.zip" | sha256sum -c - \
 && python -m zipfile -e /tmp/tool.zip /tmp/tool && chmod 0755 /tmp/tool/subfinder

FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY --from=fetch /tmp/tool/subfinder /usr/local/bin/subfinder
COPY sdk/nyx_plugin.py projectdiscovery.subfinder/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]
```

- [ ] **Step 4: dnsx**

`plugins/projectdiscovery.dnsx/plugin.yaml`: same shape as Subfinder with
- `id: projectdiscovery.dnsx`, `name: dnsx`, `version: 1.3.1`;
- `description: Resolves a domain's A and AAAA records. Asks public resolvers, not the target.`;
- `image: nyx-plugin/dnsx:1.3.1`, `categories: [discovery, dns]`, `risk_level: passive`;
- `resources: {cpu: 0.5, memory_mb: 128, timeout_seconds: 120}`, `default_rate_limit: 50`.
Write every field out in the file; do not leave any to inference.

`plugins/projectdiscovery.dnsx/adapter.py`:
```python
"""dnsx -> NYX events: each resolved address becomes an ip asset and a resolves_to relation."""

from nyx_plugin import INPUT, emit, progress, run_tool

domain = INPUT["target"]["value"]
progress(0)
for rec in run_tool(["dnsx", "-a", "-aaaa", "-resp", "-json", "-silent", "-duc", "-rl", str(INPUT.get("rate_limit", 50))], stdin=domain + "\n"):
    host = rec.get("host", domain)
    for ip in [*rec.get("a", []), *rec.get("aaaa", [])]:
        emit("asset", {"kind": "ip", "value": ip})
        emit("relation", {"from": host, "to": ip, "kind": "resolves_to"})
progress(100)
```

`plugins/projectdiscovery.dnsx/Dockerfile`: the Subfinder Dockerfile with `dnsx` everywhere, `VERSION=1.3.1`, `SHA256_amd64=438b964653056dd51dcfe614b1a16f8bced3cc48a1d27bc07cc6fdf2ef2a9533`, `SHA256_arm64=dd657dd1ccee5e137eca2dbad0e97dbd067555f744adb97efcda774f1b2fbde1`. Write the full file.

- [ ] **Step 5: httpx**

`plugins/projectdiscovery.httpx/plugin.yaml`: same shape with
- `id: projectdiscovery.httpx`, `name: httpx`, `version: 1.12.0`;
- `description: Probes a host over HTTP(S) and records what answers: status, title, server, technologies.`;
- `image: nyx-plugin/httpx:1.12.0`, `categories: [discovery, web]`, `risk_level: safe_active`;
- `accepts: [domain, url]`, `produces: [asset, log, progress]`;
- `resources: {cpu: 1.0, memory_mb: 256, timeout_seconds: 300}`, `default_rate_limit: 10`.

`plugins/projectdiscovery.httpx/adapter.py`:
```python
"""httpx -> NYX events: every live HTTP endpoint becomes an http_service asset."""

from nyx_plugin import INPUT, emit, progress, run_tool

target = INPUT["target"]["value"]
progress(0)
cmd = ["httpx", "-json", "-silent", "-duc", "-sc", "-title", "-td", "-server", "-rl", str(INPUT.get("rate_limit", 10))]
for rec in run_tool(cmd, stdin=target + "\n"):
    url = rec.get("url")
    if not url:
        continue
    emit(
        "asset",
        {
            "kind": "http_service",
            "value": url,
            "status_code": rec.get("status_code"),
            "title": rec.get("title"),
            "webserver": rec.get("webserver"),
            "tech": rec.get("tech", []),
            "ip": rec.get("host"),
        },
    )
progress(100)
```

`plugins/projectdiscovery.httpx/Dockerfile`: as above with `httpx`, `VERSION=1.12.0`, `SHA256_amd64=9d8439e8b6c9aa7d1e2314817a392e00d5178da3af5652f7475f88868f418f76`, `SHA256_arm64=fd7b123c1dfbc3d69f19f524e4eebcd6ec06b9a6cbd56813c76f11645197331e`.

- [ ] **Step 6: Build images and record real fixtures**

Compose services come in Task 7. For now build directly:
```bash
docker build -f plugins/projectdiscovery.subfinder/Dockerfile -t nyx-plugin/subfinder:2.16.0 plugins
docker build -f plugins/projectdiscovery.dnsx/Dockerfile -t nyx-plugin/dnsx:1.3.1 plugins
docker build -f plugins/projectdiscovery.httpx/Dockerfile -t nyx-plugin/httpx:1.12.0 plugins
```
Expected: each build passes `sha256sum -c` (`/tmp/tool.zip: OK`).

Record the raw tool output (passive only for public targets; httpx only against a local container):
```bash
docker run --rm --entrypoint subfinder nyx-plugin/subfinder:2.16.0 -d example.com -oJ -silent -duc | head -20 > plugins/projectdiscovery.subfinder/fixtures/output.jsonl
echo example.com | docker run --rm -i --entrypoint dnsx nyx-plugin/dnsx:1.3.1 -a -aaaa -resp -json -silent -duc > plugins/projectdiscovery.dnsx/fixtures/output.jsonl
docker network create nyx-lab-tmp && docker run -d --rm --name testbed --network nyx-lab-tmp --network-alias testbed.nyx-lab.test nginx:1.27-alpine
echo testbed.nyx-lab.test | docker run --rm -i --network nyx-lab-tmp --entrypoint httpx nyx-plugin/httpx:1.12.0 -json -silent -duc -sc -title -td -server > plugins/projectdiscovery.httpx/fixtures/output.jsonl
docker rm -f testbed && docker network rm nyx-lab-tmp
```
Expected: each fixture has at least one JSON line. If subfinder finds nothing for `example.com` within its sources, record whatever it returns. If that is empty, write two lines by hand in the documented format, `{"host":"www.example.com","input":"example.com","source":"crtsh"}`, and ledger the ruling. Strip any field that contains local paths.

- [ ] **Step 7: Run tests**

Remove the `skipif` from `test_repo_manifests_are_valid`. Run: `cd api && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass, including `test_adapters` ×3 and `test_repo_manifests_are_valid`.

- [ ] **Step 8: Run one image the way the runner will (smoke)**

```bash
docker run --rm --read-only --tmpfs /tmp:size=64m --cap-drop ALL --security-opt no-new-privileges --user 65534:65534 \
  -e NYX_INPUT='{"run_id":"smoke","plugin_id":"projectdiscovery.dnsx","plugin_version":"1.3.1","target":{"type":"domain","value":"example.com"},"config":{},"rate_limit":50}' \
  nyx-plugin/dnsx:1.3.1
```
Expected: JSON event lines (progress 0, ip assets and relations, progress 100) and exit 0. If a tool needs a writable path other than `/tmp`, fix it via `HOME=/tmp` or a tool flag and ledger the ruling, never by dropping `--read-only`.

- [ ] **Step 9: Commit**

```bash
git add plugins api/tests && git commit -m "feat(plugins): subfinder, dnsx and httpx with pinned binaries and contract fixtures"
```

---

### Task 7: Compose and CI

**Files:**
- Create: `.dockerignore` (root)
- Modify: `docker-compose.yml`, `api/Dockerfile`, `.github/workflows/ci.yml`, `api/app/config.py` (no change expected; verify `/plugins` resolution)

**Interfaces:**
- Consumes: all of the above.
- Produces: `docker compose --profile plugins build && docker compose up --build` starts postgres, api, runner, web; the API syncs three plugins with digests at startup.

- [ ] **Step 1: API image includes plugins**

Root `.dockerignore`:
```
**/.venv
**/__pycache__
**/.pytest_cache
**/.ruff_cache
**/node_modules
**/.next
**/.env*
.git
.superpowers
web
```

`api/Dockerfile` (context becomes the repo root):
```dockerfile
# syntax=docker/dockerfile:1
# Context: repo root (needs plugins/ for manifests and schemas)
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH=/app/.venv/bin:$PATH
COPY api/pyproject.toml api/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY api/ .
COPY plugins/ /plugins/
RUN useradd --system nyx
USER nyx
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
```
Delete `api/.dockerignore` (the root one replaces it; `tests` stay in the image, which is harmless).

- [ ] **Step 2: Compose**

Changes to `docker-compose.yml`:
- `api.build` → `{context: ., dockerfile: api/Dockerfile}`;
- `api.environment` += `NYX_RUNNER_URL: http://runner:8100`, `NYX_RUNNER_TOKEN: ${NYX_RUNNER_TOKEN:-nyx-local-runner-token}`;
- `api.depends_on` += `runner: {condition: service_started}`.

New services:
```yaml
  runner:
    build: ./runner
    restart: unless-stopped
    environment:
      NYX_RUNNER_TOKEN: ${NYX_RUNNER_TOKEN:-nyx-local-runner-token}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    # No ports: only the API talks to it, over the compose network.

  plugin-subfinder:
    profiles: ["plugins"]
    image: nyx-plugin/subfinder:2.16.0
    build: {context: ./plugins, dockerfile: projectdiscovery.subfinder/Dockerfile}

  plugin-dnsx:
    profiles: ["plugins"]
    image: nyx-plugin/dnsx:1.3.1
    build: {context: ./plugins, dockerfile: projectdiscovery.dnsx/Dockerfile}

  plugin-httpx:
    profiles: ["plugins"]
    image: nyx-plugin/httpx:1.12.0
    build: {context: ./plugins, dockerfile: projectdiscovery.httpx/Dockerfile}

  testbed:
    # Local lab target for safe_active plugins: add scope "nyx-lab.test" (active allowed), run httpx on testbed.nyx-lab.test.
    profiles: ["lab"]
    image: nginx:1.27-alpine
    networks:
      nyx-plugins:
        aliases: [testbed.nyx-lab.test]
```
Add at the bottom:
```yaml
networks:
  nyx-plugins:
    name: nyx-plugins
```
The runner also creates `nyx-plugins` if it is missing, so plain runs work without the lab profile.

The default runner token is for a local single-machine setup only. The runner has no published port, and the README tells production installs to set `NYX_RUNNER_TOKEN`.

- [ ] **Step 3: CI**

Changes to `.github/workflows/ci.yml`:
- Add top-level `permissions: {contents: read}`. This picks up the Phase 1 deferred minor, since this task touches the file anyway.
- In the `api` job, add a `run: uv run pytest -q` before nothing else — no change; the adapter tests need only Python. The `api` job's `working-directory: api` stays; the adapter tests find `../plugins` by path.
- New `runner` job:
```yaml
  runner:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: runner
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync --frozen
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run pytest -q
```
- New `images` job (it builds every Dockerfile, which proves the checksums and contexts):
```yaml
  images:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose --profile plugins build
      - run: docker compose build
```

- [ ] **Step 4: Bring it up and check**

```bash
docker compose --profile plugins build && docker compose up -d --build --wait
docker compose logs api | grep -i "skipping" || echo "no manifests skipped"
curl -s -b /tmp/cj -c /tmp/cj -X POST 127.0.0.1:8000/api/v1/auth/login -H 'content-type: application/json' -d "{\"email\":\"$NYX_EMAIL\",\"password\":\"$NYX_PASSWORD\"}" >/dev/null
curl -s -b /tmp/cj 127.0.0.1:8000/api/v1/plugins | python -m json.tool | grep -E '"id"|"digest"'
```
Expected: three plugin ids, each with a `sha256:` digest. (`NYX_EMAIL` and `NYX_PASSWORD` are the account the user already has; do not create new accounts in the user's database.)

- [ ] **Step 5: Commit**

```bash
git add .dockerignore docker-compose.yml api/Dockerfile .github/workflows/ci.yml && git rm -q api/.dockerignore
git commit -m "chore: runner, plugin images and lab testbed in compose; CI for runner and images"
```

---

### Task 8: Web — plugins and scope

**Files:**
- Modify: `web/src/lib/types.ts`, `web/src/lib/api/client.ts`, `web/src/lib/api/hooks.ts`, `web/src/lib/mocks/data.ts` (remove `plugins`), `web/src/lib/nav.ts` (settings tab label), `web/src/app/app/plugins/page.tsx`, `web/src/app/app/plugins/[pluginSlug]/page.tsx`, `web/src/app/app/settings/policies/page.tsx`
- Create: `web/src/components/plugins/plugins-table.tsx`, `web/src/components/plugins/plugin-detail.tsx`, `web/src/components/plugins/run-panel.tsx`, `web/src/components/plugins/risk-badge.tsx`, `web/src/components/scope/scope-manager.tsx`

**Interfaces:**
- Consumes: HTTP from Tasks 2–4.
- Produces: types `PluginSummary`, `PluginDetail`, `PluginRun`, `PluginEvent`, `ScopeEntry`; hooks `usePlugins`, `usePlugin(id)`, `useRun(id)`, `useRunEvents(id, live)`, `useScope`.

- [ ] **Step 1: Types and client**

In `web/src/lib/types.ts` replace the `Plugin` type with:
```ts
export type RiskLevel = "passive" | "safe_active" | "active" | "intrusive";
export type TargetType = "domain" | "ip" | "cidr" | "url";
export type Target = { type: TargetType; value: string };

export type PluginSummary = {
  id: string; name: string; publisher: string; description: string; categories: string[];
  risk_level: RiskLevel; trust_level: "verified" | "community" | "custom";
  version: string; image: string; digest: string | null; enabled: boolean; updated_at: string;
};

export type RunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";
export type PluginRun = {
  id: string; plugin_id: string; plugin_version: string; target: Target; status: RunStatus;
  error: string | null; exit_code: number | null; event_count: number;
  created_at: string; started_at: string | null; finished_at: string | null;
};

export type PluginManifest = {
  io: { accepts: TargetType[]; produces: string[] };
  resources: { cpu: number; memory_mb: number; timeout_seconds: number };
  permissions: Record<string, string | boolean>;
  limits: { default_rate_limit: number };
};
export type PluginDetail = PluginSummary & { manifest: PluginManifest; runs: PluginRun[] };

export type PluginEvent = { seq: number; type: string; valid: boolean; payload: { data?: Record<string, unknown>; raw?: string } };

export type ScopeEntry = { id: string; kind: "domain" | "cidr"; value: string; active_allowed: boolean; authorization: string; created_at: string };
export type ScopeInput = Omit<ScopeEntry, "id" | "created_at">;
```

In `web/src/lib/api/client.ts`:
- remove `plugins` from the mocks import and `Plugin` from the types import;
- generalize `post` to send any method: `const send = <T,>(method: string, path: string, body?: unknown) => call<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });` and `const post = <T,>(path: string, body?: unknown) => send<T>("POST", path, body);`;
- replace `listPlugins` with:
```ts
  listPlugins: () => call<PluginSummary[]>("/plugins"),
  getPlugin: (id: string) => call<PluginDetail>(`/plugins/${encodeURIComponent(id)}`),
  setPluginEnabled: (id: string, enabled: boolean) => send<PluginSummary>("PATCH", `/plugins/${encodeURIComponent(id)}`, { enabled }),
  startRun: (id: string, target: Target) => post<PluginRun>(`/plugins/${encodeURIComponent(id)}/runs`, { target }),
  getRun: (id: string) => call<PluginRun>(`/runs/${id}`),
  runEvents: (id: string) => call<PluginEvent[]>(`/runs/${id}/events`),
  listScope: () => call<ScopeEntry[]>("/scope"),
  addScope: (body: ScopeInput) => post<ScopeEntry>("/scope", body),
  removeScope: (id: string) => send<void>("DELETE", `/scope/${id}`),
```
Remove `plugins` from `web/src/lib/mocks/data.ts`.

`web/src/lib/api/hooks.ts`: replace `usePlugins` and add:
```ts
const live = (s?: RunStatus) => s === "PENDING" || s === "RUNNING";

export const usePlugins = () => useQuery({ queryKey: ["plugins"], queryFn: api.listPlugins });
export const usePlugin = (id: string) => useQuery({ queryKey: ["plugins", id], queryFn: () => api.getPlugin(id) });
export const useRun = (id: string | null) =>
  useQuery({ queryKey: ["runs", id], queryFn: () => api.getRun(id!), enabled: !!id, refetchInterval: (q) => (live(q.state.data?.status) ? 1000 : false) });
// ponytail: refetches the whole event list (≤500) each second; switch to ?after=<seq> paging if runs grow past that.
export const useRunEvents = (id: string | null, polling: boolean) =>
  useQuery({ queryKey: ["runs", id, "events"], queryFn: () => api.runEvents(id!), enabled: !!id, refetchInterval: polling ? 1000 : false });
export const useScope = () => useQuery({ queryKey: ["scope"], queryFn: api.listScope });
```
(import `RunStatus` type.)

In `web/src/lib/nav.ts`: change the settings tab label `"Policies"` to `"Scope"` (href unchanged).

- [ ] **Step 2: Risk badge**

`web/src/components/plugins/risk-badge.tsx`:
```tsx
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

const tone: Record<RiskLevel, string> = {
  passive: "border-sev-low/40 text-sev-low",
  safe_active: "border-sev-medium/40 text-sev-medium",
  active: "border-sev-high/40 text-sev-high",
  intrusive: "border-sev-critical/40 text-sev-critical",
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider", tone[risk])}>{risk.replace("_", " ")}</span>;
}
```
(Check that `--sev-high` exists in `globals.css`. If not, use `text-sev-critical/80`, and ledger it.)

- [ ] **Step 3: Plugins table**

`web/src/components/plugins/plugins-table.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { api } from "@/lib/api/client";
import { useMe, usePlugins } from "@/lib/api/hooks";

export function PluginsTable() {
  const { data, isLoading, error } = usePlugins();
  const { data: me } = useMe();
  const qc = useQueryClient();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the registry…</p>;
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No plugins registered. Check the API logs for skipped manifests.</p>;

  const toggle = async (id: string, enabled: boolean) => {
    await api.setPluginEnabled(id, enabled);
    qc.invalidateQueries({ queryKey: ["plugins"] });
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-subtle">
          <tr>{["Plugin", "Risk", "Trust", "Version", "Image", "Enabled"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-1">
              <td className="px-4 py-3">
                <Link href={`/app/plugins/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                <p className="text-xs text-subtle">{p.publisher} · {p.categories.join(", ")}</p>
              </td>
              <td className="px-4 py-3"><RiskBadge risk={p.risk_level} /></td>
              <td className="px-4 py-3 text-muted-foreground">{p.trust_level}</td>
              <td className="px-4 py-3 font-mono text-xs">{p.version}</td>
              <td className="px-4 py-3 font-mono text-xs">{p.digest ? p.digest.slice(7, 19) : <span className="text-sev-critical">image missing</span>}</td>
              <td className="px-4 py-3">
                {me?.role === "admin" ? (
                  <input type="checkbox" aria-label={`Enable ${p.name}`} checked={p.enabled} onChange={(e) => toggle(p.id, e.target.checked)} />
                ) : (p.enabled ? "Yes" : "No")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`web/src/app/app/plugins/page.tsx`:
```tsx
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { PluginsTable } from "@/components/plugins/plugins-table";

export const metadata: Metadata = { title: "Plugins" };

export default function Page() {
  return (
    <>
      <PageHeader title="Plugins" description="Every scanner I can run, pinned to an exact image. Each one runs in its own locked-down container." />
      <PluginsTable />
    </>
  );
}
```

- [ ] **Step 4: Plugin detail and run panel**

`web/src/components/plugins/run-panel.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useRun, useRunEvents, useScope } from "@/lib/api/hooks";
import type { PluginDetail, PluginEvent, TargetType } from "@/lib/types";
import { cn } from "@/lib/utils";

const live = (s?: string) => s === "PENDING" || s === "RUNNING";

export function RunPanel({ plugin }: { plugin: PluginDetail }) {
  const { data: scope } = useScope();
  const qc = useQueryClient();
  const accepts = plugin.manifest.io.accepts;
  const [type, setType] = useState<TargetType>(accepts[0]);
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const { data: run } = useRun(runId);
  const { data: events } = useRunEvents(runId, live(run?.status) || !run);

  const suggestions = useMemo(() => (scope ?? []).filter((s) => s.kind === "domain").map((s) => s.value), [scope]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api.startRun(plugin.id, { type, value: value.trim() });
      setRunId(r.id);
      qc.invalidateQueries({ queryKey: ["plugins", plugin.id] });
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-sm font-semibold">Run against one target</h2>
      <p className="mt-1 text-xs text-muted-foreground">Only targets in scope. {plugin.risk_level !== "passive" && "This plugin touches the target, so its scope entry must allow active scanning."}</p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as TargetType)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
          {accepts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <Input list="scope-domains" value={value} onChange={(e) => setValue(e.target.value)} placeholder={suggestions[0] ?? "example.com"} className="max-w-xs" aria-label="Target" />
        <datalist id="scope-domains">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <Button type="submit" disabled={busy || !value.trim()}>{busy ? "Starting…" : "Run"}</Button>
      </form>
      {err && <p role="alert" className="mt-2 text-sm text-sev-critical">{err}</p>}
      {run && (
        <div className="mt-5">
          <p className="text-xs text-subtle">
            <span className={cn("font-mono", run.status === "SUCCEEDED" ? "text-sev-low" : live(run.status) ? "text-sev-medium" : "text-sev-critical")}>{run.status}</span>
            {" · "}{run.target.value}{" · "}{run.event_count} events{run.error && <> · <span className="text-sev-critical">{run.error}</span></>}
          </p>
          <EventList events={events ?? []} />
        </div>
      )}
    </section>
  );
}

function EventList({ events }: { events: PluginEvent[] }) {
  if (!events.length) return null;
  return (
    <ol className="mt-3 max-h-96 overflow-y-auto rounded-md border border-border font-mono text-xs">
      {events.map((e) => {
        const d = e.payload.data ?? {};
        const text = e.type === "asset" ? `${d.kind} ${d.value}` : e.type === "relation" ? `${d.from} → ${d.kind} → ${d.to}` : e.type === "log" ? String(d.message) : e.type === "progress" ? `${d.percent}%` : JSON.stringify(d).slice(0, 160);
        return (
          <li key={e.seq} className={cn("flex gap-3 border-b border-border px-3 py-1.5 last:border-0", !e.valid && "bg-sev-critical/10", (e.type === "log" || e.type === "progress") && "text-subtle")}>
            <span className="w-16 shrink-0 text-subtle">{e.valid ? e.type : "invalid"}</span>
            <span className="break-all">{e.valid ? text : (e.payload.raw ?? JSON.stringify(e.payload)).slice(0, 200)}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

`web/src/components/plugins/plugin-detail.tsx`:
```tsx
"use client";

import { PageHeader } from "@/components/shared/page-header";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { RunPanel } from "@/components/plugins/run-panel";
import { useMe, usePlugin } from "@/lib/api/hooks";

export function PluginDetailView({ id }: { id: string }) {
  const { data: p, error, isLoading } = usePlugin(id);
  const { data: me } = useMe();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !p) return <p role="alert" className="text-sm text-sev-critical">{error?.message ?? "No such plugin."}</p>;
  const m = p.manifest;
  const facts: [string, string][] = [
    ["Accepts", m.io.accepts.join(", ")],
    ["Produces", m.io.produces.join(", ")],
    ["Limits", `${m.resources.cpu} CPU · ${m.resources.memory_mb} MB · ${m.resources.timeout_seconds}s · ${m.limits.default_rate_limit} req/s`],
    ["Network", String(m.permissions.network)],
    ["Image", `${p.image} ${p.digest ? `(${p.digest.slice(0, 19)}…)` : "— missing"}`],
  ];
  return (
    <>
      <PageHeader title={p.name} description={p.description} actions={<RiskBadge risk={p.risk_level} />} />
      <dl className="mb-8 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        {facts.map(([k, v]) => <div key={k} className="contents"><dt className="text-subtle">{k}</dt><dd className="font-mono text-xs leading-6">{v}</dd></div>)}
      </dl>
      {me && me.role !== "viewer" && p.enabled && p.digest && <RunPanel plugin={p} />}
      {!p.enabled && <p className="text-sm text-muted-foreground">This plugin is disabled.</p>}
      {p.runs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Recent runs</h2>
          <ul className="text-xs text-muted-foreground">
            {p.runs.map((r) => <li key={r.id} className="border-b border-border py-1.5 font-mono">{r.created_at.slice(0, 19).replace("T", " ")} · {r.target.value} · {r.status} · {r.event_count} events</li>)}
          </ul>
        </section>
      )}
    </>
  );
}
```

`web/src/app/app/plugins/[pluginSlug]/page.tsx`:
```tsx
import type { Metadata } from "next";
import { PluginDetailView } from "@/components/plugins/plugin-detail";

export const metadata: Metadata = { title: "Plugin" };

export default async function Page(props: PageProps<"/app/plugins/[pluginSlug]">) {
  const { pluginSlug } = await props.params;
  return <PluginDetailView id={decodeURIComponent(pluginSlug)} />;
}
```

- [ ] **Step 5: Scope manager**

`web/src/components/scope/scope-manager.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useMe, useScope } from "@/lib/api/hooks";
import type { ScopeInput } from "@/lib/types";

const empty: ScopeInput = { kind: "domain", value: "", active_allowed: false, authorization: "" };

export function ScopeManager() {
  const { data: scope, isLoading } = useScope();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState<ScopeInput>(empty);
  const [err, setErr] = useState("");
  const admin = me?.role === "admin";
  const refresh = () => qc.invalidateQueries({ queryKey: ["scope"] });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api.addScope(f);
      setF(empty);
      refresh();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
    }
  };
  const remove = async (id: string) => {
    await api.removeScope(id).catch((x) => setErr(x instanceof ApiError ? x.message : "Could not remove it."));
    refresh();
  };

  return (
    <div className="max-w-3xl space-y-8">
      <p className="text-sm text-muted-foreground">I only touch what is listed here. A domain covers itself and its subdomains. Active plugins need active scanning allowed on the entry.</p>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !scope?.length ? (
        <p className="text-sm text-muted-foreground">Nothing in scope yet, so I will refuse every run.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {scope.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <div>
                <p className="font-mono">{s.value} <span className="text-xs text-subtle">{s.kind}{s.active_allowed ? " · active allowed" : " · passive only"}</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.authorization}</p>
              </div>
              {admin && <Button variant="ghost" size="sm" onClick={() => remove(s.id)} aria-label={`Remove ${s.value}`}>Remove</Button>}
            </li>
          ))}
        </ul>
      )}
      {admin && (
        <form onSubmit={add} className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold">Add a target</h2>
          <div className="flex flex-wrap gap-2">
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ScopeInput["kind"] })} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" aria-label="Kind">
              <option value="domain">domain</option>
              <option value="cidr">IP / CIDR</option>
            </select>
            <Input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={f.kind === "domain" ? "example.com" : "203.0.113.0/24"} className="max-w-xs" aria-label="Value" />
          </div>
          <Input value={f.authorization} onChange={(e) => setF({ ...f, authorization: e.target.value })} placeholder="Who allowed this, and on what basis (e.g. 'My own domain')" aria-label="Authorization" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active_allowed} onChange={(e) => setF({ ...f, active_allowed: e.target.checked })} />
            Allow active scanning (plugins that send traffic to the target)
          </label>
          {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
          <Button type="submit" disabled={!f.value.trim() || !f.authorization.trim()}>Add to scope</Button>
        </form>
      )}
    </div>
  );
}
```

`web/src/app/app/settings/policies/page.tsx`:
```tsx
import type { Metadata } from "next";
import { ScopeManager } from "@/components/scope/scope-manager";

export const metadata: Metadata = { title: "Settings: Scope" };

export default function Page() {
  return <ScopeManager />;
}
```

- [ ] **Step 6: Lint and build**

Run: `cd web && pnpm lint && pnpm build`
Expected: success. `grep -rn "mocks/data" src | grep -i plugin` → nothing.

- [ ] **Step 7: Browser check against compose**

Rebuild web: `docker compose up -d --build --wait web`. Then, with a Playwright script in the scratchpad (not committed), signed in as the user's existing admin (credentials from the user; never print them in logs or commits):
1. `/app/settings/policies`: add `example.com`, authorization "IANA documentation domain, passive lookups only", active not allowed. It appears in the list.
2. `/app/plugins` lists Subfinder, dnsx, httpx, each with a digest.
3. `/app/plugins/projectdiscovery.dnsx`: run `example.com`. Status reaches SUCCEEDED and ip assets appear.
4. `/app/plugins/projectdiscovery.httpx`: run `example.com` → `example.com is in scope for passive plugins only…` shown, no run created.
5. Run dnsx on `example.org` → `example.org is not in scope.`
6. Lab: `docker compose --profile lab up -d testbed`, add scope `nyx-lab.test` with active allowed and authorization "Local lab container". Run httpx on `testbed.nyx-lab.test` → SUCCEEDED with an `http_service` asset (status 200, title "Welcome to nginx!").
7. Remove the `example.com` and `nyx-lab.test` scope entries afterwards, and stop the testbed.

- [ ] **Step 8: Commit**

```bash
git add web && git commit -m "feat(web): live plugin registry, sandboxed runs with event feed, scope settings"
```

---

### Task 9: README and roadmap

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update**

- **Banner subline:** change it to "Early days: the platform core and the first plugins run today; full scans are being built."
- **"How I'm built" mermaid:** rewrite the diagram as below. Validate it with the scratchpad mermaid parser used in Phase 1 before committing; `graph` is a reserved id.
```
flowchart LR
  user(["You"]) --> web["web · Next.js<br/>workspace UI"]
  web -- "/api/*" --> api["api · FastAPI<br/>accounts, scope, plugin registry"]
  api --> pg[("PostgreSQL")]
  api --> runner["runner<br/>the only piece with Docker"]
  runner --> plugins["plugin containers<br/>read-only, no root, no DB"]
  api -. planned .-> temporal["Temporal<br/>durable scans"]
  plugins -. planned .-> minio[("MinIO<br/>raw evidence")]
  api -. planned .-> memgraph[("Memgraph<br/>entity graph")]
```
- **"Run me":** `docker compose --profile plugins build` comes first, then `docker compose up --build`. Add the sentence "Add a target under Settings → Scope before running a plugin; I refuse everything else."
- **"Putting me on a server":** add "Set `NYX_RUNNER_TOKEN` to a long random value."
- **"What I refuse to do":** under "Let plugins wander", add a line "Today: read-only, non-root, no capabilities, CPU/RAM/process limits, a time limit, no route to the database. Next: network egress limited to your scope."
- **Repository map:** add `plugins/` (schemas, SDK, template, the three plugins) and `runner/`.
- **Roadmap:** tick `2. Plugin specification`; add "egress limited to scope" under 3 or as its own unchecked line.
- **"Write a plugin" section** (short): "Copy `plugins/_template`, describe the tool in `plugin.yaml`, turn its JSON output into events in `adapter.py`. `api/tests/test_adapters.py` shows how to test it offline with a recorded fixture."

- [ ] **Step 2: Check and commit**

Check that every path in the README exists (the same `ls` loop as Phase 1).
```bash
git add README.md && git commit -m "docs: README for plugins, runner and scope"
```

---

### Task 10: Publish

- [ ] **Step 1:** `git push`, then `gh run watch` until api, runner, web and images are green. Fix and push if red.
- [ ] **Step 2:** Screenshot the GitHub README (dark and light) with the Phase 1 scratchpad script; there must be 0 mermaid errors.
