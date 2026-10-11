# NYX Phase 4a — Nuclei, findings, assets, profiles

Date: 2026-10-11. Status: approved in chat, pending written review.

## Goal

First part of Phase 4 of the thesis brief (§53, §19, §23): NYX produces findings. A Nuclei plugin joins the chain after httpx, its results and every discovered asset are stored once across scans with first/last seen, and an analyst reviews findings in the UI. Scan profiles become data: built-in Quick and Balanced plus user profiles. The Findings, Assets, Dashboard and Scan Profiles screens leave mock data and placeholders behind.

Phase 4 is split: **4a** (this spec) is Nuclei, findings, assets, dashboard, profiles. **4b** adds recon plugins (Naabu, tlsx, Katana, gau). **4c** adds enrichers (RDAP/ASN, CVE, EPSS, KEV). Audit log and the remaining Settings tabs are a separate small step.

Success:

1. `docker compose --profile plugins build` builds `nyx-plugin/nuclei`; the registry lists it as `safe_active`.
2. With `docker compose --profile lab up -d testbed` and scope `nyx-lab.test` (active allowed), a scan of `testbed.nyx-lab.test` with the Balanced profile runs httpx → nuclei and ends `COMPLETED` with at least one finding from the testbed's deliberate misconfigurations.
3. The findings appear in `/app/findings`, in the scan's Findings tab, on the asset in `/app/assets`, and in `/app/dashboard`. No page reads `lib/mocks`.
4. An analyst marks a finding `false_positive`; a second scan of the same target updates its `last_seen` and leaves it `false_positive`. A finding marked `fixed` that is seen again returns to `open`.
5. Built-in profiles cannot be edited or deleted; a user profile can be created, edited, duplicated, deleted and used from New scan.
6. CI is green: API tests (index, routes, profiles, config validation), adapter test for nuclei, migration test for 0006.

## 1. Data model

Alembic migration `0006_findings`:

- `assets`:
  - `id uuid pk`, `kind varchar(32)`, `value varchar(2000)`, unique `(kind, value)`;
  - `data jsonb default {}` — latest attributes from the most recent event (status_code, title, webserver, tech, ip, …);
  - `first_seen`, `last_seen timestamptz`, `last_scan_id fk scans (set null)`.
- `findings`:
  - `id uuid pk`, `fingerprint char(64) unique` — sha256 hex of `plugin_id|template_id|matched_at` (§3);
  - `plugin_id varchar(120)`, `template_id varchar(200)`, `title varchar(300)`, `severity varchar(8)` ∈ critical/high/medium/low/info, `matched_at varchar(2000)`;
  - `asset_id fk assets (set null)`, nullable;
  - `data jsonb` — description, references, cve, cwe, matcher name, extracted values, curl command, full title/matched_at if truncated;
  - `status varchar(16) default 'open'` ∈ open/confirmed/false_positive/accepted_risk/fixed (check constraint), `status_note text`, `status_by fk users (set null)`, `status_at timestamptz`;
  - `first_seen`, `last_seen timestamptz`.
  - Indexes: `(severity)`, `(status)`, `(last_seen desc)`, `(asset_id)`.
- `finding_occurrences`:
  - `finding_id fk findings (cascade)`, `scan_id fk scans (cascade)`, primary key `(finding_id, scan_id)`;
  - `run_id fk plugin_runs (set null)`, `event_seq int` — the raw event that reported it (the evidence reference until Phase 5);
  - `seen_at timestamptz`.
- `scan_profiles`:
  - `id uuid pk`, `name varchar(80) unique`, `description text default ''`, `builtin bool default false`;
  - `plugin_ids text[]`, `plugin_config jsonb default {}`, `max_depth int` (1–3, check constraint);
  - `created_by fk users (set null)`, `created_at`, `updated_at`.
  - Seeded by the migration with `builtin = true` (§4).
- `scans` gains `plugin_config jsonb not null default '{}'` and `profile_id fk scan_profiles (set null)`, nullable.

## 2. Event contract

`finding` events keep `title` and `severity` as the only required `data` fields. `event.schema.json` documents optional fields with types, all under `data`:

