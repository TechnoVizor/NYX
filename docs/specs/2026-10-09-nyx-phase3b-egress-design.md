# NYX Phase 3b — plugin egress limited to scope

Date: 2026-10-09. Status: approved in chat, pending written review.

## Goal

The second half of roadmap item 3: a plugin that touches its target can only reach that target. Today every plugin container sits on the `nyx-plugins` bridge with full internet access; `permissions.network: target_scope` is declared but not enforced. The API's scope gate decides *what* a plugin is asked to scan; Phase 3b adds an independent network-level guarantee of *where* its packets can go.

Threat addressed (chosen in brainstorming, option A): an active plugin reaching something outside scope — httpx following a redirect to someone else's host, a probe hitting a neighbouring IP, a tool resolving a name to an address nobody authorized. Not addressed here (option B): an untrusted community plugin exfiltrating data through the public sources a passive plugin legitimately needs.

Success:

1. A `target_scope` plugin can connect to the addresses of the targets in its batch and to nothing else; a redirect to another host fails to connect.
2. A `public` plugin (passive only) reaches the internet but not private, link-local, loopback-range or carrier-grade NAT addresses: no route to the host, Docker networks or cloud metadata.
3. A plugin cannot change or remove its firewall.
4. Works the same on Docker Desktop (linuxkit VM, no host iptables) and on a Linux server.
5. The Phase 3a scans (lab scan with dnsx + httpx) still complete; cancel still kills everything a run started.
6. CI is green: sandbox unit tests, a Docker integration test of allowed/blocked connections that needs no internet, schema tests.

Feasibility was checked with a throwaway probe on this machine: an alpine container with only `NET_ADMIN` installed `OUTPUT DROP` + one allowed IP; a second, capability-less container started with `--network container:<firewall>` reached the allowed host (200) and timed out on another; it had no `iptables` binary and no capability to change rules.

## 1. Contract

`plugins/schemas/manifest.schema.json`, `permissions.network` becomes `enum: ["none", "public", "target_scope"]`:

- `target_scope` — outbound traffic only to the addresses of the run's targets, plus loopback (which carries Docker's embedded DNS at 127.0.0.11). Address set per target type:
  - `domain`: every A/AAAA address returned when the firewall starts;
  - `url`: the addresses of its host (port and path are not filtered);
  - `ip`: the address; `cidr`: the network.
  The allowed set is the batch, not the whole scope.
- `public` — outbound traffic to anywhere except: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10, 169.254.0.0/16, 127.0.0.0/8 (loopback interface itself stays open), 0.0.0.0/8, 224.0.0.0/4, and for IPv6 fc00::/7, fe80::/10, ff00::/8, ::/128.
- `none` — unchanged: `network_mode: none`, no firewall.

Schema rule (`allOf` / `if-then`): `classification.risk_level` other than `passive` requires `permissions.network` ∈ {`none`, `target_scope`}. The registry already skips manifests that fail the schema, so an "active plugin with internet" is never registered.

Manifests:
- `projectdiscovery.subfinder`: `public` (talks to public sources, never to the target).
- `projectdiscovery.dnsx`: `public` (talks to DNS resolvers).
- `projectdiscovery.httpx`: `target_scope`.
- `_template`: `public` (it is a passive example).

The API is unchanged: it already sends `permissions` and the batch's `targets` to the runner (`app/runs.py`).

## 2. Egress firewall image

`runner/egress/Dockerfile` and `runner/egress/egress.sh`; image `nyx-egress:1`, built by compose under profile `plugins` (service `egress`, like the plugin images), from `alpine:3.20` with `iptables` and `ip6tables` installed at build time.

`egress.sh` (POSIX sh), inputs from the environment:
- `NYX_EGRESS_MODE` — `public` | `target_scope`;
- `NYX_EGRESS_ALLOW` — space-separated targets (`target_scope` only): domains, IPs, CIDRs.

Behaviour:
1. `target_scope`: for both `iptables` and `ip6tables`: policy `OUTPUT DROP`; `-o lo -j ACCEPT`; `-m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`. Then for each allow entry: an IP or CIDR → `ACCEPT -d <entry>` in the matching family; anything else is a name → `getent ahosts <name>`, one `ACCEPT -d <addr>` per address; no address → print `unresolved: <name>` to stderr and continue.
2. `public`: policy `OUTPUT ACCEPT`; `-o lo -j ACCEPT` first; then `DROP -d <range>` for every range in §1.
3. Any iptables command failing → print `egress: <message>` to stderr and exit 1.
4. Print `ready` to stdout, then `exec sleep infinity`.

