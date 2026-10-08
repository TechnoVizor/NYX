# NYX Phase 2 — plugin contract, registry, sandboxed runs

Date: 2026-10-08. Status: approved in chat, pending written review.

## Goal

Phase 2 of the thesis brief (§51, §13–18, §36–37): a plugin manifest and event contract, a Plugin Registry, three working plugins, and the first real plugin runs. Runs execute one plugin against one target, sandboxed, and only against targets in a scope registry. Results are visible in the workspace UI.

Success:

1. `docker compose --profile plugins build && docker compose up --build` builds three plugin images. The registry lists Subfinder, dnsx and httpx with version, risk, trust and image digest. `/app/plugins` shows them from the API, not from mocks.
2. An admin adds a domain they own to scope with an authorization note. Then they can run Subfinder against it from `/app/plugins/projectdiscovery.subfinder`. Events appear live, and the run ends `SUCCEEDED`.
3. These attempts are refused with a clear message:
   - a target outside scope;
   - a safe_active plugin on a target whose scope entry does not allow active scanning;
   - any intrusive plugin.
4. Plugin containers run read-only and non-root, with all capabilities dropped, resource limits and a timeout. They cannot reach Postgres or the API.
5. CI is green: API tests (scope matching, risk gate, registry sync, runs with a stub runner), runner tests (including one real container run), adapter contract tests.

## 1. Contract

Location: `plugins/` at the repo root.

- `plugins/schemas/manifest.schema.json` — JSON Schema (draft 2020-12) for `plugin.yaml`, `api_version: platform.security/v1`, `kind: ScannerPlugin`. Fields follow brief §14:
  - `metadata`: `id`, `name`, `publisher`, `version`, `license`, `description`.
  - `runtime`: `type: oci`, `image`.
  - `classification`: `categories`, `risk_level` ∈ passive/safe_active/active/intrusive, `trust_level` ∈ verified/community/custom.
  - `io`: `accepts` and `produces`. `accepts` ⊆ domain/ip/cidr/url.
  - `resources`: `cpu`, `memory_mb`, `timeout_seconds`.
  - `permissions`: `network` ∈ none/target_scope, plus `filesystem`, `raw_socket`, `host_mounts`, `docker_socket`. The last three must be `false`, enforced by the schema.
  - `limits`: `default_rate_limit`.
  - `config_schema`: a JSON Schema object.
- `plugins/schemas/event.schema.json` — one event per JSONL line. Common fields: `event_version: "1"`, `type`, `plugin_run_id`, `plugin_id`, `plugin_version`, `timestamp` (RFC 3339), `target {type, value}`, `confidence` (0–1, optional), `data` (object).
  - `type` is one of asset, relation, finding, evidence, metric, log, progress, artifact. `scan_id` is optional until Phase 3.
  - Per-type `data` requirements:
    - asset: `{kind, value}`;
    - relation: `{from, to, kind}`;
    - log: `{level, message}`;
    - progress: `{percent}`;
    - metric: `{name, value}`;
    - finding: `{title, severity}`;
    - evidence and artifact: free-form objects for now.
- `plugins/sdk/nyx_plugin.py` — a single stdlib-only module copied into every image:
  - reads `NYX_INPUT` (JSON: `run_id`, `target`, `config`) from the environment;
  - `emit(type, data, target=None, confidence=None)` writes one event line to stdout with the common fields filled in;
  - `log()` and `progress()` are helpers on top of `emit`.
- `plugins/_template/` — a copyable plugin skeleton (manifest, Dockerfile, adapter).

## 2. Plugins

Each plugin lives in `plugins/<id>/`:
- `plugin.yaml`;
- `Dockerfile` (`python:3.12-slim` + the upstream release binary at a pinned version, checksum verified at build);
- `adapter.py` (runs the tool with JSON output and turns each record into events);
- `fixtures/` (recorded tool output for contract tests).

| id | risk | accepts | emits |
|---|---|---|---|
| `projectdiscovery.subfinder` | passive | domain | asset `subdomain`, relation `subdomain_of` |
| `projectdiscovery.dnsx` | passive | domain | asset `ip`, relation `resolves_to` |
| `projectdiscovery.httpx` | safe_active | domain, url | asset `http_service` (url, status_code, title, tech, webserver) |

Images are built by compose under profile `plugins` and tagged `nyx-plugin/<name>:<version>`.

## 3. Registry

Tables (Alembic migration 0002):

