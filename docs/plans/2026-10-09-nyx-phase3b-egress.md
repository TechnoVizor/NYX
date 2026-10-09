# NYX Phase 3b Implementation Plan — egress limited to scope

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every networked plugin runs behind its own firewall container: `target_scope` plugins reach only their batch's targets, `public` (passive) plugins reach the internet but no private ranges, and no plugin can change its rules.

**Architecture:** The runner starts a small `nyx-egress:1` container (alpine + iptables, only `NET_ADMIN`) on `nyx-plugins`, waits for it to print `ready`, then starts the plugin with `network_mode=container:<firewall>`, so the plugin shares a network namespace whose rules it cannot touch. Pure functions in `runner/app/sandbox.py` describe both containers. The manifest schema gains `network: public` and forbids it for non-passive plugins.

**Tech Stack:** Python 3.12 (FastAPI, docker SDK) with pytest; POSIX sh + iptables in `alpine:3.20`; Docker Compose.

**Spec:** `docs/specs/2026-10-09-nyx-phase3b-egress-design.md`

## Global Constraints

- `permissions.network` ∈ `none | public | target_scope`; `public` only with `risk_level: passive`.
- Egress image `nyx-egress:1`, built from `runner/egress/` (`alpine:3.20`, `iptables`, `ip6tables`), compose service `egress` under profile `plugins`.
- Firewall env: `NYX_EGRESS_MODE` (`public` | `target_scope`), `NYX_EGRESS_ALLOW` (space-separated). Prints `ready` on stdout when rules are in place; errors as `egress: <message>` on stderr, exit 1; unresolvable names as `unresolved: <name>` on stderr.
- `public` blocks: `10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 127.0.0.0/8 0.0.0.0/8 224.0.0.0/4` and `fc00::/7 fe80::/10 ff00::/8 ::/128`; loopback interface stays open.
- Firewall container: `cap_drop ALL`, `cap_add NET_ADMIN`, `no-new-privileges`, read-only, tmpfs `/run size=1m`, `mem_limit 32m`, `pids_limit 32`, labels `nyx.run_id` and `nyx.role=egress`.
- Ready wait: 15 s. Runner messages, verbatim: `"Egress firewall did not start: <stderr tail>"`, `"Egress firewall image missing. Build it with: docker compose --profile plugins build"`, `"Unknown network mode <mode>."` (422).
- Default when a run carries no `permissions.network`: `target_scope`.
- Every commit ends with the session's attribution lines if the harness provides them.

## Review Focus