- `template_id` (string), `matched_at` (string), `description` (string);
- `references` (array of strings), `cve` (array of strings), `cwe` (array of strings);
- `extracted` (array of strings), `curl` (string), `matcher` (string).

`severity` is constrained to `critical|high|medium|low|info`. Existing plugins and fixtures stay valid.

SDK: `CONFIG: dict = INPUT.get("config") or {}`.

## 3. Indexing

`index(db, run)` in a new module `app/findings.py`, called from `scans.harvest` just before its `db.commit()`, so targets, assets and findings of a batch land in one transaction. `harvest` already runs after the run's final status is committed, for every finished batch (a FAILED batch may still have reported valid events). Pure SQL upserts over the run's valid events:

- Every valid `asset` event: upsert `assets` on `(kind, value)` — insert with `first_seen = last_seen = now`, or update `last_seen`, `data`, `last_scan_id`. Values longer than 2000 characters are skipped.
- Every valid `finding` event:
  - `template_id = data.template_id or data.title`; `matched_at = data.matched_at or event.target.value`.
  - `fingerprint = sha256(f"{plugin_id}|{template_id}|{matched_at}")`.
  - `asset_id`: the asset whose `value` equals `matched_at`, else the event target's value, looked up across kinds `http_service`, `subdomain`, `domain`, `ip`; null if none.
  - Upsert on `fingerprint`: insert `status = open`, `first_seen = last_seen = now`; on conflict update `last_seen`, `title`, `severity`, `data`, `asset_id` (if not null) and `status = CASE WHEN status = 'fixed' THEN 'open' ELSE status END` (clearing `status_note`/`status_by`/`status_at` when it reopens).
  - Upsert `finding_occurrences (finding_id, scan_id)` with `run_id`, `event_seq`, `seen_at`; on conflict update those three.
  - `title` truncated to 300, `matched_at` to 2000, `template_id` to 200; full strings stay in `data`.
- Runs without a `scan_id` do not exist since Phase 3a; no special case.

Idempotency: a retried batch (`attempt > 0`) already deletes the previous attempt's events; upserts by unique keys make a second `index` of the same run a no-op apart from timestamps.

## 4. Plugin: Nuclei

`plugins/projectdiscovery.nuclei/`:

