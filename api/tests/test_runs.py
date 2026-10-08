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
        "event_version": "1",
        "type": "asset",
        "plugin_run_id": i["run_id"],
        "plugin_id": i["plugin_id"],
        "plugin_version": i["plugin_version"],
        "timestamp": "2026-10-08T12:00:00Z",
        "target": i["target"],
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


@pytest.mark.parametrize("value", ["http://a.example.com/\nhttp://evil.net", "a.example.com\nevil.net"])
def test_smuggled_second_target_is_refused(client, runner, plugin, value):
    r = start(client, plugin, value, type="url" if value.startswith("http") else "domain")
    assert r.status_code == 422
    assert runner.calls == []


def test_plugin_receives_normalized_target(client, runner, plugin):
    runner.lines = [trailer(0)]
    start(client, plugin, "A.Example.COM.")
    assert runner.calls[0]["input"]["target"] == {"type": "domain", "value": "a.example.com"}
