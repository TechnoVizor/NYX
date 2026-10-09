"""Plugin Registry sync: plugins/*/plugin.yaml -> validated -> Postgres, with image digests from the runner."""

import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.contract import load_manifest, validate_manifest
from app.models import Plugin, PluginInstallation, PluginVersion
from app.runner import RunnerClient

log = logging.getLogger("nyx.registry")


def sync_plugins(db: Session, runner: RunnerClient, root: Path | None = None) -> list[str]:
    root = root or Path(settings.plugins_dir)
    synced = []
    for path in sorted(root.glob("*/plugin.yaml")):
        if path.parent.name.startswith("_"):
            continue  # _template and friends are examples, not plugins
        try:
            m = load_manifest(path)
        except Exception as e:  # noqa: BLE001  a broken file must not stop the others
            log.warning("skipping %s: unreadable (%s)", path, e)
            continue
        if errors := validate_manifest(m):
            log.warning("skipping %s: %s", path, "; ".join(errors))
            continue
        meta, cls = m["metadata"], m["classification"]
        plugin = db.get(Plugin, meta["id"]) or Plugin(id=meta["id"])
        plugin.name, plugin.publisher, plugin.description = meta["name"], meta["publisher"], meta["description"]
        plugin.categories, plugin.risk_level, plugin.trust_level = (
            cls["categories"],
            cls["risk_level"],
            cls["trust_level"],
        )
        db.add(plugin)
        digest = runner.digest(m["runtime"]["image"])
        version = db.scalar(
            select(PluginVersion).where(
                PluginVersion.plugin_id == meta["id"],
                PluginVersion.version == meta["version"],
                PluginVersion.digest.is_(None) if digest is None else PluginVersion.digest == digest,
            )
        )
        if version is None:
            version = PluginVersion(
                plugin_id=meta["id"], version=meta["version"], image=m["runtime"]["image"], digest=digest, manifest=m
            )
            db.add(version)
            db.flush()
        version.manifest = m
        install = db.get(PluginInstallation, meta["id"])
        if install is None:
            db.add(PluginInstallation(plugin_id=meta["id"], plugin_version_id=version.id, enabled=True, config={}))
        else:
            install.plugin_version_id = version.id
        synced.append(meta["id"])
    db.commit()
    return synced


def installed_plugins():
    """Every plugin with its installed version and installation row."""
    return (
        select(Plugin, PluginVersion, PluginInstallation)
        .join(PluginInstallation, PluginInstallation.plugin_id == Plugin.id)
        .join(PluginVersion, PluginVersion.id == PluginInstallation.plugin_version_id)
    )
