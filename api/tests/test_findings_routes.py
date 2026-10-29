import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.db import SessionLocal
from app.findings import fingerprint
from app.models import Asset, Finding, FindingOccurrence, Plugin, PluginEvent, PluginRun, PluginVersion, Scan, User

URL = "/api/v1/findings"


def seed(title, severity="medium", status="open", plugin_id="t.nuc", asset=None, scan=None, days_ago=0):
    """One finding (and its asset/occurrence when named). Returns the finding id as str."""
    when = datetime.now(UTC) - timedelta(days=days_ago)
    with SessionLocal() as db:
        asset_id = None
        if asset:
            row = db.query(Asset).filter_by(kind="http_service", value=asset).one_or_none()
            if row is None:
                row = Asset(kind="http_service", value=asset, data={}, first_seen=when, last_seen=when)
                db.add(row)
                db.flush()
            asset_id = row.id
        f = Finding(
            fingerprint=fingerprint(plugin_id, title, asset or "x"),
            plugin_id=plugin_id,
            template_id=title.lower().replace(" ", "-"),
            title=title,
            severity=severity,
            matched_at=asset or "x",
            asset_id=asset_id,
            data={"title": title, "description": "d"},
            status=status,
            first_seen=when,
            last_seen=when,
        )
        db.add(f)
        db.flush()
        if scan:
            db.add(FindingOccurrence(finding_id=f.id, scan_id=scan, seen_at=when))
        db.commit()
        return str(f.id)


def make_scan():
    with SessionLocal() as db:
        s = Scan(root_target={"type": "domain", "value": "example.com"}, plugin_ids=["t.nuc"], status="COMPLETED")
        db.add(s)
        db.commit()
        return s.id


@pytest.fixture
def data(admin):
    scan = make_scan()
    ids = {
        "crit": seed("SQL error", "critical", asset="http://a.example.com", scan=scan),
        "low": seed("Banner", "low", asset="http://a.example.com"),
        "fp": seed("Git config", "medium", status="false_positive", plugin_id="t.other"),
    }
    return scan, ids


def titles(r):
    return [f["title"] for f in r.json()["items"]]


def test_list_orders_by_severity_and_counts(client, data):
    r = client.get(URL)
    assert r.status_code == 200
    assert titles(r) == ["SQL error", "Git config", "Banner"] and r.json()["total"] == 3
    crit = r.json()["items"][0]
    assert crit["asset"]["value"] == "http://a.example.com" and crit["occurrences"] == 1


@pytest.mark.parametrize(
    "query,expected",
    [
        ("severity=critical,low", ["SQL error", "Banner"]),
        ("status=false_positive", ["Git config"]),
        ("plugin_id=t.other", ["Git config"]),
        ("q=git", ["Git config"]),
        ("q=a.example", ["SQL error", "Banner"]),
    ],
)
def test_filters(client, data, query, expected):
    assert titles(client.get(f"{URL}?{query}")) == expected


def test_scan_filter(client, data):
    scan, _ = data
    assert titles(client.get(f"{URL}?scan_id={scan}")) == ["SQL error"]


def test_bad_filter_values_are_422(client, data):
    r = client.get(f"{URL}?severity=bogus")
    assert (r.status_code, r.json()["detail"]) == (422, "Unknown severity: bogus.")
    assert client.get(f"{URL}?status=bogus").status_code == 422


def test_paging(client, data):
    page = client.get(f"{URL}?after=2").json()
    assert [f["title"] for f in page["items"]] == ["Banner"] and page["total"] == 3


def test_detail_has_occurrences(client, data):
    scan, ids = data
    d = client.get(f"{URL}/{ids['crit']}").json()
    assert d["data"]["description"] == "d"
    assert [o["scan_id"] for o in d["occurrences_list"]] == [str(scan)]
    assert d["occurrences_list"][0]["root_target"] == {"type": "domain", "value": "example.com"}
    assert d["raw"] is None  # seeded without a run
    assert client.get(f"{URL}/{uuid.uuid4()}").status_code == 404


def test_review(client, data, admin):
    _, ids = data
    r = client.patch(f"{URL}/{ids['low']}", json={"status": "accepted_risk", "note": "Public banner"})
    assert r.status_code == 200
    got = (r.json()["status"], r.json()["status_note"], r.json()["status_by"])
    assert got == ("accepted_risk", "Public banner", admin["id"])
    assert client.patch(f"{URL}/{ids['low']}", json={"status": "gone"}).status_code == 422


def test_viewer_cannot_review(client, data):
    _, ids = data
    with SessionLocal() as db:
        db.query(User).update({"role": "viewer"})
        db.commit()
    assert client.get(URL).status_code == 200
    assert client.patch(f"{URL}/{ids['low']}", json={"status": "confirmed"}).status_code == 403


def test_scan_detail_counts_findings(client, data):
    scan, _ = data
    assert client.get(f"/api/v1/scans/{scan}").json()["findings_by_severity"] == {"critical": 1}


SECRET = "DB_PASSWORD=hunter2-very-secret"


def seed_secret_finding(scan):
    """A finding with an extracted secret, its occurrence and the plugin event it came from."""
    fid = seed("Exposed env", "high", asset="http://a.example.com/.env")
    data = {"title": "Exposed env", "severity": "high", "extracted": [SECRET, "short"]}
    with SessionLocal() as db:
        db.add(Plugin(id="t.nuc", name="Nuc", publisher="t", risk_level="safe_active", trust_level="verified"))
        version = PluginVersion(plugin_id="t.nuc", version="1", image="i", manifest={})
        db.add(version)
        db.flush()
        run = PluginRun(plugin_version_id=version.id, scan_id=scan, targets=[{"type": "url", "value": "http://a"}])
        db.add(run)
        db.flush()
        db.add(PluginEvent(run_id=run.id, seq=1, type="finding", payload={"type": "finding", "data": data}, valid=True))
        db.add(
            FindingOccurrence(
                finding_id=uuid.UUID(fid), scan_id=scan, run_id=run.id, event_seq=1, seen_at=datetime.now(UTC)
            )
        )
        f = db.get(Finding, uuid.UUID(fid))
        f.data = data
        db.commit()
        return fid, str(run.id)


def test_extracted_values_are_masked_everywhere(client, data):
    scan, _ = data
    fid, run_id = seed_secret_finding(scan)
    d = client.get(f"{URL}/{fid}").json()
    assert d["data"]["extracted"] == ["DB_P••••", "••••"]
    assert d["raw"]["data"]["extracted"] == ["DB_P••••", "••••"]
    events = client.get(f"/api/v1/runs/{run_id}/events").json()
    assert events[0]["payload"]["data"]["extracted"] == ["DB_P••••", "••••"]
    review = client.patch(f"{URL}/{fid}", json={"status": "confirmed"}).json()
    assert SECRET not in str(review)


def test_operators_can_reveal_viewers_cannot(client, data):
    scan, _ = data
    fid, _ = seed_secret_finding(scan)
    assert client.get(f"{URL}/{fid}/reveal").json() == {"extracted": [SECRET, "short"]}
    with SessionLocal() as db:
        db.query(User).update({"role": "viewer"})
        db.commit()
    assert client.get(f"{URL}/{fid}/reveal").status_code == 403
    assert client.get(f"{URL}/{uuid.uuid4()}/reveal").status_code == 403