If `ip6tables -L` fails (no IPv6 filter table in the kernel), the IPv6 rules are skipped: such a container has no IPv6 at all. Every other iptables failure is step 3.

## 3. Runner

`runner/app/sandbox.py`:
- `EGRESS_IMAGE = "nyx-egress:1"`.
- `egress_config(mode: str, allow: list[str], run_id: str) -> dict` (pure): `detach`, `read_only=True`, `tmpfs={"/run": "size=1m"}`, `cap_drop=["ALL"]`, `cap_add=["NET_ADMIN"]`, `security_opt=["no-new-privileges"]`, `mem_limit="32m"`, `pids_limit=32`, `network=NETWORK`, `environment={"NYX_EGRESS_MODE": mode, "NYX_EGRESS_ALLOW": " ".join(allow)}`, `labels={"nyx.run_id": run_id, "nyx.role": "egress"}`, `log_config` as for plugins. Runs as root inside the container (iptables needs it; it has no other capability).
- `egress_allow(targets: list[dict]) -> list[str]` (pure): `url` → its hostname (IPv6 brackets stripped); `domain`/`ip`/`cidr` → the value; duplicates removed, order kept.
- `container_config(resources, input, extra_env, permissions, network_mode=None)`: when `network_mode` is given, the plugin gets `network_mode=network_mode` and no `network` key. `none` keeps its current branch.

`runner/app/main.py`, `POST /v1/runs`:
1. `network = permissions.get("network", "target_scope")`. If it is not `none`:
   - start the firewall: `egress_config("public" if network == "public" else "target_scope", egress_allow(input["targets"] or [input["target"]]), run_id)`;
   - wait for `ready` in its logs, up to 15 s, polling; on timeout or an exited container: remove it, release the slot, answer 500 `"Egress firewall did not start: <stderr tail>"`;
   - image missing → 500 `"Egress firewall image missing. Build it with: docker compose --profile plugins build"`.
2. Start the plugin with `network_mode=f"container:{firewall.id}"`.
3. `stream()` removes the plugin, then the firewall, in `finally`.

`DELETE /v1/runs/{run_id}` is unchanged: it already kills every container labelled with the run id, firewall included.

An unknown `network` value is refused with 422 (the API only sends schema-valid manifests; this guards the runner's own contract).

## 4. Errors

- Firewall did not start / image missing → runner 500 → API `RunnerError` → Temporal retries the batch (5 attempts) → run FAILED with the runner's message.
- A domain that does not resolve → not an error; the plugin cannot reach it; `unresolved: <name>` is in the firewall's stderr (kept in its container log until removal; not surfaced to the API in 3b).
- Known ceiling: targets behind CDNs or round-robin DNS may answer the plugin's own lookup with an address the firewall did not resolve; that connection fails as if the host were down. Upgrade path: point the plugin's DNS at a resolver inside the firewall container that only answers with the allowed addresses.

## 5. Testing

- Runner unit (`tests/test_sandbox.py`):
  - `egress_config`: only `NET_ADMIN` added, `ALL` dropped, read-only, `/run` tmpfs, memory/pids limits, labels, env.
  - `egress_allow`: url → host, IPv6 literal URL, duplicates, cidr/ip/domain pass through.
  - `container_config` with `network_mode`: no `network` key, `network_mode` set; `none` unchanged.
- Runner integration (`tests/test_egress.py`, skipped without Docker; no internet needed):
  - two `nginx:1.27-alpine` containers (A, B) on `nyx-plugins`;
  - a busybox fixture plugin that `wget`s a URL from its env and prints `{"reached": true|false}`;
  - `target_scope` allowing A's IP: A reached, B not;
  - `target_scope` allowing A by container name (resolved through Docker DNS): A reached, B not;
  - `public`: A not reached (private address);
  - the plugin cannot alter rules (`iptables` absent; running `ip link set eth0 down` as the plugin user fails);
  - cancel kills plugin and firewall; a firewall that never says `ready` (bad mode) → 500 and no containers left;
  - `none`: no firewall container is created.
- API: manifest schema refuses `safe_active` + `public` and accepts `passive` + `public`; repo manifests stay valid (`test_repo_manifests_are_valid`).
- Manual: lab scan of `testbed.nyx-lab.test` with dnsx + httpx completes; subfinder on an owned domain still finds subdomains; from a `target_scope` run, httpx against a target that redirects off-scope reports no service on the redirect target.

## Out of scope

Per-plugin domain allowlists for `public` plugins (threat B), an egress proxy, DNS pinning for the plugin, per-target rate limiting at the network level, image signature verification (cosign), IPv6 support on `nyx-plugins`.
