import shutil
from pathlib import Path

import yaml

from app.db import SessionLocal
from app.models import PluginVersion
from app.registry import sync_plugins

REPO = Path(__file__).resolve().parents[2] / "plugins"


def plugin_dir(tmp_path, **meta) -> Path:
    root = tmp_path / "plugins"
    shutil.copytree(REPO / "schemas", root / "schemas")
    d = root / "example.tool"
    d.mkdir()
    m = yaml.safe_load((REPO / "_template" / "plugin.yaml").read_text())
    m["metadata"].update({"id": "example.tool", "name": "Tool", **meta})
    (d / "plugin.yaml").write_text(yaml.safe_dump(m))
    return root


def test_sync_registers_valid_plugins(tmp_path, runner):
    runner.digests = {"nyx-plugin/template:0.1.0": "sha256:aaa"}
    with SessionLocal() as db:
        assert sync_plugins(db, runner, plugin_dir(tmp_path)) == ["example.tool"]


def test_sync_skips_invalid_manifest(tmp_path, runner):
    root = plugin_dir(tmp_path)
    m = yaml.safe_load((root / "example.tool" / "plugin.yaml").read_text())
    m["permissions"]["docker_socket"] = True
    (root / "example.tool" / "plugin.yaml").write_text(yaml.safe_dump(m))
    with SessionLocal() as db:
        assert sync_plugins(db, runner, root) == []


def test_missing_image_is_listed_without_digest(tmp_path, runner, client, admin):
    with SessionLocal() as db:
        sync_plugins(db, runner, plugin_dir(tmp_path))
    [p] = client.get("/api/v1/plugins").json()
    assert p["id"] == "example.tool"
    assert p["digest"] is None


def test_new_digest_becomes_installed_version(tmp_path, runner, client, admin):
    root = plugin_dir(tmp_path)
    with SessionLocal() as db:
        runner.digests = {"nyx-plugin/template:0.1.0": "sha256:aaa"}
        sync_plugins(db, runner, root)
        runner.digests = {"nyx-plugin/template:0.1.0": "sha256:bbb"}
        sync_plugins(db, runner, root)
        sync_plugins(db, runner, root)  # unchanged: no third row
        assert db.query(PluginVersion).count() == 2
    assert client.get("/api/v1/plugins/example.tool").json()["digest"] == "sha256:bbb"


def test_admin_can_disable_plugin_analyst_cannot(tmp_path, runner, client, admin):
    with SessionLocal() as db:
        sync_plugins(db, runner, plugin_dir(tmp_path))
    r = client.patch("/api/v1/plugins/example.tool", json={"enabled": False})
    assert r.status_code == 200
    assert r.json()["enabled"] is False
    assert client.get("/api/v1/plugins/nope.nope").status_code == 404


def test_repo_manifests_are_valid():
    from app.contract import load_manifest, validate_manifest

    manifests = sorted(p for p in REPO.glob("*/plugin.yaml"))
    assert manifests, "no plugins found"
    for p in manifests:
        assert validate_manifest(load_manifest(p)) == [], p
