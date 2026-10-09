"""Scans: which targets get which plugins, what a finished batch adds, and how a scan ends.

Plain functions over a Session. The Temporal activities (app/activities.py) are thin wrappers around them.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import PluginEvent, PluginRun, Scan, ScanTarget, ScopeTarget
from app.scope import find_entry, normalized_target

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
