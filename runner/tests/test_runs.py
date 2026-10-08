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