- `plugins`: `id text pk` (manifest id), `name`, `publisher`, `description`, `categories text[]`, `risk_level`, `trust_level`, `updated_at`.
- `plugin_versions`: `id uuid pk`, `plugin_id fk`, `version`, `image`, `digest` (sha256 of the local image), `manifest jsonb`, `created_at`. Unique `(plugin_id, version, digest)`.
- `plugin_installations`: `plugin_version_id fk unique`, `enabled bool default true`, `config jsonb default {}`.

Sync runs at API startup after migrations, and on demand with `python -m app.plugins.sync`:
1. Read `plugins/*/plugin.yaml` (the directory is copied into the API image).
2. Validate each against the schema. An invalid manifest is skipped with a logged reason.
3. Ask the runner for the image digest. A plugin whose image is missing is listed with `digest = null` and cannot run.
4. Upsert the rows. A new digest for the same version creates a new `plugin_versions` row, and that becomes the installed one.

Endpoints:
- `GET /api/v1/plugins` — list for any signed-in user.
- `GET /api/v1/plugins/{id}` — manifest, installed version and the last 10 runs.
- `PATCH /api/v1/plugins/{id}` — `{enabled}`, admin only.

## 4. Scope

Table `scope_targets`:
- `id`;
- `kind` ∈ domain/cidr;
- `value` (normalized: lowercase domain with no trailing dot, or a canonical CIDR);
- `active_allowed bool`;
- `authorization text not null` (who allowed it and on what basis);
- `created_by fk users`, `created_at`.
- Unique `(kind, value)`.

Endpoints:
- `GET /api/v1/scope` — signed-in users.
- `POST /api/v1/scope` — admin only.
- `DELETE /api/v1/scope/{id}` — admin only.

Validation:
- A domain must have at least one dot and no wildcard (`*.example.com` is written as `example.com`).
- A CIDR wider than /16 is refused.

Matching (`app/scope.py`, pure functions):
- **Target normalization:**
  - url: use its host;
  - domain: lowercase it and strip a trailing dot;
  - ip: parsed with `ipaddress`.
- **Domain target:** matches a domain entry when it equals it or ends with `"." + entry`. So `evil-example.com` does not match `example.com`.
- **IP target:** matches a CIDR entry when it is inside. A domain target never matches a CIDR entry (no resolution at check time).
- **Risk gate:**
  - passive needs a match;
  - safe_active and active need a match with `active_allowed`;
  - intrusive is always refused in Phase 2.
- The plugin must also be enabled and have a digest, and the target type must be in `io.accepts`.
- Refusals return 403 or 422 with a sentence the UI shows as is, for example `example.org is not in scope.`

## 5. Runs

Tables (same migration):
- `plugin_runs`:
  - `id uuid`, `plugin_version_id fk`, `target jsonb`;
  - `status` ∈ PENDING/RUNNING/SUCCEEDED/FAILED/TIMED_OUT;
  - `requested_by fk users`, `created_at`, `started_at`, `finished_at`;
  - `exit_code`, `error text`, `event_count`.
- `plugin_events`: `run_id fk`, `seq int`, `type`, `payload jsonb`, `valid bool`, `created_at`. Primary key `(run_id, seq)`.

