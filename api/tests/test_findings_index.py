import json

import pytest
from sqlalchemy import select, update

from app.db import SessionLocal
from app.findings import fingerprint
from app.models import Asset, Finding, FindingOccurrence
from app.runs import execute_run
from tests.test_scans import add_run, add_scope, asset, make_plugins, new_scan, trailer


def finding(title="Exposed .git", severity="medium", **data):
    def line(body):
        i = body["input"]
        return json.dumps(
            {
                "event_version": "1",
                "type": "finding",
                "plugin_run_id": i["run_id"],
                "plugin_id": i["plugin_id"],
                "plugin_version": i["plugin_version"],
                "timestamp": "2026-10-11T12:00:00Z",
                "target": {"type": "url", "value": "http://a.example.com"},
                "data": {"title": title, "severity": severity, **data},
            }
        )

    return line


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(tmp_path, runner, {"t.nuc": ("safe_active", ["url"])})
    add_scope(client, "example.com", active=True)
    return runner


def batch(world, lines, scan=None):
    scan = scan or new_scan(["t.nuc"], root=("url", "http://a.example.com"))
    run = add_run(scan, "t.nuc", [{"type": "url", "value": "http://a.example.com"}])
    world.lines = [*lines, trailer(0)]
    execute_run(run, world)
    return scan, run


def all_(model):
    with SessionLocal() as db:
        return db.scalars(select(model)).all()


def test_assets_upsert_keeps_first_seen(world):
    batch(world, [asset("http_service", "http://a.example.com")])
    [a1] = all_(Asset)
    batch(world, [asset("http_service", "http://a.example.com")])
    [a2] = all_(Asset)
    assert a2.id == a1.id and a2.first_seen == a1.first_seen and a2.last_seen >= a1.last_seen


def test_finding_fingerprint_links_asset_and_records_occurrence(world):
    scan, run = batch(
        world,
        [
            asset("http_service", "http://a.example.com"),
            finding(template_id="git-config", matched_at="http://a.example.com/.git/config"),
        ],
    )
    [f] = all_(Finding)
    assert f.fingerprint == fingerprint("t.nuc", "git-config", "http://a.example.com/.git/config")
    assert (f.status, f.severity, f.title) == ("open", "medium", "Exposed .git")
    [a] = all_(Asset)
    assert f.asset_id == a.id  # no asset at matched_at; the event target is one
    [o] = all_(FindingOccurrence)
    assert (o.scan_id, o.run_id) == (scan, run)


def test_without_template_and_matched_at_title_and_target_are_used(world):
    batch(world, [finding(title="Weak TLS")])
    [f] = all_(Finding)
    assert (f.template_id, f.matched_at) == ("Weak TLS", "http://a.example.com")
    assert f.fingerprint == fingerprint("t.nuc", "Weak TLS", "http://a.example.com")


def test_same_finding_twice_in_one_batch_is_one_row(world):
    batch(world, [finding(template_id="x"), finding(template_id="x")])
    assert len(all_(Finding)) == 1 and len(all_(FindingOccurrence)) == 1


@pytest.mark.parametrize(
    "before,after",
    [
        ("fixed", "open"),
        ("false_positive", "false_positive"),
        ("accepted_risk", "accepted_risk"),
        ("confirmed", "confirmed"),
    ],
)
def test_review_status_on_resight(world, before, after):
    batch(world, [finding(template_id="x")])
    with SessionLocal() as db:
        db.execute(update(Finding).values(status=before, status_note="n"))
        db.commit()
    batch(world, [finding(template_id="x")])
    [f] = all_(Finding)
    assert f.status == after
    assert (f.status_note is None) == (before == "fixed")


def test_rescan_adds_an_occurrence_per_scan(world):
    batch(world, [finding(template_id="x")])
    batch(world, [finding(template_id="x")])
    assert len(all_(Finding)) == 1 and len(all_(FindingOccurrence)) == 2


def test_long_values_are_skipped_or_truncated(world):
    long = "http://a.example.com/" + "a" * 3000
    batch(world, [asset("http_service", long), finding(title="T" * 400, template_id="x", matched_at=long)])
    assert all_(Asset) == []
    [f] = all_(Finding)
    assert len(f.title) == 300 and len(f.matched_at) == 2000
    assert f.data["title"] == "T" * 400 and f.data["matched_at"] == long


def test_invalid_findings_are_ignored(world):
    batch(world, [finding(severity="urgent")])
    assert all_(Finding) == []


def test_detail_returns_the_raw_event(client, world):
    batch(world, [finding(template_id="x", curl="curl http://a.example.com")])
    [f] = all_(Finding)
    raw = client.get(f"/api/v1/findings/{f.id}").json()["raw"]
    assert raw["data"]["curl"] == "curl http://a.example.com"
