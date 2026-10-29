import pytest

from app.db import SessionLocal
from app.models import User
from tests.test_plugin_config import SCHEMA, set_config_schema
from tests.test_scans import make_plugins

URL = "/api/v1/profiles"


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(tmp_path, runner, {"t.sub": ("passive", ["domain"]), "t.cfg": ("passive", ["domain"])})
    set_config_schema("t.cfg", SCHEMA)
    return runner


def body(**over):
    return {
        "name": "Mine",
        "plugin_ids": ["t.sub", "t.cfg"],
        "plugin_config": {"t.cfg": {"severity": ["low"]}},
        "max_depth": 2,
        **over,
    }


def test_list_has_builtins_first_marked_unavailable_without_their_plugins(client, world):
    client.post(URL, json=body())
    rows = client.get(URL).json()
    assert [(r["name"], r["builtin"]) for r in rows] == [("Balanced", True), ("Quick", True), ("Mine", False)]
    assert rows[0]["available"] is False and "projectdiscovery.nuclei" in rows[0]["unavailable"]
    assert rows[2]["available"] is True and rows[2]["unavailable"] == []


def test_create_edit_delete(client, world):
    created = client.post(URL, json=body())
    assert created.status_code == 201, created.text
    pid = created.json()["id"]
    r = client.patch(f"{URL}/{pid}", json={"name": "Renamed", "max_depth": 3})
    assert (r.status_code, r.json()["name"], r.json()["max_depth"]) == (200, "Renamed", 3)
    assert client.delete(f"{URL}/{pid}").status_code == 204
    assert [p["name"] for p in client.get(URL).json()] == ["Balanced", "Quick"]


@pytest.mark.parametrize(
    "over,code,msg",
    [
        ({"name": "Quick"}, 409, "A profile named Quick already exists."),
        ({"plugin_ids": ["nope"]}, 422, "Unknown plugin nope."),
        ({"plugin_config": {"t.cfg": {"severity": []}}}, 422, None),
        ({"plugin_ids": ["t.sub"]}, 422, "Config for t.cfg, which is not selected."),
    ],
)
def test_create_validation(client, world, over, code, msg):
    r = client.post(URL, json=body(**over))
    assert r.status_code == code, r.text
    if msg:
        assert r.json()["detail"] == msg
    else:
        assert r.json()["detail"].startswith("t.cfg config:")


def test_builtins_are_read_only(client, world):
    quick = next(p for p in client.get(URL).json() if p["name"] == "Quick")
    for r in (client.patch(f"{URL}/{quick['id']}", json={"max_depth": 1}), client.delete(f"{URL}/{quick['id']}")):
        assert (r.status_code, r.json()["detail"]) == (409, "Built-in profiles are read-only.")


def test_viewers_can_read_but_not_write(client, world):
    with SessionLocal() as db:
        db.query(User).update({"role": "viewer"})
        db.commit()
    assert client.get(URL).status_code == 200
    assert client.post(URL, json=body()).status_code == 403


def test_deleting_a_profile_keeps_its_scans(client, world, temporal):
    temporal.drive = False
    client.post("/api/v1/scope", json={"kind": "domain", "value": "example.com", "authorization": "t"})
    pid = client.post(URL, json=body()).json()["id"]
    target = {"type": "domain", "value": "example.com"}
    scan = client.post("/api/v1/scans", json={"target": target, "profile_id": pid}).json()
    client.delete(f"{URL}/{pid}")
    kept = client.get(f"/api/v1/scans/{scan['id']}").json()
    assert (kept["profile_id"], kept["plugin_config"]) == (None, {"t.cfg": {"severity": ["low"]}})
