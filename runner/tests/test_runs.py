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
    image, _ = client_docker.images.build(
        path=os.path.join(os.path.dirname(__file__), "fixtures", "echo"), tag="nyx-test/echo:1"
    )
    return image.id


def run(c, digest, timeout=30, env=None):
    body = {
        "image": "nyx-test/echo:1",
        "digest": digest,
        "resources": {"cpu": 0.5, "memory_mb": 64, "timeout_seconds": timeout},
        "input": {"run_id": "r1", **(env or {})},
    }
    r = c.post("/v1/runs", json=body, headers=H)
    return r.status_code, [json.loads(line) if line.startswith("{") else line for line in r.text.splitlines() if line]


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


def test_healthz_needs_no_token():
    assert TestClient(app).get("/healthz").json() == {"status": "ok"}


@needs_docker
def test_huge_line_is_cut(echo_image, monkeypatch):
    monkeypatch.setattr("app.main.EXTRA_ENV", {"LONG": "1"})
    code, lines = run(TestClient(app), echo_image)
    assert lines[-2] == {"c": 3}
    assert lines[-1]["runner"]["exit_code"] == 0
    assert max(len(x) for x in lines if isinstance(x, str)) <= 65536


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