1. **A batch whose only target does not resolve** (typo'd subdomain): the firewall must still say `ready` and the run must finish normally with the plugin unable to connect — not a 500 and not a retry loop. Pinned in Task 2 (`test_unresolvable_name_still_ready`).
2. **A URL target with a port and path or an IPv6 literal** (`http://[2001:db8::1]:8080/x`): the allow list must carry just the host. Pinned in Task 3 (`test_egress_allow_extracts_hosts`).
3. **The firewall dies or never becomes ready**: the slot is released and no container is left behind. Pinned in Task 4 (`test_firewall_that_never_gets_ready_is_cleaned_up`).
4. **Cancel during a run**: both the plugin and its firewall go away. Pinned in Task 4 (`test_cancel_removes_plugin_and_firewall`).
5. **Phase 2/3a runs that carry `target` but no `targets`** (and the runner's own tests that send neither): no `KeyError`; an empty allow list simply blocks everything but loopback. Pinned in Task 3 (`test_egress_allow_extracts_hosts` empty case) and Task 4 (runner falls back to `target`).

---

## File map

```
plugins/schemas/manifest.schema.json        network enum + passive-only rule               Task 1
plugins/{_template,projectdiscovery.subfinder,projectdiscovery.dnsx}/plugin.yaml   network: public   Task 1
api/tests/test_contract.py                  schema cases                                   Task 1
runner/egress/{Dockerfile,egress.sh}        the firewall image                             Task 2
runner/tests/test_egress_image.py           firewall rules per mode                         Task 2
runner/app/sandbox.py                       EGRESS_IMAGE, egress_config, egress_allow, network_mode   Task 3
runner/tests/test_sandbox.py                unit tests                                     Task 3
runner/app/main.py                          start firewall, wait ready, plugin in its netns, cleanup   Task 4
runner/tests/fixtures/probe/Dockerfile      busybox plugin that wget's URLs                 Task 4
runner/tests/test_egress.py                 allowed/blocked, cancel, cleanup                 Task 4
runner/tests/test_runs.py                   existing tests run with network: none            Task 4
docker-compose.yml  README.md               egress image service; docs                      Task 5
```

Runner tests: `cd runner && uv run pytest -q` (Docker needed for integration tests; they are skipped without it). API tests as in Phase 3a (`cd api && NYX_TEMPORAL_TEST_ADDRESS=127.0.0.1:7233 uv run pytest -q` on networks that block `temporal.download`).

---

### Task 1: Contract — `public` network mode, passive only

**Files:**
- Modify: `plugins/schemas/manifest.schema.json`, `plugins/_template/plugin.yaml`, `plugins/projectdiscovery.subfinder/plugin.yaml`, `plugins/projectdiscovery.dnsx/plugin.yaml`
- Test: `api/tests/test_contract.py`

**Interfaces:**
- Produces: manifests may declare `permissions.network: public` when `classification.risk_level: passive`.

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_contract.py`:

```python
from pathlib import Path

import pytest
import yaml

from app.contract import validate_manifest

TEMPLATE = Path(__file__).resolve().parents[2] / "plugins" / "_template" / "plugin.yaml"


def manifest(risk, network):
    m = yaml.safe_load(TEMPLATE.read_text())
    m["classification"]["risk_level"] = risk
    m["permissions"]["network"] = network
    return m


@pytest.mark.parametrize(
    "risk,network,ok",
    [
        ("passive", "public", True),
        ("passive", "target_scope", True),
        ("passive", "none", True),
        ("safe_active", "public", False),
        ("active", "public", False),
        ("intrusive", "public", False),
        ("safe_active", "target_scope", True),
        ("active", "none", True),
        ("passive", "internet", False),
    ],
)
def test_network_mode_rules(risk, network, ok):
    assert (validate_manifest(manifest(risk, network)) == []) is ok
```

(If `test_contract.py` already imports some of these names, keep one import of each.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd api && uv run pytest tests/test_contract.py -q`
Expected: FAIL for the `passive`/`public` case (not in the enum).

- [ ] **Step 3: Schema**

In `plugins/schemas/manifest.schema.json`:
- `properties.permissions.properties.network.enum` becomes `["none", "public", "target_scope"]`;
- add at the top level, next to `"properties"`:

```json
  "allOf": [
    {
      "if": {
        "properties": {
          "classification": {
            "properties": { "risk_level": { "not": { "const": "passive" } } },
            "required": ["risk_level"]
          }
        },
        "required": ["classification"]
      },
      "then": {
        "properties": {
          "permissions": { "properties": { "network": { "enum": ["none", "target_scope"] } } }
        }
      }
    }
  ],
```

- [ ] **Step 4: Manifests**

Set `permissions.network: public` in `plugins/_template/plugin.yaml`, `plugins/projectdiscovery.subfinder/plugin.yaml` and `plugins/projectdiscovery.dnsx/plugin.yaml`. `projectdiscovery.httpx` stays `target_scope`. In the template add a comment line above it:

```yaml
  # public: internet except private ranges (passive plugins only). target_scope: only this run's targets. none: no network.
  network: public
```

- [ ] **Step 5: Run the tests**

Run: `cd api && uv run pytest tests/test_contract.py tests/test_registry.py -q`
Expected: all pass, including `test_repo_manifests_are_valid`.

- [ ] **Step 6: Commit**

```bash
git add plugins/schemas/manifest.schema.json plugins/_template/plugin.yaml plugins/projectdiscovery.subfinder/plugin.yaml plugins/projectdiscovery.dnsx/plugin.yaml api/tests/test_contract.py
git commit -m "feat(plugins): network: public for passive plugins; active plugins must stay in scope"
```

---

### Task 2: The egress firewall image

**Files:**
- Create: `runner/egress/Dockerfile`, `runner/egress/egress.sh`
- Test: `runner/tests/test_egress_image.py`

**Interfaces:**
- Produces: image `nyx-egress:1`; contract in Global Constraints (env in, `ready` out).

- [ ] **Step 1: Write the failing tests**

Create `runner/tests/test_egress_image.py`:

```python
"""The firewall image on its own: which rules each mode installs."""

import os
import time

import docker
import pytest

try:
    client = docker.from_env()
    client.ping()
except Exception:  # noqa: BLE001
    client = None
needs_docker = pytest.mark.skipif(client is None, reason="Docker not available")
EGRESS_DIR = os.path.join(os.path.dirname(__file__), "..", "egress")


@pytest.fixture(scope="module")
def image():
    client.images.build(path=EGRESS_DIR, tag="nyx-egress:1")
    return "nyx-egress:1"


def start(image, mode, allow=""):
    c = client.containers.run(
        image,
        detach=True,
        cap_drop=["ALL"],
        cap_add=["NET_ADMIN"],
        read_only=True,
        tmpfs={"/run": "size=1m"},
        environment={"NYX_EGRESS_MODE": mode, "NYX_EGRESS_ALLOW": allow},
    )
    for _ in range(100):
        c.reload()
        if b"ready" in c.logs(stdout=True, stderr=False) or c.status == "exited":
            break
        time.sleep(0.1)
    return c


def rules(c):
    return c.exec_run(["iptables", "-S", "OUTPUT"]).output.decode()


@needs_docker
def test_target_scope_allows_only_listed_addresses(image):
    c = start(image, "target_scope", "192.0.2.10 198.51.100.0/24")
    try:
        r = rules(c)
        assert "-P OUTPUT DROP" in r
        assert "-A OUTPUT -o lo -j ACCEPT" in r
        assert "-d 192.0.2.10/32 -j ACCEPT" in r
        assert "-d 198.51.100.0/24 -j ACCEPT" in r
    finally:
        c.remove(force=True)


@needs_docker
def test_target_scope_resolves_names(image):
    c = start(image, "target_scope", "localhost")
    try:
        assert "-d 127.0.0.1/32 -j ACCEPT" in rules(c)
    finally:
        c.remove(force=True)


@needs_docker
def test_unresolvable_name_still_ready(image):
    c = start(image, "target_scope", "no-such-host.invalid")
    try:
        assert b"ready" in c.logs(stdout=True, stderr=False)
        assert b"unresolved: no-such-host.invalid" in c.logs(stdout=False, stderr=True)
    finally:
        c.remove(force=True)


@needs_docker
def test_public_drops_private_ranges(image):
    c = start(image, "public")
    try:
        r = rules(c)
        assert "-P OUTPUT ACCEPT" in r
        for net in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "100.64.0.0/10"):
            assert f"-d {net} -j DROP" in r
        assert r.index("-o lo -j ACCEPT") < r.index("-d 127.0.0.0/8 -j DROP")
    finally:
        c.remove(force=True)


@needs_docker
def test_bad_mode_exits_without_ready(image):
    c = start(image, "wide_open")
    try:
        assert c.status == "exited"
        assert b"ready" not in c.logs(stdout=True, stderr=False)
        assert b"egress: unknown mode wide_open" in c.logs(stdout=False, stderr=True)
    finally:
        c.remove(force=True)
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd runner && uv run pytest tests/test_egress_image.py -q`
Expected: ERROR in the fixture — the build context `runner/egress` does not exist.

- [ ] **Step 3: Dockerfile**

`runner/egress/Dockerfile`:

```dockerfile
# The per-run egress firewall. Only NET_ADMIN, nothing else: it installs iptables rules in the network namespace
# the plugin then joins, prints "ready", and sleeps until the runner removes it.
FROM alpine:3.20
RUN apk add --no-cache iptables ip6tables
COPY egress.sh /egress.sh
ENTRYPOINT ["/bin/sh", "/egress.sh"]
```

- [ ] **Step 4: Script**

`runner/egress/egress.sh`:

```sh
#!/bin/sh
# Installs the plugin's outbound rules, then says "ready". Inputs: NYX_EGRESS_MODE, NYX_EGRESS_ALLOW (spec §2).
set -u

fail() { echo "egress: $*" >&2; exit 1; }
v4() { iptables "$@" || fail "iptables $*"; }
# No IPv6 filter table in the kernel means this container has no IPv6 at all: skip those rules.
if ip6tables -L >/dev/null 2>&1; then v6() { ip6tables "$@" || fail "ip6tables $*"; }; else v6() { :; }; fi

PRIVATE4="10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 127.0.0.0/8 0.0.0.0/8 224.0.0.0/4"
PRIVATE6="fc00::/7 fe80::/10 ff00::/8 ::/128"

allow() {  # one address or network
  case "$1" in
    *:*) v6 -A OUTPUT -d "$1" -j ACCEPT ;;
    *) v4 -A OUTPUT -d "$1" -j ACCEPT ;;
  esac
}

is_address() { echo "$1" | grep -Eq '^[0-9.]+(/[0-9]+)?$|^[0-9a-fA-F:]+(/[0-9]+)?$'; }

case "${NYX_EGRESS_MODE:-}" in
  target_scope)
    for t in v4 v6; do
      $t -P OUTPUT DROP
      $t -A OUTPUT -o lo -j ACCEPT
      $t -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    done
    for entry in ${NYX_EGRESS_ALLOW:-}; do
      if is_address "$entry"; then
        allow "$entry"
      else
        addrs=$(getent ahosts "$entry" | awk '{print $1}' | sort -u)
        [ -n "$addrs" ] || { echo "unresolved: $entry" >&2; continue; }
        for a in $addrs; do allow "$a"; done
      fi
    done
    ;;
  public)
    v4 -P OUTPUT ACCEPT
    v4 -A OUTPUT -o lo -j ACCEPT
    for n in $PRIVATE4; do v4 -A OUTPUT -d "$n" -j DROP; done
    v6 -P OUTPUT ACCEPT
    v6 -A OUTPUT -o lo -j ACCEPT
    for n in $PRIVATE6; do v6 -A OUTPUT -d "$n" -j DROP; done
    ;;
  *) fail "unknown mode ${NYX_EGRESS_MODE:-}" ;;
esac

echo ready
exec sleep infinity
```

- [ ] **Step 5: Run the tests**

Run: `cd runner && uv run pytest tests/test_egress_image.py -q`
Expected: all pass. (`iptables -S` prints IPv4 single addresses as `/32`; if this alpine version's `iptables-nft` prints them differently, adjust the asserted strings to its `-S` output and note it in the commit.)

- [ ] **Step 6: Commit**

```bash
git add runner/egress runner/tests/test_egress_image.py
git commit -m "feat(runner): egress firewall image — target_scope allowlist, public minus private ranges"
```

---

### Task 3: Sandbox — firewall and plugin container configs

**Files:**
- Modify: `runner/app/sandbox.py`
- Test: `runner/tests/test_sandbox.py`

**Interfaces:**
- Produces:
  - `EGRESS_IMAGE = "nyx-egress:1"`
  - `egress_config(mode: str, allow: list[str], run_id: str) -> dict`
  - `egress_allow(targets: list[dict]) -> list[str]`
  - `container_config(resources, input, extra_env=None, permissions=None, network_mode: str | None = None) -> dict`

- [ ] **Step 1: Write the failing tests**

Append to `runner/tests/test_sandbox.py`:

```python
from app.sandbox import EGRESS_IMAGE, egress_allow, egress_config  # noqa: E402


def test_firewall_has_only_net_admin():
    cfg = egress_config("target_scope", ["example.com", "10.0.0.1"], "r1")
    assert EGRESS_IMAGE == "nyx-egress:1"
    assert cfg["cap_drop"] == ["ALL"] and cfg["cap_add"] == ["NET_ADMIN"]
    assert cfg["security_opt"] == ["no-new-privileges"]
    assert cfg["read_only"] is True and cfg["tmpfs"] == {"/run": "size=1m"}
    assert (cfg["mem_limit"], cfg["pids_limit"]) == ("32m", 32)
    assert cfg["network"] == NETWORK
    assert cfg["environment"] == {"NYX_EGRESS_MODE": "target_scope", "NYX_EGRESS_ALLOW": "example.com 10.0.0.1"}
    assert cfg["labels"] == {"nyx.run_id": "r1", "nyx.role": "egress"}
    assert "privileged" not in cfg or cfg["privileged"] is False


@pytest.mark.parametrize(
    "targets,allow",
    [
        ([{"type": "url", "value": "https://a.example.com:8443/x?y"}], ["a.example.com"]),
        ([{"type": "url", "value": "http://[2001:db8::1]:8080/x"}], ["2001:db8::1"]),
        ([{"type": "domain", "value": "a.example.com"}, {"type": "url", "value": "http://a.example.com/"}], ["a.example.com"]),
        ([{"type": "ip", "value": "10.0.0.1"}, {"type": "cidr", "value": "10.1.0.0/24"}], ["10.0.0.1", "10.1.0.0/24"]),
        ([], []),
    ],
)
def test_egress_allow_extracts_hosts(targets, allow):
    assert egress_allow(targets) == allow


def test_plugin_joins_the_firewall_namespace():
    cfg = container_config(
        {"cpu": 0.5, "memory_mb": 64, "timeout_seconds": 10}, {}, network_mode="container:abc"
    )
    assert cfg["network_mode"] == "container:abc"
    assert "network" not in cfg
```

and add `import pytest` at the top of the file.

- [ ] **Step 2: Run them to see them fail**

Run: `cd runner && uv run pytest tests/test_sandbox.py -q`
Expected: FAIL — `ImportError: cannot import name 'EGRESS_IMAGE'`.

- [ ] **Step 3: Implement**

In `runner/app/sandbox.py` add `from urllib.parse import urlsplit` and:

```python
EGRESS_IMAGE = "nyx-egress:1"


def egress_allow(targets: list[dict]) -> list[str]:
    """What the firewall lets the plugin reach: hosts for URLs, values as they are for the rest."""
    out: list[str] = []
    for t in targets:
        value = urlsplit(t["value"]).hostname if t.get("type") == "url" else t.get("value")
        if value and value not in out:
            out.append(value)
    return out


def egress_config(mode: str, allow: list[str], run_id: str) -> dict:
    """The firewall container. Root inside (iptables needs it) with NET_ADMIN as its only capability."""
    return {
        "detach": True,
        "read_only": True,
        "tmpfs": {"/run": "size=1m"},  # iptables' lock file
        "cap_drop": ["ALL"],
        "cap_add": ["NET_ADMIN"],
        "security_opt": ["no-new-privileges"],
        "mem_limit": "32m",
        "pids_limit": 32,
        "network": NETWORK,
        "log_config": LogConfig(type="json-file", config={"max-size": "1m", "max-file": "1"}),
        "environment": {"NYX_EGRESS_MODE": mode, "NYX_EGRESS_ALLOW": " ".join(allow)},
        "labels": {"nyx.run_id": run_id, "nyx.role": "egress"},
    }
```

and change `container_config`:

```python
def container_config(
    resources: dict,
    input: dict,
    extra_env: dict | None = None,
    permissions: dict | None = None,
    network_mode: str | None = None,
) -> dict:
```

with, right before `return cfg`:

```python
    if network_mode is not None:  # the plugin lives in its firewall's network namespace
        del cfg["network"]
        cfg["network_mode"] = network_mode
```

(keep the existing `network == "none"` branch above it).

`urlsplit("http://[2001:db8::1]:8080/x").hostname` already returns `2001:db8::1` without brackets.

- [ ] **Step 4: Run the tests**

Run: `cd runner && uv run pytest tests/test_sandbox.py -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add runner/app/sandbox.py runner/tests/test_sandbox.py
git commit -m "feat(runner): firewall and plugin-in-firewall container configs"
```

---

### Task 4: Runner — every networked plugin behind its firewall

**Files:**
- Modify: `runner/app/main.py`, `runner/tests/test_runs.py`
- Create: `runner/tests/fixtures/probe/Dockerfile`, `runner/tests/test_egress.py`

**Interfaces:**
- Consumes: Task 2 image, Task 3 functions.
- Produces: `POST /v1/runs` behaviour per spec §3; `stream(container, timeout, firewall=None)`.

- [ ] **Step 1: Existing runner tests opt out of networking**

They test streaming, timeouts and cancel, not egress. In `runner/tests/test_runs.py`, the `run()` helper's body gains `"permissions": {"network": "none"}`, and `test_cancel_kills_a_running_container` keeps using `run()` (so still no firewall).

- [ ] **Step 2: Probe fixture**

`runner/tests/fixtures/probe/Dockerfile`:

```dockerfile
FROM busybox:1.37
# Tries each URL in NYX_PROBE and prints one JSON line per URL; NYX_IFDOWN=1 also tries to take the interface down.
CMD ["sh", "-c", "for u in $NYX_PROBE; do if wget -q -T 3 -O /dev/null \"$u\"; then r=true; else r=false; fi; echo \"{\\\"url\\\":\\\"$u\\\",\\\"reached\\\":$r}\"; done; if [ -n \"$NYX_IFDOWN\" ]; then if ip link set eth0 down 2>/dev/null; then d=true; else d=false; fi; echo \"{\\\"ifdown\\\":$d}\"; fi"]
```

- [ ] **Step 3: Write the failing integration tests**

Create `runner/tests/test_egress.py`:

```python
"""Plugins behind their firewall: what they can reach, what they cannot change, and what is left afterwards."""

import json
import os
import threading
import time

import docker
import pytest
from fastapi.testclient import TestClient

TOKEN = "test-token"
os.environ["NYX_RUNNER_TOKEN"] = TOKEN

from app.main import app  # noqa: E402
from app.sandbox import NETWORK  # noqa: E402

try:
    d = docker.from_env()
    d.ping()
except Exception:  # noqa: BLE001
    d = None
pytestmark = pytest.mark.skipif(d is None, reason="Docker not available")
H = {"authorization": f"Bearer {TOKEN}"}
HERE = os.path.dirname(__file__)


@pytest.fixture(scope="module")
def images():
    d.images.build(path=os.path.join(HERE, "..", "egress"), tag="nyx-egress:1")
    probe, _ = d.images.build(path=os.path.join(HERE, "fixtures", "probe"), tag="nyx-test/probe:1")
    return probe.id


@pytest.fixture(scope="module")
def hosts():
    """Two web servers on the plugin network: A is the target, B is somebody else."""
    if not d.networks.list(names=[NETWORK]):
        d.networks.create(NETWORK, driver="bridge")
    made = {}
    for name in ("nyx-test-a", "nyx-test-b"):
        c = d.containers.run("nginx:1.27-alpine", name=name, detach=True, network=NETWORK, remove=True)
        c.reload()
        made[name] = c.attrs["NetworkSettings"]["Networks"][NETWORK]["IPAddress"]
    yield made
    for name in made:
        try:
            d.containers.get(name).remove(force=True)
        except docker.errors.NotFound:
            pass


def run(probe, network, targets, env, run_id="e1"):
    import app.main as m

    m.EXTRA_ENV = env
    try:
        body = {
            "image": "nyx-test/probe:1",
            "digest": probe,
            "resources": {"cpu": 0.5, "memory_mb": 64, "timeout_seconds": 30},
            "permissions": {"network": network},
            "input": {"run_id": run_id, "targets": targets, "target": targets[0] if targets else {}},
        }
        r = TestClient(app).post("/v1/runs", json=body, headers=H)
    finally:
        m.EXTRA_ENV = {}
    lines = [json.loads(x) for x in r.text.splitlines() if x.startswith("{")]
    return r.status_code, {x["url"]: x["reached"] for x in lines if "url" in x}, lines


def leftovers(run_id):
    return d.containers.list(all=True, filters={"label": f"nyx.run_id={run_id}"})


def test_target_scope_reaches_only_its_target(images, hosts):
    a, b = hosts["nyx-test-a"], hosts["nyx-test-b"]
    code, reached, _ = run(images, "target_scope", [{"type": "ip", "value": a}], {"NYX_PROBE": f"http://{a}/ http://{b}/"})
    assert code == 200
    assert reached == {f"http://{a}/": True, f"http://{b}/": False}
    assert not leftovers("e1")


def test_target_scope_by_name(images, hosts):
    b = hosts["nyx-test-b"]
    code, reached, _ = run(
        images, "target_scope", [{"type": "domain", "value": "nyx-test-a"}], {"NYX_PROBE": f"http://nyx-test-a/ http://{b}/"}
    )
    assert reached == {"http://nyx-test-a/": True, f"http://{b}/": False}


def test_public_cannot_reach_private_addresses(images, hosts):
    a = hosts["nyx-test-a"]
    code, reached, _ = run(images, "public", [], {"NYX_PROBE": f"http://{a}/"})
    assert reached == {f"http://{a}/": False}


def test_plugin_cannot_touch_the_network(images, hosts):
    a = hosts["nyx-test-a"]
    _, _, lines = run(images, "target_scope", [{"type": "ip", "value": a}], {"NYX_PROBE": "", "NYX_IFDOWN": "1"})
    assert {"ifdown": False} in lines


def test_none_starts_no_firewall(images, monkeypatch):
    started = []
    real = docker.models.containers.ContainerCollection.run

    def spy(self, image, **kw):
        started.append(image)
        return real(self, image, **kw)

    monkeypatch.setattr(docker.models.containers.ContainerCollection, "run", spy)
    run(images, "none", [], {"NYX_PROBE": ""})
    assert "nyx-egress:1" not in started


def test_unknown_network_mode_is_422(images):
    code, _, _ = run(images, "wide_open", [], {})
    assert code == 422


def test_firewall_that_never_gets_ready_is_cleaned_up(images, monkeypatch):
    import app.main as m

    monkeypatch.setattr(m, "egress_mode", lambda network: "bogus")  # the script refuses unknown modes
    code, _, _ = run(images, "target_scope", [], {}, run_id="e-bad")
    assert code == 500
    assert not leftovers("e-bad")
    assert m.slots.acquire(blocking=False)  # the slot came back
    m.slots.release()


def test_cancel_removes_plugin_and_firewall(images, hosts):
    a = hosts["nyx-test-a"]
    out = {}
    probe_forever = {"NYX_PROBE": " ".join(["http://192.0.2.1/"] * 20)}  # each try times out after 3 s
    t = threading.Thread(
        target=lambda: out.update(r=run(images, "target_scope", [{"type": "ip", "value": a}], probe_forever, "e-cancel"))
    )
    t.start()
    for _ in range(100):
        if len(leftovers("e-cancel")) == 2:
            break
        time.sleep(0.1)
    assert TestClient(app).delete("/v1/runs/e-cancel", headers=H).status_code == 204
    t.join(30)
    assert not leftovers("e-cancel")
```

- [ ] **Step 4: Run them to see them fail**

Run: `docker pull nginx:1.27-alpine && cd runner && uv run pytest tests/test_egress.py -q`
Expected: `test_target_scope_reaches_only_its_target` FAILS (B is reached: no firewall yet); `test_unknown_network_mode_is_422` FAILS (200); `test_firewall_that_never_gets_ready_is_cleaned_up` ERRORS (`egress_mode` missing).

- [ ] **Step 5: Implement**

In `runner/app/main.py`:

imports: `import time` and `from app.sandbox import EGRESS_IMAGE, NETWORK, container_config, egress_allow, egress_config`.

Add:

```python
READY_SECONDS = 15


def egress_mode(network: str) -> str:
    return "public" if network == "public" else "target_scope"


def start_firewall(d, network: str, input: dict):
    """Start the run's firewall and wait for its rules. Returns the container; raises HTTPException(500) otherwise."""
    targets = input.get("targets") or ([input["target"]] if input.get("target") else [])
    try:
        fw = d.containers.run(
            EGRESS_IMAGE, **egress_config(egress_mode(network), egress_allow(targets), str(input.get("run_id", "")))
        )
    except ImageNotFound:
        raise HTTPException(
            500, "Egress firewall image missing. Build it with: docker compose --profile plugins build"
        ) from None
    deadline = time.monotonic() + READY_SECONDS
    while time.monotonic() < deadline:
        if b"ready" in fw.logs(stdout=True, stderr=False):
            return fw
        fw.reload()
        if fw.status == "exited":
            break
        time.sleep(0.1)
    tail = fw.logs(stdout=False, stderr=True)[-1000:].decode("utf-8", "replace").strip()
    fw.remove(force=True)
    raise HTTPException(500, f"Egress firewall did not start: {tail or 'no output'}")
```

Replace `start` with:

```python
@app.post("/v1/runs", dependencies=[Auth])
def start(body: RunIn):
    network = body.permissions.get("network", "target_scope")
    if network not in ("none", "public", "target_scope"):
        raise HTTPException(422, f"Unknown network mode {network}.")
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Runner is busy. Try again in a moment.")
    fw = None
    try:
        d = engine()
        ensure_network(d)
        mode = None
        if network != "none":
            fw = start_firewall(d, network, body.input)
            mode = f"container:{fw.id}"
        cfg = container_config(body.resources, body.input, EXTRA_ENV, body.permissions, network_mode=mode)
        container = d.containers.run(body.digest, **cfg)
    except Exception as e:  # noqa: BLE001
        slots.release()
        if fw is not None:
            fw.remove(force=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(500, f"Could not start the plugin: {e}") from None
    return StreamingResponse(
        stream(container, int(body.resources["timeout_seconds"]), fw), media_type="application/x-ndjson"
    )
```

Change `stream(container, timeout)` to `stream(container, timeout, firewall=None)` and, in its `finally`, after removing the plugin container and before `slots.release()`:

```python
        if firewall is not None:
            try:
                firewall.remove(force=True)
            except NotFound:
                pass
```

- [ ] **Step 6: Run the runner suite**

Run: `cd runner && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add runner/app/main.py runner/tests
git commit -m "feat(runner): every networked plugin runs behind its own egress firewall"
```

---

### Task 5: Compose and README

**Files:**
- Modify: `docker-compose.yml`, `README.md`

- [ ] **Step 1: Compose**

In `docker-compose.yml`, next to the plugin image services:

```yaml
  egress:
    # The per-run egress firewall the runner puts in front of every networked plugin.
    profiles: ["plugins"]
    image: nyx-egress:1
    build: ./runner/egress
```

Run: `docker compose config -q && docker compose --profile plugins build egress`
Expected: no output from `config`; image built.

- [ ] **Step 2: README**

In "What I refuse to do", replace the "Today: … Next: network egress limited to your scope." sentences of the "Let plugins wander" bullet with:

"Today: read-only, non-root, no capabilities, CPU/RAM/process limits, a time limit, no route to the database, the API or the runner, and a firewall in front of every plugin that I cannot be talked out of: a plugin that touches its target can reach only the hosts of its batch, and a passive plugin reaches public sources but never your private networks."

Roadmap item 3: `- [x] **3. Workflow engine** — Temporal scan workflow, plugin activities, retries, cancel and pause, network egress limited to scope`.

In "Teach me a new scanner": add "Declare `network: target_scope` if the tool talks to the target, `public` if it only asks public sources (passive plugins only)."

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml README.md
git commit -m "chore: egress firewall image in compose; README for scoped egress"
```

---

### Task 6: End-to-end check

**Files:** none (fix forward in the owning task's files).

- [ ] **Step 1: Rebuild and restart**

Run: `docker compose --profile plugins build && docker compose up -d --build && docker compose --profile lab up -d testbed`
Expected: all services healthy; the API re-syncs manifests (subfinder/dnsx now `public`).

- [ ] **Step 2: Lab scan**

Scan `testbed.nyx-lab.test` with dnsx + httpx, depth 2 (scope `nyx-lab.test`, active allowed).
Expected: COMPLETED; httpx finds `http://testbed.nyx-lab.test`; `docker ps -a --filter label=nyx.role=egress` is empty afterwards.

- [ ] **Step 3: Passive plugin still works**

Scan a domain you own with subfinder (or `nyx-lab.test`, which only tests that the run completes).
Expected: run SUCCEEDED; subdomains found for a real domain.

- [ ] **Step 4: Cancel**

Start a subfinder scan and cancel it.
Expected: CANCELLED; no container left with the run's label (firewall included).

- [ ] **Step 5: Push**

Ask the user before pushing. Then branch → PR → CI green.
