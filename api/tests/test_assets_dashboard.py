from datetime import UTC, datetime

from sqlalchemy import update

from app.db import SessionLocal
from app.models import Asset
from tests.test_findings_routes import make_scan, seed


def test_assets_list_counts_open_findings_only(client, admin):
    seed("A", "high", asset="http://a.example.com")
    seed("B", "low", status="false_positive", asset="http://a.example.com")
    seed("C", "low", asset="http://b.example.com", status="fixed")
    page = client.get("/api/v1/assets").json()
    counts = {a["value"]: a["open_findings"] for a in page["items"]}
    assert counts == {"http://a.example.com": 1, "http://b.example.com": 0} and page["total"] == 2
    assert [a["value"] for a in client.get("/api/v1/assets?q=b.example").json()["items"]] == ["http://b.example.com"]
    assert client.get("/api/v1/assets?kind=ip").json()["items"] == []


def test_asset_detail_lists_findings_and_scans(client, admin):
    scan = make_scan()
    seed("A", "high", asset="http://a.example.com", scan=scan)
    with SessionLocal() as db:
        db.execute(update(Asset).values(last_scan_id=scan))
        db.commit()
    [a] = client.get("/api/v1/assets").json()["items"]
    d = client.get(f"/api/v1/assets/{a['id']}").json()
    assert [f["title"] for f in d["findings"]] == ["A"]
    assert [s["id"] for s in d["scans"]] == [str(scan)]


def test_dashboard_on_an_empty_database(client, admin):
    d = client.get("/api/v1/dashboard").json()
    assert d["open_by_severity"] == {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    assert (d["open_total"], d["assets_total"], d["assets_new_7d"]) == (0, 0, 0)
    assert len(d["findings_per_day"]) == 30 and {p["count"] for p in d["findings_per_day"]} == {0}
    assert all(
        p["by_severity"] == dict.fromkeys(("critical", "high", "medium", "low", "info"), 0)
        for p in d["findings_per_day"]
    )
    assert d["findings_per_day"][-1]["date"] == datetime.now(UTC).date().isoformat()
    assert (d["recent_scans"], d["top_assets"]) == ([], [])


def test_dashboard_numbers(client, admin):
    make_scan()
    seed("A", "critical", asset="http://a.example.com")
    seed("B", "high", status="confirmed", asset="http://a.example.com")
    seed("C", "low", status="false_positive", asset="http://b.example.com", days_ago=3)
    seed("D", "medium", asset="http://b.example.com", days_ago=40)
    d = client.get("/api/v1/dashboard").json()
    assert d["open_by_severity"] == {"critical": 1, "high": 1, "medium": 1, "low": 0, "info": 0}
    assert (d["open_total"], d["assets_total"]) == (3, 2)
    assert d["assets_new_7d"] == 2  # a first seen today, b 3 days ago ("D" reuses b's row)
    assert d["findings_per_day"][-1]["count"] == 2 and d["findings_per_day"][-4]["count"] == 1
    assert len(d["recent_scans"]) == 1
    top = [(t["value"], t["open_findings"], t["worst_severity"]) for t in d["top_assets"]]
    assert top == [("http://a.example.com", 2, "critical"), ("http://b.example.com", 1, "medium")]


def test_dashboard_per_day_by_severity(client, admin):
    seed("A", "high", asset="http://a.example.com")
    seed("B", "high", asset="http://a.example.com")
    seed("C", "medium", asset="http://a.example.com")
    seed("D", "low", asset="http://b.example.com", days_ago=3)
    days = client.get("/api/v1/dashboard").json()["findings_per_day"]
    assert days[-1] == {
        "date": days[-1]["date"],
        "count": 3,
        "by_severity": {"critical": 0, "high": 2, "medium": 1, "low": 0, "info": 0},
    }
    assert days[-4]["by_severity"]["low"] == 1 and days[-4]["count"] == 1
    assert all(set(p["by_severity"]) == {"critical", "high", "medium", "low", "info"} for p in days)
