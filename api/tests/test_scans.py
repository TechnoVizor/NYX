import json
import shutil
import uuid
from pathlib import Path

import pytest
import yaml
from sqlalchemy import select

from app.db import SessionLocal
from app.models import PluginEvent, PluginRun, PluginVersion, Scan, ScanTarget
from app.registry import sync_plugins
from app.runner import RunnerError
from app.runs import execute_run

REPO = Path(__file__).resolve().parents[2] / "plugins"


def make_plugins(tmp_path, runner, specs):
    """specs: {plugin_id: (risk_level, accepts)} -> synced plugins with digests."""
    root = tmp_path / "plugins"
    shutil.copytree(REPO / "schemas", root / "schemas")
    base = yaml.safe_load((REPO / "_template" / "plugin.yaml").read_text())
    for pid, (risk, accepts) in specs.items():
        m = json.loads(json.dumps(base))
        m["metadata"].update({"id": pid, "name": pid})
        m["runtime"]["image"] = f"nyx-plugin/{pid}:0.1.0"
        m["classification"]["risk_level"] = risk
        m["io"]["accepts"] = accepts
        (root / pid).mkdir()
        (root / pid / "plugin.yaml").write_text(yaml.safe_dump(m))
        runner.digests[f"nyx-plugin/{pid}:0.1.0"] = f"sha256:{pid}"
    with SessionLocal() as db:
        sync_plugins(db, runner, root)


def add_scope(client, value="example.com", active=False, kind="domain"):
    r = client.post(
        "/api/v1/scope", json={"kind": kind, "value": value, "active_allowed": active, "authorization": "t"}
    )
    assert r.status_code == 201, r.text


def new_scan(plugin_ids, root=("domain", "example.com"), max_depth=2, max_targets=5000):
    with SessionLocal() as db:
        scan = Scan(
            root_target={"type": root[0], "value": root[1]},
            plugin_ids=plugin_ids,
            max_depth=max_depth,
            max_targets=max_targets,
            status="RUNNING",
        )
        db.add(scan)
        db.flush()
        db.add(ScanTarget(scan_id=scan.id, type=root[0], value=root[1], depth=0, in_scope=True))
        db.commit()
        return scan.id


def add_run(scan_id, plugin_id, targets, status="PENDING", attempt=0):
    with SessionLocal() as db:
        v = db.scalar(select(PluginVersion).where(PluginVersion.plugin_id == plugin_id))
        run = PluginRun(
            plugin_version_id=v.id, scan_id=scan_id, targets=targets, status=status, attempt=attempt, event_count=0
        )
        db.add(run)
        db.commit()
        return run.id


def asset(kind, value):
    def line(body):
        i = body["input"]
        return json.dumps(
            {
                "event_version": "1",
                "type": "asset",
                "plugin_run_id": i["run_id"],
                "plugin_id": i["plugin_id"],
                "plugin_version": i["plugin_version"],
                "timestamp": "2026-10-09T12:00:00Z",
                "target": i["target"],
                "data": {"kind": kind, "value": value},
            }
        )

    return line


def trailer(code=0):
    return json.dumps({"runner": {"exit_code": code, "timed_out": False, "stderr_tail": "boom" if code else ""}})


def targets_of(scan_id):
    with SessionLocal() as db:
        rows = db.scalars(select(ScanTarget).where(ScanTarget.scan_id == scan_id)).all()
        return {(t.type, t.value): t for t in rows}


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(tmp_path, runner, {"t.sub": ("passive", ["domain"]), "t.http": ("safe_active", ["domain", "url"])})
    add_scope(client, "example.com", active=True)
    return runner


def test_assets_become_targets_one_level_deeper(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [
        asset("subdomain", "a.example.com"),
        asset("subdomain", "x.other.net"),
        asset("ip", "10.0.0.1"),
        asset("technology", "nginx"),
        trailer(0),
    ]
    execute_run(run, world)
    t = targets_of(scan)
    assert (t[("domain", "a.example.com")].depth, t[("domain", "a.example.com")].in_scope) == (1, True)
    assert t[("domain", "a.example.com")].source_run_id == run
    assert (t[("domain", "x.other.net")].in_scope, t[("domain", "x.other.net")].refusal) == (
        False,
        "x.other.net is not in scope.",
    )
    assert t[("ip", "10.0.0.1")].in_scope is False
    assert ("domain", "nginx") not in t and len(t) == 4  # root + 3; unmapped kinds are ignored


def test_harvest_skips_known_targets(world):
    scan = new_scan(["t.sub"])
    for _ in range(2):
        run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
        world.lines = [asset("subdomain", "a.example.com"), asset("subdomain", "A.Example.com."), trailer(0)]
        execute_run(run, world)
    assert len(targets_of(scan)) == 2


def test_target_cap_stops_harvest(world):
    scan = new_scan(["t.sub"], max_targets=3)
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [asset("subdomain", f"h{i}.example.com") for i in range(5)] + [trailer(0)]
    execute_run(run, world)
    assert len(targets_of(scan)) == 3
    with SessionLocal() as db:
        assert db.get(Scan, scan).error == "Stopped at 3 targets."


def test_runner_error_puts_the_run_back_and_raises(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.error = RunnerError("Runner unreachable.")
    with pytest.raises(RunnerError):
        execute_run(run, world)
    with SessionLocal() as db:
        r = db.get(PluginRun, run)
        assert (r.status, r.error, r.attempt) == ("PENDING", "Runner unreachable.", 1)


def test_retry_drops_the_previous_attempts_events(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [asset("subdomain", "a.example.com"), asset("subdomain", "b.example.com")]  # no trailer: cut off
    execute_run(run, world)
    with SessionLocal() as db:
        db.get(PluginRun, run).status = "PENDING"  # as if the worker died mid-stream
        db.commit()
    world.lines = [asset("subdomain", "a.example.com"), trailer(0)]
    execute_run(run, world)
    with SessionLocal() as db:
        r = db.get(PluginRun, run)
        events = db.scalars(select(PluginEvent).where(PluginEvent.run_id == run)).all()
        assert (r.status, r.attempt, len(events)) == ("SUCCEEDED", 2, 1)
    assert world.cancelled == [str(run)]  # the dead attempt's container is killed first


def test_cancelled_run_keeps_what_it_found(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [asset("subdomain", "a.example.com"), trailer(137)]
    execute_run(run, world, cancelled=lambda: True)
    with SessionLocal() as db:
        r = db.get(PluginRun, run)
        assert (r.status, r.error, r.event_count) == ("CANCELLED", "Cancelled.", 1)
    assert ("domain", "a.example.com") in targets_of(scan)


def test_plugin_failure_is_a_result_not_an_exception(world):
    scan = new_scan(["t.sub"])
    run = add_run(scan, "t.sub", [{"type": "domain", "value": "example.com"}])
    world.lines = [trailer(2)]
    execute_run(run, world)
    with SessionLocal() as db:
        assert db.get(PluginRun, run).status == "FAILED"


def test_batch_input_carries_all_targets(world):
    scan = new_scan(["t.sub"])
    ts = [{"type": "domain", "value": "a.example.com"}, {"type": "domain", "value": "b.example.com"}]
    run = add_run(scan, "t.sub", ts)
    world.lines = [trailer(0)]
    execute_run(run, world)
    assert world.calls[0]["input"]["targets"] == ts
    assert world.calls[0]["input"]["target"] == ts[0]
