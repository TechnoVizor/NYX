import json

import pytest

from app.db import SessionLocal
from app.models import Scan, User
from tests.test_scans import add_scope, asset, make_plugins, trailer


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(
        tmp_path,
        runner,
        {
            "t.sub": ("passive", ["domain"]),
            "t.http": ("safe_active", ["domain", "url"]),
            "t.boom": ("intrusive", ["domain"]),
        },
    )
    add_scope(client, "example.com", active=True)
    return runner


def start(client, value="example.com", **body):
    return client.post("/api/v1/scans", json={"target": {"type": "domain", "value": value}, **body})


def test_scan_chains_what_it_finds(client, world):
    def by_plugin(body):
        if body["input"]["plugin_id"] == "t.sub":
            return asset("subdomain", "a.example.com")(body)
        return json.dumps({"skip": True})  # t.http prints nothing useful

    world.lines = [by_plugin, trailer(0)]
    r = start(client, plugin_ids=["t.sub", "t.http"])
    assert r.status_code == 202
    scan = client.get(f"/api/v1/scans/{r.json()['id']}").json()
    assert scan["status"] == "COMPLETED"  # t.http's junk line is stored invalid; the run itself still succeeds
    runs = client.get(f"/api/v1/scans/{scan['id']}/runs").json()
    fed = sorted((r["plugin_id"], [t["value"] for t in r["targets"]]) for r in runs)
    assert fed == [("t.http", ["a.example.com"]), ("t.http", ["example.com"]), ("t.sub", ["example.com"])]
    targets = client.get(f"/api/v1/scans/{scan['id']}/targets").json()
    assert {(t["value"], t["depth"]) for t in targets} == {("example.com", 0), ("a.example.com", 1)}


def test_default_plugins_skip_intrusive_and_disabled(client, world, temporal):
    temporal.drive = False
    client.patch("/api/v1/plugins/t.http", json={"enabled": False})
    scan = start(client).json()
    assert sorted(scan["plugin_ids"]) == ["t.sub"]


def test_root_out_of_scope_is_403(client, world, temporal):
    r = start(client, "example.org")
    assert (r.status_code, r.json()["detail"]) == (403, "example.org is not in scope.")
    assert temporal.started == []


@pytest.mark.parametrize("ids,msg", [(["nope"], "Unknown plugin nope."), ([], "Select at least one plugin.")])
def test_bad_plugin_selection_is_422(client, world, ids, msg):
    r = start(client, plugin_ids=ids)
    assert (r.status_code, r.json()["detail"]) == (422, msg)


def test_depth_bounds(client, world):
    assert start(client, max_depth=0).status_code == 422
    assert start(client, max_depth=4).status_code == 422


def test_pause_resume_cancel_signal_the_workflow(client, world, temporal):
    temporal.drive = False
    sid = start(client).json()["id"]
    for action in ("pause", "resume"):
        assert client.post(f"/api/v1/scans/{sid}/{action}").status_code == 202
    assert client.post(f"/api/v1/scans/{sid}/cancel").status_code == 202
    assert temporal.signals == [(f"scan-{sid}", "pause"), (f"scan-{sid}", "resume")]
    assert temporal.cancelled == [f"scan-{sid}"]


def test_finished_scan_cannot_be_paused(client, world):
    world.lines = [trailer(0)]
    sid = start(client, plugin_ids=["t.sub"]).json()["id"]
    for action in ("pause", "resume", "cancel"):
        r = client.post(f"/api/v1/scans/{sid}/{action}")
        assert (r.status_code, r.json()["detail"]) == (409, "The scan has finished.")


def test_engine_down_fails_the_scan(client, world, temporal):
    temporal.down = True
    r = start(client)
    assert (r.status_code, r.json()["detail"]) == (503, "Scan engine unavailable.")
    with SessionLocal() as db:
        [scan] = db.query(Scan).all()
        assert (scan.status, scan.error) == ("FAILED", "Scan engine unavailable.")


def test_no_engine_connection_is_503(client, world):
    from app.main import app
    from app.temporal import get_temporal

    app.dependency_overrides.pop(get_temporal)
    app.state.temporal = None
    assert start(client).status_code == 503


def test_viewer_reads_but_cannot_start(client, world):
    world.lines = [trailer(0)]
    sid = start(client, plugin_ids=["t.sub"]).json()["id"]
    with SessionLocal() as db:
        db.query(User).update({"role": "viewer"})
        db.commit()
    assert start(client).status_code == 403
    assert client.post(f"/api/v1/scans/{sid}/cancel").status_code == 403
    assert client.get(f"/api/v1/scans/{sid}").status_code == 200
    assert len(client.get("/api/v1/scans").json()) == 1


def test_detail_counts(client, world):
    world.lines = [asset("subdomain", "a.example.com"), asset("subdomain", "x.other.net"), trailer(0)]
    sid = start(client, plugin_ids=["t.sub"], max_depth=1).json()["id"]
    s = client.get(f"/api/v1/scans/{sid}").json()
    assert (s["targets_in_scope"], s["targets_out_of_scope"], s["runs"], s["events"]) == (2, 1, {"SUCCEEDED": 1}, 2)
    out = client.get(f"/api/v1/scans/{sid}/targets?in_scope=false").json()
    assert [(t["value"], t["refusal"]) for t in out] == [("x.other.net", "x.other.net is not in scope.")]


@pytest.mark.parametrize(
    "status,code,detail",
    [("NOT_FOUND", 409, "The scan has finished."), ("UNAVAILABLE", 503, "Scan engine unavailable.")],
)
@pytest.mark.parametrize("action", ["pause", "resume", "cancel"])
def test_engine_errors_on_controls_are_json(client, world, temporal, action, status, code, detail):
    from temporalio.service import RPCError, RPCStatusCode

    temporal.drive = False
    sid = start(client).json()["id"]
    temporal.handle_error = RPCError("boom", RPCStatusCode[status], b"")
    r = client.post(f"/api/v1/scans/{sid}/{action}")
    assert (r.status_code, r.json()["detail"]) == (code, detail)
