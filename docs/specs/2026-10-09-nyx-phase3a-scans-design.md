# NYX Phase 3a — durable scans on Temporal

Date: 2026-10-09. Status: approved in chat, pending written review.

## Goal

Phase 3 of the thesis brief (§52, §34–35): a scan runs a chain of plugins against one scope target, survives restarts, retries infrastructure failures, and can be paused, resumed and cancelled. Phase 3 is split in two: **3a** (this spec) is the scan engine; **3b** (own spec, later) limits plugin network egress to scope.

The chain is a fixed "run every selected tool on everything it applies to" pipeline, routed by manifests. It is the H2 baseline the adaptive planner (Phase 6) will be compared against, so the core knows data types, never tool names.

Success:

1. `docker compose up --build` starts `temporal` and `worker` next to the Phase 2 services.
2. From `/app/scans/new` an analyst starts a scan of a domain in scope with Subfinder, dnsx and httpx selected. Subfinder's subdomains go through the scope gate and are handed to dnsx and httpx in batches; the scan ends `COMPLETED` (or `PARTIAL` with the reason per failed run).
3. Pause stops new batches while running ones finish; resume continues. Cancel kills running containers, keeps everything already collected, and ends the scan `CANCELLED`.
4. `docker compose restart worker` in the middle of a scan does not lose it: the interrupted batch is retried and the scan completes.
5. The Phase 2 "Run" button on a plugin page still works, now as a one-plugin scan with no chaining.
6. CI is green: API tests (plan, run_batch, finalize, routes), workflow tests on the Temporal time-skipping test server, runner tests (including cancel), adapter tests with target lists.

## 1. Services

`docker-compose.yml` gains:

- `temporal`: `temporalio/temporal:1.9.1`, command `server start-dev --ip 0.0.0.0 --db-filename /home/temporal/temporal.db`, volume `temporal-data:/home/temporal` (the image runs as uid 1000 and only its home directory is writable), network `default`, not published. Healthcheck: `temporal operator cluster health --address 127.0.0.1:7233`. Single node, SQLite: enough for the single-node thesis deployment (§39). Upgrade path when needed: a Postgres-backed Temporal server; workflow code does not change.
- `worker`: built from the API image (`api/Dockerfile`), command `python -m app.worker`, networks `default` and `runner`, same `NYX_*` environment as `api` plus `NYX_TEMPORAL_ADDRESS=temporal:7233`. Depends on postgres, runner and temporal being healthy. It is the only process that executes scans.
- `api` gains `NYX_TEMPORAL_ADDRESS` and depends on temporal being healthy.
- `compose.dev.yml` publishes `127.0.0.1:7233` (gRPC, for host-side worker/tests) and `127.0.0.1:8233` (Temporal Web UI).

Task queue: `nyx-scans`. Namespace: `default`. Workflow id: `scan-{scan_id}`.

