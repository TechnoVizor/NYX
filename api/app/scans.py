"""Scans: which targets get which plugins, what a finished batch adds, and how a scan ends.

Plain functions over a Session. The Temporal activities (app/activities.py) are thin wrappers around them.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import SCAN_FINAL, Plugin, PluginEvent, PluginRun, PluginVersion, Scan, ScanTarget, ScopeTarget
from app.registry import installed_plugins
from app.scope import find_entry, normalized_target, refusal

# Asset kinds that are themselves something to scan, and the target type they become. Data types, not tools.
ASSET_TARGET = {"subdomain": "domain", "domain": "domain", "ip": "ip", "http_service": "url"}
MAX_VALUE = 2000  # scan_targets.value


def _now():
    return datetime.now(UTC)


def harvest(db: Session, run: PluginRun) -> int:
    """Turn a finished batch's valid asset events into the scan's next targets. Returns how many were new."""
    scan = db.get(Scan, run.scan_id)
    known = {
        (t, v): d
        for t, v, d in db.execute(
            select(ScanTarget.type, ScanTarget.value, ScanTarget.depth).where(ScanTarget.scan_id == scan.id)
        )
    }
    depth = 1 + max((known.get((t["type"], t["value"]), 0) for t in run.targets), default=0)
    entries = db.scalars(select(ScopeTarget)).all()
    room = scan.max_targets - len(known)
    new: dict[tuple[str, str], dict] = {}
    payloads = db.scalars(
        select(PluginEvent.payload).where(
            PluginEvent.run_id == run.id, PluginEvent.type == "asset", PluginEvent.valid.is_(True)
        )
    )
    for payload in payloads:
        data = payload.get("data") or {}
        kind = ASSET_TARGET.get(data.get("kind"))
        if kind is None:
            continue
        try:
            t = normalized_target(kind, str(data.get("value", "")))
        except ValueError:
            continue
        key = (t["type"], t["value"])
        if key in known or key in new or len(key[1]) > MAX_VALUE:
            continue
        if len(new) >= room:
            scan.error = f"Stopped at {scan.max_targets} targets."
            break
        entry = find_entry(key[0], key[1], entries)
        new[key] = {
            "scan_id": scan.id,
            "type": key[0],
            "value": key[1],
            "depth": depth,
            "source_run_id": run.id,
            "in_scope": entry is not None,
            "refusal": None if entry else f"{key[1]} is not in scope.",
        }
    if new:
        # Two batches of one scan can find the same host at the same moment: the second insert just skips it.
        db.execute(insert(ScanTarget).values(list(new.values())).on_conflict_do_nothing())
    db.commit()
    return len(new)


BATCH = 500


def plan(db: Session, scan_id: uuid.UUID) -> list[str]:
    """Hand every new in-scope target to every selected plugin that takes it; return all PENDING run ids.

    Returning all PENDING runs (not only new ones) makes a retry after a lost reply harmless: the workflow
    skips the ids it already started. The scan row is locked for the whole plan, so an abandoned plan that
    outlives a cancel waits for finalize and then sees the final status instead of adding runs nobody closes.
    """
    scan = db.scalar(select(Scan).where(Scan.id == scan_id).with_for_update())
    if scan.status not in SCAN_FINAL:
        entries = db.scalars(select(ScopeTarget)).all()
        plugins = [
            (p, v)
            for p, v, i in db.execute(installed_plugins().where(Plugin.id.in_(scan.plugin_ids))).all()
            if i.enabled and v.digest
        ]
        rows = db.execute(
            select(ScanTarget, PluginVersion.plugin_id)
            .outerjoin(PluginRun, PluginRun.id == ScanTarget.source_run_id)
            .outerjoin(PluginVersion, PluginVersion.id == PluginRun.plugin_version_id)
            .where(
                ScanTarget.scan_id == scan.id,
                ScanTarget.in_scope.is_(True),
                ScanTarget.routed_at.is_(None),
                ScanTarget.depth < scan.max_depth,
            )
            .order_by(ScanTarget.created_at, ScanTarget.type, ScanTarget.value)
        ).all()
        batches: dict[uuid.UUID, list[dict]] = {}
        for target, source_plugin in rows:
            entry = find_entry(target.type, target.value, entries)
            for p, v in plugins:
                if target.type not in v.manifest["io"]["accepts"] or p.id == source_plugin:
                    continue  # never feed a plugin its own output
                if refusal(p.risk_level, target.value, entry):
                    continue
                batches.setdefault(v.id, []).append({"type": target.type, "value": target.value})
            target.routed_at = _now()
        for version_id, targets in batches.items():
            for i in range(0, len(targets), BATCH):
                db.add(
                    PluginRun(
                        plugin_version_id=version_id,
                        scan_id=scan.id,
                        targets=targets[i : i + BATCH],
                        status="PENDING",
                        attempt=0,
                        requested_by=scan.requested_by,
                        event_count=0,
                    )
                )
        db.commit()
    return [
        str(i)
        for i in db.scalars(
            select(PluginRun.id)
            .where(PluginRun.scan_id == scan_id, PluginRun.status == "PENDING")
            .order_by(PluginRun.created_at, PluginRun.id)
        )
    ]


def set_status(db: Session, scan_id: uuid.UUID, status: str) -> None:
    """One conditional UPDATE: a set_status abandoned by a cancel can never reopen a finished scan."""
    values = {"status": status}
    if status == "RUNNING":
        values["started_at"] = func.coalesce(Scan.started_at, func.now())
    db.execute(update(Scan).where(Scan.id == scan_id, Scan.status.not_in(SCAN_FINAL)).values(**values))
    db.commit()


def finalize(db: Session, scan_id: uuid.UUID, cancelled: bool) -> str:
    scan = db.scalar(select(Scan).where(Scan.id == scan_id).with_for_update())  # waits out a running plan
    db.execute(
        update(PluginRun)
        .where(PluginRun.scan_id == scan_id, PluginRun.status == "PENDING")
        .values(status="CANCELLED", error="Cancelled before it started.", finished_at=_now())
    )
    statuses = list(db.scalars(select(PluginRun.status).where(PluginRun.scan_id == scan_id)))
    if cancelled:
        status = "CANCELLED"
    elif not statuses:
        status, scan.error = "FAILED", "No selected plugin accepts this target."
    elif "SUCCEEDED" not in statuses:
        status, scan.error = "FAILED", scan.error or "No plugin run succeeded."
    elif scan.error or set(statuses) - {"SUCCEEDED"}:
        status = "PARTIAL"
    else:
        status = "COMPLETED"
    scan.status, scan.finished_at = status, _now()
    db.commit()
    return status


def mark_failed(db: Session, run_id: uuid.UUID, message: str) -> None:
    run = db.get(PluginRun, run_id)
    run.status, run.error, run.finished_at = "FAILED", message[-4000:], _now()
    db.commit()


def create_scan(db: Session, root: dict, plugin_ids: list[str], max_depth: int, user_id) -> Scan:
    scan = Scan(root_target=root, plugin_ids=plugin_ids, max_depth=max_depth, status="CREATED", requested_by=user_id)
    db.add(scan)
    db.flush()
    db.add(ScanTarget(scan_id=scan.id, type=root["type"], value=root["value"], depth=0, in_scope=True))
    db.flush()
    return scan


def fail_start(db: Session, scan_id: uuid.UUID) -> None:
    db.execute(
        update(PluginRun)
        .where(PluginRun.scan_id == scan_id, PluginRun.status == "PENDING")
        .values(status="FAILED", error="Scan engine unavailable.", finished_at=_now())
    )
    scan = db.get(Scan, scan_id)
    scan.status, scan.error, scan.finished_at = "FAILED", "Scan engine unavailable.", _now()
    db.commit()
