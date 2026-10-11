"""Assets and findings across scans, upserted from a finished batch's valid events.

Called by scans.harvest inside its transaction: a batch's targets, assets and findings commit together.
"""

import hashlib

from sqlalchemy import case, func, null, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Asset, Finding, FindingOccurrence, PluginEvent, PluginRun, PluginVersion

SEVERITIES = ("critical", "high", "medium", "low", "info")
STATUSES = ("open", "confirmed", "false_positive", "accepted_risk", "fixed")
OPEN = ("open", "confirmed")
LINKABLE = ("http_service", "subdomain", "domain", "ip")


def fingerprint(plugin_id: str, template_id: str, matched_at: str) -> str:
    return hashlib.sha256(f"{plugin_id}|{template_id}|{matched_at}".encode()).hexdigest()


def _events(db: Session, run: PluginRun, type: str):
    return db.execute(
        select(PluginEvent.seq, PluginEvent.payload)
        .where(PluginEvent.run_id == run.id, PluginEvent.type == type, PluginEvent.valid.is_(True))
        .order_by(PluginEvent.seq)
    ).all()


def index(db: Session, run: PluginRun) -> None:
    now = func.now()  # one value for the whole transaction
    # ponytail: one statement per event; batch the upserts if a run ever reports tens of thousands.
    for _, payload in _events(db, run, "asset"):
        data = payload.get("data") or {}
        kind, value = str(data.get("kind", ""))[:32], str(data.get("value", ""))
        if not kind or not value or len(value) > 2000:
            continue
        attrs = {k: v for k, v in data.items() if k not in ("kind", "value")}
        stmt = insert(Asset).values(
            kind=kind, value=value, data=attrs, first_seen=now, last_seen=now, last_scan_id=run.scan_id
        )
        db.execute(
            stmt.on_conflict_do_update(
                constraint="assets_kind_value_key",
                set_={"data": stmt.excluded.data, "last_seen": now, "last_scan_id": run.scan_id},
            )
        )
    plugin_id = db.scalar(select(PluginVersion.plugin_id).where(PluginVersion.id == run.plugin_version_id))
    for seq, payload in _events(db, run, "finding"):
        data = payload.get("data") or {}
        if data.get("severity") not in SEVERITIES:
            continue
        target_value = str((payload.get("target") or {}).get("value", ""))
        template_id = str(data.get("template_id") or data["title"])
        matched_at = str(data.get("matched_at") or target_value)
        asset_id = db.scalar(
            select(Asset.id)
            .where(Asset.kind.in_(LINKABLE), Asset.value.in_([matched_at, target_value]))
            .order_by((Asset.value == matched_at).desc())
            .limit(1)
        )
        stmt = insert(Finding).values(
            fingerprint=fingerprint(plugin_id, template_id, matched_at),
            plugin_id=plugin_id,
            template_id=template_id[:200],
            title=str(data["title"])[:300],
            severity=data["severity"],
            matched_at=matched_at[:2000],
            asset_id=asset_id,
            data={**data, "matched_at": matched_at},
            status="open",
            first_seen=now,
            last_seen=now,
        )
        reopen = Finding.status == "fixed"  # inside ON CONFLICT, Finding.* is the existing row
        finding_id = db.scalar(
            stmt.on_conflict_do_update(
                index_elements=["fingerprint"],
                set_={
                    "last_seen": now,
                    "title": stmt.excluded.title,
                    "severity": stmt.excluded.severity,
                    "data": stmt.excluded.data,
                    "asset_id": func.coalesce(stmt.excluded.asset_id, Finding.asset_id),
                    "status": case((reopen, "open"), else_=Finding.status),
                    "status_note": case((reopen, null()), else_=Finding.status_note),
                    "status_by": case((reopen, null()), else_=Finding.status_by),
                    "status_at": case((reopen, null()), else_=Finding.status_at),
                },
            ).returning(Finding.id)
        )
        occ = insert(FindingOccurrence).values(
            finding_id=finding_id, scan_id=run.scan_id, run_id=run.id, event_seq=seq, seen_at=now
        )
        db.execute(
            occ.on_conflict_do_update(
                index_elements=["finding_id", "scan_id"], set_={"run_id": run.id, "event_seq": seq, "seen_at": now}
            )
        )