- `Dockerfile`: same pattern as httpx — fetch stage downloads the nuclei release zip and the `nuclei-templates` release tarball at pinned versions, verifies both with SHA-256 build args (amd64/arm64 for the binary), installs the binary to `/usr/local/bin/nuclei` and the templates to `/templates` (read-only, owned by root). Versions are the latest releases at implementation time, recorded in the Dockerfile and the manifest.
- `plugin.yaml`: id `projectdiscovery.nuclei`, `risk_level: safe_active`, `trust_level: verified`, categories `[vulnerability, web]`, `accepts: [url]`, `produces: [finding, log, progress]`, resources `cpu: 1.0`, `memory_mb: 512`, `timeout_seconds: 1800`, `permissions.network: target_scope`, `limits.default_rate_limit: 10`.
- `config_schema`:
  ```yaml
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
- `adapter.py`:
  - Command: `nuclei -jsonl -silent -duc -ud /templates -t /templates -rl <rate_limit> -severity <csv> -etags <hard,+exclude_tags> -exclude-type headless,code,javascript -no-interactsh`, URLs of the batch on stdin.
  - Hard exclusions, in the adapter, not overridable: tags `dos,fuzz,fuzzing,intrusive,brute-force,bruteforce`; types `headless,code,javascript`; interactsh off (no out-of-band callbacks leaving the scope).
  - Each JSONL record → `emit("finding", {...}, target={"type": "url", "value": rec["host"] or rec["matched-at"]})` with `template_id = rec["template-id"]`, `title = info.name`, `severity = info.severity` (unknown → `info`), `matched_at = rec["matched-at"]`, `description`, `references`, `cve` (`info.classification.cve-id`), `cwe`, `extracted = rec["extracted-results"]`, `curl = rec["curl-command"]`, `matcher = rec["matcher-name"]`.
  - `progress(0)` before, `progress(100)` after.
- `fixtures/output.jsonl`: recorded against the lab testbed (§5), plus one record with every optional field.
- Compose: `plugin-nuclei` service under profile `plugins`, image `nyx-plugin/nuclei:<version>`.

## 5. Lab testbed

The testbed gains deliberate, harmless misconfigurations so the success criterion has something to find: a mounted `lab/testbed/` directory with an nginx config and static files serving an exposed `/.git/config`, a `/.env` with fake values, and directory listing on one path. Compose mounts it read-only into the existing `testbed` service. Values are obviously fake (`NYX_LAB_FAKE_...`).

## 6. Plugin config plumbing

- `POST /scans` and the profile endpoints accept `plugin_config: {plugin_id: object}`.
  - Every key must be in the scan's `plugin_ids` → otherwise 422 `"Config for <id>, which is not selected."`.
  - Each value is validated with `jsonschema` (Draft 2020-12) against the installed version's `manifest.config_schema` → 422 `"<id> config: <first error message>"`.
- `scans.plugin_config` stores it. `runs.py` sends `input.config = scan.plugin_config.get(plugin_id, {})` instead of `{}`.
- `POST /scans` with `profile_id`: `plugin_ids`, `plugin_config` and `max_depth` come from the profile; fields given explicitly in the request override the profile's. Profile plugins that are disabled or have no digest → 422 `"<id> in this profile is not available."`. `scans.profile_id` is recorded.
- Single runs (`POST /plugins/{id}/runs`) keep sending `{}` config.

Built-in profiles (seeded in 0006):

| name | plugin_ids | plugin_config | max_depth |
|---|---|---|---|
| Quick | subfinder, httpx, nuclei | nuclei: `severity: [high, critical]` | 3 |
| Balanced | subfinder, dnsx, httpx, nuclei | nuclei: `severity: [low, medium, high, critical]` | 3 |

Depth 3 because nuclei takes URLs at depth 2 (domain 0 → subdomain 1 → URL 2) and `plan` routes `depth < max_depth`.

## 7. API

Readers: any signed-in user. Writers: admin and analyst. Errors stay `{"detail": "..."}`.

| Method | Behaviour |
|---|---|
| `GET /findings?severity=&status=&plugin_id=&scan_id=&q=&after=` | 200 per page (`after` = offset). Comma-separated multi-values for severity/status. `scan_id` filters via occurrences. `q` = case-insensitive match on title, template_id, matched_at. Order: severity rank, then `last_seen desc`. Returns rows with asset `{id, kind, value}` and `occurrences` count, plus `total`. |
| `GET /findings/{id}` | Finding, asset, occurrences (scan id, scan root target, run id, event seq, seen_at; newest first), and the raw payload of the newest occurrence's event. |
| `PATCH /findings/{id}` `{status, note?}` | Sets status, `status_note`, `status_by`, `status_at`. 422 on unknown status. |
| `GET /assets?kind=&q=&after=` | 200 per page, `last_seen desc`, each with `open_findings` count; `total`. |
| `GET /assets/{id}` | Asset, its findings (summary rows), and the scans it was seen in (via `scan_targets` value match and `last_scan_id`; up to 20, newest first). |
| `GET /dashboard` | `{open_by_severity: {critical, high, medium, low, info}, open_total, assets_total, assets_new_7d, findings_per_day: [{date, count}] (30 days, by first_seen, zero-filled), recent_scans: [ScanOut] (5), top_assets: [{id, kind, value, open_findings, worst_severity}] (5)}`. |
| `GET /profiles` | All profiles, built-in first, then by name; each with `available: bool` and `unavailable: [plugin_id]`. |
| `POST /profiles` | `{name, description?, plugin_ids, plugin_config?, max_depth}`; validation as §6; 409 on duplicate name. |
| `PATCH /profiles/{id}` · `DELETE /profiles/{id}` | Built-in → 409 `"Built-in profiles are read-only."`. Delete leaves scans with `profile_id = null`. |
| `POST /scans` | + `profile_id?`, `plugin_config?` (§6). |
| `GET /scans/{id}` | + `findings_by_severity` (via occurrences). |

Routes live in `app/routes/findings.py`, `app/routes/assets.py`, `app/routes/dashboard.py`, `app/routes/profiles.py`.

## 8. UI

- `lib/mocks/` and the `delay()` mock path in `lib/api/client.ts` are removed; `Finding` and related types in `lib/types.ts` follow the API.
- Shared: `SeverityBadge`, `FindingStatusBadge`, a `FindingsTable` (filters: severity chips, status select, plugin select, search; paged with "Load more").
- `/app/findings`: `FindingsTable` over all findings.
- `/app/findings/[findingId]`: header (title, severity, status), matched_at with copy, asset link, description, references, CVE/CWE, extracted values, curl (copy), review box (status select + note, save; hidden for viewers), occurrences list linking to scans, raw event JSON in a collapsible block.
- `/app/scans/[scanId]/findings`: `FindingsTable` with `scan_id`; scan overview counters gain findings by severity.
- `/app/assets`: table (value, kind, key attributes: status/title/tech/ip, open findings, first/last seen), kind filter, search. Clicking a row opens a side panel (`Dialog` as a sheet) with the asset's data, its findings and scans. No `/assets/[id]` route.
- `/app/dashboard`: four stat tiles (open critical+high, open total, assets, new assets 7d), severity distribution bar, 30-day findings sparkline, recent scans, top assets. Charts are inline SVG; no chart library.
- `/app/profiles`: profile cards (built-in show a lock), plugins, depth, nuclei config summary, "available" warning. Actions: New, Duplicate, Edit, Delete (writers), "Scan with this profile" → `/app/scans/new?profile=<id>`. Form: name, description, plugin checkboxes, depth 1–3, per-plugin config generated from `config_schema` (enum array → checkboxes, string array → comma-separated input; other schemas → JSON textarea).
- `/app/scans/new`: profile select on top (default Balanced, or `?profile=`) fills plugins and depth and sends `profile_id`; manual changes are sent as overrides.
- Placeholders that stay (graph, evidence, changes, report, reports, experiments, audit, onboarding, settings except Scope) get a `phase` line: "Arrives in Phase N — needs X."

## 9. Errors

- Invalid `finding` events are already stored `valid = false` and skipped by `index`.
- Over-long fields are truncated in columns and kept whole in `data`.
- `index` failure rolls back together with `harvest` (one transaction), so a batch is never half-indexed. The exception leaves `run_batch` exactly as a `harvest` failure does today: Temporal retries the activity, the retry deletes the attempt's events and reruns the batch. Indexing only touches validated events with truncated columns, so this path is for database outages, not bad plugin output.
- Profile referencing a disabled/removed plugin: card shows it unavailable; scanning with it → 422 naming the plugin.
- Deleting a user profile never touches scans: they keep their own `plugin_ids` and `plugin_config`.

## 10. Testing

- API (pytest, `nyx_test`):
  - `index`: asset insert and update (`first_seen` kept, `last_seen`/`data` updated); finding fingerprint (with and without `template_id`/`matched_at`); `asset_id` linking; `fixed` → `open` on re-sight; `false_positive`/`accepted_risk`/`confirmed` unchanged; occurrences one row per scan; re-indexing the same run creates nothing new; invalid events ignored; truncation.
  - Config: `POST /scans` rejects config for unselected plugins and schema violations; config reaches `NYX_INPUT` via the stub runner; profile fills fields and request overrides win; unavailable profile plugin → 422.
  - Routes: findings filters (severity multi, status, plugin, scan_id, q), paging and order; PATCH review and RBAC (viewer 403); assets list/detail with counts; dashboard numbers on a seeded dataset including zero-filled days; profiles CRUD, built-in 409, duplicate name 409.
  - Migration test: 0005 → 0006 up/down, built-in profiles present after upgrade.
- Adapter: nuclei fixture validates against the event schema; a unit test asserts the built command always contains the hard `-etags`, `-exclude-type` and `-no-interactsh` whatever the config.
- Web: `pnpm lint`, `tsc --noEmit`.
- Manual: lab testbed scan with Balanced (success 2–3); review and rescan (success 4); profile CRUD and scan from a profile (success 5); Quick vs Balanced on the testbed differ only by severity filter.

## Out of scope

Recon plugins (4b), CVE/EPSS/KEV enrichment and risk scores (4c, 8), MinIO evidence and the graph (5), AI triage (7), automatic `fixed` when a finding is not seen again (8, needs scan diff), Audit log and Settings tabs (separate step), bulk review actions, finding comments/assignment, export.