Flow:
1. `POST /api/v1/plugins/{id}/runs {target: {type, value}}` (admin or analyst) checks the gate, inserts a PENDING run and returns 202 with the run.
2. A FastAPI background task calls the runner: `POST {NYX_RUNNER_URL}/v1/runs` with a bearer `NYX_RUNNER_TOKEN`. The body has the digest, the manifest resources, and the input (`run_id`, `target`, `config`).
   - The runner answers with streamed JSONL (the plugin's stdout lines).
   - Its last line is a runner trailer: `{"runner": {"exit_code": n, "timed_out": bool, "stderr_tail": "..."}}`.
3. For each line, the API validates it against the event schema and checks that `plugin_run_id` matches. It stores the event with `valid = true` or `false`. An invalid line is kept so nothing disappears silently.
4. The final status comes from the trailer:
   - `timed_out` → TIMED_OUT;
   - exit 0 → SUCCEEDED;
   - anything else → FAILED, with the stderr tail as `error`.
   - Runner unreachable → FAILED, with `error = "Runner unreachable."`
5. On API startup, runs still PENDING or RUNNING are marked FAILED, with `error = "Interrupted by restart."` Durable execution is Phase 3.

Read endpoints:
- `GET /api/v1/runs/{id}`;
- `GET /api/v1/runs/{id}/events?after=<seq>` (at most 500 per page).

## 6. Runner

`runner/` is its own small FastAPI service with its own uv project and image. It is the only service that mounts `/var/run/docker.sock`, and it uses the Docker SDK for Python.

- `GET /v1/images/{image}`: returns `{digest}` or 404.
- `POST /v1/runs`: starts the container and streams stdout lines. When the process exits it appends the trailer.
- On timeout it kills the container and sets `timed_out`. It enforces at most 4 concurrent runs; a fifth gets 429.
- It rejects requests without the correct bearer token (401).

Container settings come from one pure function, `container_config(manifest_resources, input) -> dict`, which is unit-tested:
- `read_only=True`, `tmpfs={"/tmp": "size=64m"}`, `cap_drop=["ALL"]`, `security_opt=["no-new-privileges"]`, `user="65534:65534"`;
- `mem_limit` and `nano_cpus` from the manifest, `pids_limit=256`;
- `network="nyx-plugins"`, `environment={"NYX_INPUT": ...}`;
- no volumes and no privileged mode; the image is referenced by digest; the container is removed at the end.

Networks in compose:
- `nyx-internal`: postgres, api, runner, web.
- `nyx-plugins`: a bridge with internet access and no other services on it.

The runner reaches plugin containers only through the Docker API.

Egress limited to scope is not implemented in Phase 2. The README roadmap says so.

## 7. UI

- `/app/plugins`: a table from `GET /api/v1/plugins` with name, publisher, risk badge, trust, version, short digest and enabled. Admins see an enable/disable toggle.
- `/app/plugins/[pluginSlug]` (the slug is the plugin id):
  - **Manifest:** description, accepts/produces, permissions and resources.
  - **Run:** the target is chosen from the scope entries; for a domain entry the user can also type a subdomain. The refusal message is shown inline. Viewers do not see the form.
  - **Live run:** status and a list of events, polled every second while the run is PENDING or RUNNING. Assets are shown as rows, logs dimmed, invalid events marked.
  - **Recent runs** list.
- `/app/settings/policies` becomes **Scope**: a list of entries; admins also get an add form (kind, value, active allowed, authorization note) and delete.
- The mock `plugins` data and `Plugin` type in `web/src/lib` are replaced by the API types.

## 8. Errors

- API errors stay `{"detail": "..."}`, and the UI shows the detail.
- Manifest problems never crash the API. They are logged and the plugin is skipped.
- The runner down at sync means digests are null and plugins show as "image missing". The runner down at run time means the run ends FAILED with "Runner unreachable."
- A plugin printing non-JSON to stdout gets an invalid event row. Its stderr is kept only as the 4 KB tail.

## 9. Testing

- **API (pytest, real Postgres):**
  - **Scope matching table:**
    - exact domain, subdomain, deep subdomain;
    - lookalike `evil-example.com`, suffix trick `example.com.evil.net`;
    - trailing dot, uppercase, URL with port and path;
    - IP in and out of a CIDR; domain against a CIDR entry.
  - **Risk gate:** all four levels × active_allowed.
  - **Scope API:** RBAC (analyst cannot write), /16 limit, duplicates.
  - **Registry sync:** a valid manifest, an invalid one skipped, a missing image giving a null digest, a new digest giving a new version.
  - **Runs:** a stub runner via dependency override streams fixed lines. Covered: a valid event stored, an invalid line stored with `valid = false`, a foreign `plugin_run_id` rejected, the status mapped from the trailer, the runner unreachable, interrupted runs failed on startup.
- **Runner (pytest):**
  - `container_config` asserts every hardening flag;
  - a token check;
  - an integration test that builds a tiny test image (busybox printing two JSON lines then sleeping), runs it, sees both lines and the trailer, then checks the timeout kill. It is skipped when Docker is unavailable and runs in CI.
- **Adapters:** run each `adapter.py` against its fixture in parse-only mode (`NYX_FIXTURE` env). Every emitted line must validate against the event schema, with the expected event counts.
- **Manual:** compose up, add a scope entry for a domain the user owns, and run all three plugins from the UI. `scanme.sh` is used only if ProjectDiscovery's terms allow it; this is checked first.

## Out of scope

Temporal and multi-plugin scans (Phase 3), MinIO evidence and the graph (Phase 5), cosign signatures and GHCR publishing, egress restricted to scope, plugin credentials, health checks, plugin config editing in the UI (the config stays `{}`), per-target rate limiting beyond the tool's own flag.