API dependency: `temporalio>=1.34` (both api and worker use the API's uv project).

## 2. Data model

Alembic migration `0005_scans`:

- `scans`:
  - `id uuid pk`, `root_target jsonb` (normalized `{type, value}`), `plugin_ids text[]`;
  - `max_depth int not null default 2`, `max_targets int not null default 5000`;
  - `status` ∈ CREATED/RUNNING/PAUSED/COMPLETED/PARTIAL/FAILED/CANCELLED, default CREATED;
  - `error text`, `requested_by fk users (set null)`, `created_at`, `started_at`, `finished_at`.
- `scan_targets` — everything the scan considered:
  - `scan_id fk (cascade)`, `type`, `value`; primary key `(scan_id, type, value)`;
  - `depth int` (root is 0), `source_run_id fk plugin_runs (set null)`;
  - `in_scope bool`, `refusal text` (why it was not followed);
  - `routed_at timestamptz` (handed to plugins), `created_at`.
- `plugin_runs` changes:
  - add `scan_id fk scans (cascade), nullable` — Phase 2 runs keep `null`;
  - replace `target jsonb` with `targets jsonb` (list); existing rows become `[target]`;
  - add `attempt int not null default 0`;
  - status gains `CANCELLED` (column widened if needed);
  - existing PENDING/RUNNING rows are set FAILED with `error = "Interrupted by restart."` (one-off; `fail_interrupted_runs` at API startup is removed).

Asset-to-target mapping, one constant in `app/scans.py`:

```python
ASSET_TARGET = {"subdomain": "domain", "domain": "domain", "ip": "ip", "http_service": "url"}
```

Only valid `asset` events whose `data.kind` is in this map become targets.

## 3. Plugin contract change: target lists

- `NYX_INPUT` gains `targets: [{type, value}]`. The platform always sends `targets`; it also sends `target` (= `targets[0]`) so single-target adapters keep working.
- SDK: `TARGETS = INPUT.get("targets") or [INPUT["target"]]`. `emit()` keeps defaulting `target` to `INPUT["target"]`; adapters that take lists pass the host they are reporting on explicitly.
- Manifest: no change. `io.accepts` still lists target types; every target in a batch has the same type.
- Adapters:
  - subfinder: loops over `TARGETS` (it is only routed root domains in practice, batches of 1–few).
  - dnsx: feeds all hosts on stdin; event `target` is the record's host.
  - httpx: feeds all hosts/urls on stdin; event `target` is the record's input.
- Fixtures gain a multi-target case; the old single-target fixtures stay valid.

## 4. Workflow

`ScanWorkflow.run(scan_id)` in `app/workflows.py`. Deterministic: it holds ids only, all I/O is in activities.

```
await set_status(scan_id, "RUNNING")
started = set()
in_flight = {}
loop:
    await workflow.wait_condition(lambda: not paused)
    runs = await plan(scan_id)                         # all PENDING runs of the scan
    new = [r for r in runs if r not in started][:4 - len(in_flight)]
    start run_batch(r) for r in new; started |= new
    if not in_flight: break                            # nothing pending, nothing running
    wait until any in-flight activity finishes, or paused changes
await finalize(scan_id, cancelled=False)
```

- At most 4 batches in flight per scan, matching the runner's slots.
- Signals `pause` / `resume` flip `paused` and call `set_status` (PAUSED / RUNNING). Query `state` returns `{paused, in_flight, started}`.
- Cancellation is Temporal's own (`handle.cancel()`): the workflow catches `CancelledError`, requests cancellation of in-flight activities, waits for them, then runs `finalize(scan_id, cancelled=True)` in a non-cancellable scope.
- History stays small: one `plan` per completed batch, depth ≤ `max_depth`. No continue-as-new in 3a.

## 5. Activities

In `app/activities.py`; all idempotent; each opens its own DB session.

**`plan(scan_id) -> list[str]`** — one transaction:
1. Select `scan_targets` with `in_scope`, `routed_at is null`, `depth < max_depth`, oldest first (with `max_depth = 0` the root is never routed by `plan`; see §6 single runs).
2. For each selected plugin whose installed version is enabled, has a digest and accepts the target's type, and that did not itself produce the target (a plugin is never fed its own output: no Subfinder on Subfinder's subdomains, no httpx on httpx's URLs), apply the Phase 2 gate (`scope.refusal` with the plugin's risk level and the target's scope entry). Refused pairs are skipped (the reason is not per-plugin-stored in 3a; the target row stays `in_scope`).
3. Group allowed targets per plugin, cut into batches of 500, insert PENDING `plugin_runs` with `scan_id` and `targets`; set `routed_at` on the targets.
4. Return the ids of **all** PENDING runs of the scan. A retry after a commit loses nothing; the workflow skips ids it already started.

**`run_batch(run_id)`** — today's `execute_run`, with:
- At start: if `attempt > 0`, delete the run's events and call the runner's `DELETE /v1/runs/{run_id}` (404 ignored) to kill a container left by a dead attempt; then `attempt += 1`, status RUNNING.
- Body to the runner carries `targets` and `target` (§3).
- `activity.heartbeat()` at least once a second while lines stream (and while waiting for the first line).
- After the trailer, for valid `asset` events with a mapped kind: normalize with `scope.normalized_target`, check scope with `scope.find_entry`, insert into `scan_targets` with `depth = parent depth + 1`, `source_run_id`, `in_scope`, `refusal` (`"<value> is not in scope."`), `ON CONFLICT DO NOTHING`. Stop inserting at `max_targets` and set the scan's `error = "Stopped at {max_targets} targets."`. The parent depth is the max depth of the run's targets.
- Plugin outcomes (exit ≠ 0, timeout, too much output, unstorable output) set the run's final status as in Phase 2 and return normally — no retry.
- Infrastructure errors (`RunnerError`: unreachable, refused 429/5xx) put the run back to PENDING with the message in `error` and raise, so Temporal retries.
- Cancellation: the activity is declared with `no_thread_cancel_exception=True` (the SDK would otherwise raise into the thread mid-write). A heartbeat thread beats every second; when `activity.is_cancelled()` it calls runner `DELETE /v1/runs/{run_id}`, the stream ends, the run becomes CANCELLED (`error = "Cancelled."`) and the activity raises `temporalio.exceptions.CancelledError`.
- On the last failed attempt the run must not stay RUNNING: the workflow, on a non-retryable `ActivityError` from `run_batch`, calls `mark_failed(run_id, message)` (`"Runner unreachable."` or the error text).

Activity options for `run_batch`: `start_to_close_timeout = 2 h` (a fixed upper bound; the runner enforces each plugin's real `timeout_seconds`, and the heartbeat catches a dead worker much sooner), `heartbeat_timeout = 30 s`, retry: initial 2 s, backoff 2.0, max interval 60 s, max attempts 5.

**`set_status(scan_id, status)`**: sets status; sets `started_at` on first RUNNING.

**`finalize(scan_id, cancelled)`**:
- CANCELLED if `cancelled`;
- else FAILED if no run SUCCEEDED;
- else PARTIAL if any run FAILED/TIMED_OUT/CANCELLED or the target cap was hit;
- else COMPLETED.
Sets `finished_at`. Leftover PENDING runs (cancelled before start) become CANCELLED.

**`mark_failed(run_id, message)`**: run → FAILED with message, `finished_at`.

The worker (`app/worker.py`) runs `ScanWorkflow` and these activities with a thread-pool activity executor and `max_concurrent_activities = 4` (the runner's slot count, so batches queue in Temporal instead of bouncing off 429), because `run_batch` uses the existing synchronous SQLAlchemy and httpx code.

## 6. API

Temporal client: created once in the API lifespan (`Client.connect(settings.temporal_address)`); if it fails the API still starts, and scan endpoints answer 503 `"Scan engine unavailable."`. Exposed as a dependency so tests override it with a fake.

Routes (`app/routes/scans.py`, prefix `/api/v1/scans`). Writers: admin and analyst. Readers: any signed-in user.

| Method | Behaviour |
|---|---|
| `POST /scans` `{target: {type, value}, plugin_ids?: [str], max_depth?: 1–3}` | Normalize the target; refuse with Phase 2 messages when the root is out of scope (403). `plugin_ids` default: every enabled plugin with a digest, excluding intrusive; unknown or disabled ids → 422. Insert scan (CREATED) and root `scan_targets` row (depth 0, in_scope), commit, then start the workflow; if starting fails, the scan (and any PENDING run) is marked FAILED `"Scan engine unavailable."` and the API answers 503. Returns 202 with the scan. |
| `GET /scans` | Last 50 scans, newest first. |
| `GET /scans/{id}` | Scan plus counts: targets in / out of scope, runs per status, events total. |
| `GET /scans/{id}/runs` | Runs of the scan: plugin, number of targets, status, attempt, error, timings, event count. |
| `GET /scans/{id}/targets?in_scope=&after=` | Targets, 500 per page, ordered by `created_at, type, value` (`after` = offset). |
| `POST /scans/{id}/pause` · `/resume` | Signal the workflow. 409 `"The scan has finished."` on a final status. |
| `POST /scans/{id}/cancel` | `handle.cancel()`. 409 on a final status. |

Single runs: `POST /api/v1/plugins/{id}/runs {target}` keeps its contract and gate checks. It now creates a scan (`plugin_ids = [id]`, `max_depth = 0`), the root target with `routed_at` already set, and one PENDING run with `targets = [target]`, then starts the workflow and returns `RunOut` (gaining `scan_id` and `targets`). `GET /runs/{id}` and `/runs/{id}/events` are unchanged apart from those two fields; `target` stays in `RunOut` as the first of `targets`.

## 7. Runner

- `DELETE /v1/runs/{run_id}` (bearer auth): find containers with label `nyx.run_id={run_id}`, kill and remove them; 204, or 404 when none. The streaming request for that run ends with a trailer as today (the kill shows as a non-zero exit, `timed_out = false`).
- `POST /v1/runs` passes `input.targets` through unchanged (it already forwards `input` as `NYX_INPUT`).

## 8. UI

- `/app/scans/new`: target picked from scope entries (subdomain typing for domain entries, as on the plugin page), plugin checkboxes (default = the API default set), depth 1–3. Refusals inline.
- `/app/scans`: table — target, status, plugins, targets found, runs, started, duration.
- `/app/scans/[scanId]`: header with status and Pause / Resume / Cancel (admin, analyst); counters; runs table (row expands to the existing event feed from `run-panel`); targets table with out-of-scope rows dimmed and their reason. Polls every 2 s until the status is final.
- `/app/scans/[scanId]/live` redirects to `/app/scans/[scanId]` (no SSE until Redis).
- `/app/scans/[scanId]/metrics`: raw H2 numbers from the tables — runs, container seconds (sum of run durations), targets found / refused, events.
- Other scan tabs (graph, findings, evidence, report, changes) stay placeholders. Mock scan data used by these pages is replaced by API types where the page becomes live.

## 9. Errors

- API errors stay `{"detail": "..."}`.
- Temporal down mid-scan: the workflow pauses with the server and resumes when it is back; the DB status stays RUNNING meanwhile.
- Worker down mid-batch: the heartbeat lapses, the activity retries after 30 s, the dead attempt's events are deleted and its container killed.
- Runner down or busy: retried with backoff; after 5 attempts the run is FAILED `"Runner unreachable."` and the scan ends PARTIAL (or FAILED if nothing succeeded).
- Target explosion: capped by `max_targets`, scan PARTIAL with the cap message.

## 10. Testing

- API (pytest, real Postgres `nyx_test`):
  - `plan`: routing by `accepts`; risk gate per target and plugin; batches of 500; `max_depth`; idempotency (second call creates nothing and returns the same PENDING ids); disabled plugin skipped.
  - `run_batch` with the stub runner: asset → `scan_targets` with depth and source; out-of-scope target stored with refusal; `max_targets` cap; retry (`attempt` 1 → 2) deletes old events and calls runner DELETE; plugin failure returns normally; runner error raises.
  - `finalize`: status table for every combination above.
  - Routes: RBAC, root gate refusal, default plugin set excludes intrusive, 409 on pause/cancel of a finished scan, 503 without Temporal, single run creates scan + run (fake Temporal client).
  - Migration test covers 0005 up/down, including `target` → `targets`.
- Workflow (`temporalio.testing.WorkflowEnvironment.start_time_skipping()`, activities mocked): loops while `plan` returns new ids; never more than 4 in flight; pause blocks new starts and resume continues; cancel ends with `finalize(cancelled=True)`; a repeated PENDING id is not started twice; non-retryable `run_batch` failure calls `mark_failed`.
- Runner: `DELETE /v1/runs/{id}` kills a running busybox fixture container (integration, skipped without Docker); 404 unknown id; 401 without token.
- Adapters: dnsx and httpx fixtures with multiple targets validate against the event schema with per-host `target`; old fixtures still pass.
- Manual: `docker compose --profile lab up -d testbed`, scope `nyx-lab.test` with active allowed, scan it with httpx and dnsx; scan an owned domain with all three; pause/resume; cancel during httpx; `docker compose restart worker` mid-scan and see the scan complete; inspect the history in the Temporal UI on :8233 via `compose.dev.yml`.

## Out of scope

Egress limited to scope (3b), adaptive planner (Phase 6), SSE/Redis, MinIO evidence and the graph (Phase 5), new plugins (Phase 4), scan profiles as data, plugin config in the UI, per-plugin refusal records, scheduled or recurring scans, multi-target scans (one root target per scan).
