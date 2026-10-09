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
    code, reached, _ = run(
        images, "target_scope", [{"type": "ip", "value": a}], {"NYX_PROBE": f"http://{a}/ http://{b}/"}
    )
    assert code == 200
    assert reached == {f"http://{a}/": True, f"http://{b}/": False}
    assert not leftovers("e1")


def test_target_scope_by_name(images, hosts):
    b = hosts["nyx-test-b"]
    code, reached, _ = run(
        images,
        "target_scope",
        [{"type": "domain", "value": "nyx-test-a"}],
        {"NYX_PROBE": f"http://nyx-test-a/ http://{b}/"},
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
        target=lambda: out.update(
            r=run(images, "target_scope", [{"type": "ip", "value": a}], probe_forever, "e-cancel")
        )
    )
    t.start()
    for _ in range(100):
        if len(leftovers("e-cancel")) == 2:
            break
        time.sleep(0.1)
    assert len(leftovers("e-cancel")) == 2  # plugin and its firewall
    assert TestClient(app).delete("/v1/runs/e-cancel", headers=H).status_code == 204
    t.join(30)
    assert not leftovers("e-cancel")
