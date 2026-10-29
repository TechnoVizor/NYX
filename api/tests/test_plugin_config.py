import pytest
from sqlalchemy import select

from app.db import SessionLocal
from app.models import PluginVersion, ScanProfile
from tests.test_scans import add_scope, make_plugins, trailer

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"severity": {"type": "array", "items": {"enum": ["low", "high"]}, "minItems": 1}},
}


def set_config_schema(plugin_id, schema):
    with SessionLocal() as db:
        v = db.scalar(select(PluginVersion).where(PluginVersion.plugin_id == plugin_id))
        v.manifest = {**v.manifest, "config_schema": schema}
        db.commit()


@pytest.fixture
def world(tmp_path, runner, client, admin):
    make_plugins(tmp_path, runner, {"t.sub": ("passive", ["domain"]), "t.cfg": ("passive", ["domain"])})
    set_config_schema("t.cfg", SCHEMA)
    add_scope(client, "example.com")
    runner.lines = [trailer(0)]
    return runner


def profile(plugin_ids, plugin_config=None, max_depth=1, name="Mine"):
    with SessionLocal() as db:
        p = ScanProfile(name=name, plugin_ids=plugin_ids, plugin_config=plugin_config or {}, max_depth=max_depth)
        db.add(p)
        db.commit()
        return str(p.id)


def start(client, **body):
    return client.post("/api/v1/scans", json={"target": {"type": "domain", "value": "example.com"}, **body})


def config_sent(runner, plugin_id):
    return next(c["input"]["config"] for c in runner.calls if c["input"]["plugin_id"] == plugin_id)


def test_config_reaches_the_plugin(client, world):
    r = start(client, plugin_ids=["t.cfg"], plugin_config={"t.cfg": {"severity": ["high"]}})
    assert r.status_code == 202, r.text
    assert r.json()["plugin_config"] == {"t.cfg": {"severity": ["high"]}}
    assert config_sent(world, "t.cfg") == {"severity": ["high"]}


def test_plugins_without_config_get_an_empty_object(client, world):
    start(client, plugin_ids=["t.sub"])
    assert config_sent(world, "t.sub") == {}


@pytest.mark.parametrize(
    "config,msg",
    [
        ({"t.sub": {}}, "Config for t.sub, which is not selected."),
        ({"t.cfg": {"severity": ["urgent"]}}, "t.cfg config: severity/0: 'urgent' is not one of ['low', 'high']"),
        ({"t.cfg": {"nope": 1}}, "t.cfg config: (root): Additional properties are not allowed ('nope' was unexpected)"),
    ],
)
def test_bad_config_is_422(client, world, config, msg):
    r = start(client, plugin_ids=["t.cfg"], plugin_config=config)
    assert (r.status_code, r.json()["detail"]) == (422, msg)


def test_profile_fills_the_scan(client, world):
    pid = profile(["t.sub", "t.cfg"], {"t.cfg": {"severity": ["low"]}}, max_depth=2)
    scan = start(client, profile_id=pid).json()
    assert (sorted(scan["plugin_ids"]), scan["max_depth"], scan["profile_id"]) == (["t.cfg", "t.sub"], 2, pid)
    assert config_sent(world, "t.cfg") == {"severity": ["low"]}


def test_explicit_fields_override_the_profile(client, world):
    pid = profile(["t.sub", "t.cfg"], {"t.cfg": {"severity": ["low"]}}, max_depth=2)
    r = start(client, profile_id=pid, plugin_ids=["t.sub"], max_depth=1)
    assert r.status_code == 202, r.text  # the profile's t.cfg config is dropped with t.cfg, not refused
    assert (r.json()["plugin_ids"], r.json()["max_depth"], r.json()["plugin_config"]) == (["t.sub"], 1, {})


def test_unavailable_profile_plugin_is_422(client, world):
    client.patch("/api/v1/plugins/t.cfg", json={"enabled": False})
    pid = profile(["t.sub", "t.cfg"])
    r = start(client, profile_id=pid)
    assert (r.status_code, r.json()["detail"]) == (422, "t.cfg in this profile is not available.")


def test_unknown_profile_is_404(client, world):
    r = start(client, profile_id="00000000-0000-0000-0000-000000000000")
    assert (r.status_code, r.json()["detail"]) == (404, "No such profile.")
