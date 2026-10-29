"""Assets and findings across scans, upserted from a finished batch's valid events.

Called by scans.harvest inside its transaction: a batch's targets, assets and findings commit together.
"""

import hashlib

from sqlalchemy import case, func, null, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Asset, Finding, FindingOccurrence, PluginEvent, PluginRun, PluginVersion
from app.scope import canonical_url

SEVERITIES = ("critical", "high", "medium", "low", "info")
STATUSES = ("open", "confirmed", "false_positive", "accepted_risk", "fixed")
OPEN = ("open", "confirmed")
LINKABLE = ("http_service", "port", "subdomain", "domain", "ip")


# Values a plugin pulled out of a response: Nuclei's extracted-results can be an .env line or a token. The API only ever
# shows them masked; the raw value stays in the database for GET /findings/{id}/reveal (operators only).
SENSITIVE = ("extracted",)


def mask(value) -> str:
    s = str(value)
    return f"{s[:4]}••••" if len(s) > 8 else "••••"


def masked(data: dict) -> dict:
    return {k: [mask(x) for x in v] if k in SENSITIVE and isinstance(v, list) else v for k, v in data.items()}


def masked_event(payload: dict | None) -> dict | None:
    if not payload or not isinstance(payload.get("data"), dict):
        return payload
    return {**payload, "data": masked(payload["data"])}


def fingerprint(plugin_id: str, template_id: str, matched_at: str) -> str:
    return hashlib.sha256(f"{plugin_id}|{template_id}|{matched_at}".encode()).hexdigest()


def _events(db: Session, run: PluginRun, type: str):
    return db.execute(
        select(PluginEvent.seq, PluginEvent.payload)
        .where(PluginEvent.run_id == run.id, PluginEvent.type == type, PluginEvent.valid.is_(True))
        .order_by(PluginEvent.seq)
    ).all()


def _canonical(value: str) -> str:
    return canonical_url(value) if "://" in value else value


CHUNK = 1000  # rows per INSERT; well under Postgres' 65535 bind parameters


def _chunks(rows: list) -> list[list]:
    return [rows[i : i + CHUNK] for i in range(0, len(rows), CHUNK)]


def index(db: Session, run: PluginRun) -> None:
    now = func.now()  # one value for the whole transaction
    # One row per key and batch: a statement may not touch the same row twice, and the last report wins.
    # Rows go in key order so concurrent batches of a scan lock shared rows in the same order (no deadlocks).
    assets: dict[tuple[str, str], dict] = {}
    for _, payload in _events(db, run, "asset"):
        data = payload.get("data") or {}
        kind, value = str(data.get("kind", ""))[:32], _canonical(str(data.get("value", "")))
        if kind and value and len(value) <= 2000:
            assets[(kind, value)] = {k: v for k, v in data.items() if k not in ("kind", "value")}
    for rows in _chunks(sorted(assets.items())):
        stmt = insert(Asset).values(
            [
                {"kind": k, "value": v, "data": d, "first_seen": now, "last_seen": now, "last_scan_id": run.scan_id}
                for (k, v), d in rows
            ]
        )
        db.execute(
            stmt.on_conflict_do_update(
                constraint="assets_kind_value_key",
                set_={"data": stmt.excluded.data, "last_seen": now, "last_scan_id": run.scan_id},
            )
        )

    plugin_id = db.scalar(select(PluginVersion.plugin_id).where(PluginVersion.id == run.plugin_version_id))
    found: dict[str, tuple[int, dict, str, str, str]] = {}  # fingerprint -> (seq, data, template, matched_at, target)
    for seq, payload in _events(db, run, "finding"):
        data = payload.get("data") or {}
        if data.get("severity") not in SEVERITIES:
            continue
        target_value = _canonical(str((payload.get("target") or {}).get("value", "")))
        template_id = str(data.get("template_id") or data["title"])
        matched_at = _canonical(str(data.get("matched_at") or target_value))
        found[fingerprint(plugin_id, template_id, matched_at)] = (seq, data, template_id, matched_at, target_value)
    if not found:
        return
    wanted = {v for f in found.values() for v in (f[3], f[4]) if len(v) <= 2000}
    known: dict[str, object] = {}
    for values in _chunks(sorted(wanted)):
        for value, asset_id in db.execute(
            select(Asset.value, Asset.id).where(Asset.kind.in_(LINKABLE), Asset.value.in_(values))
        ):
            known.setdefault(value, asset_id)
    reopen = Finding.status == "fixed"  # inside ON CONFLICT, Finding.* is the existing row
    ids: dict[str, object] = {}
    for rows in _chunks(sorted(found.items())):
        stmt = insert(Finding).values(
            [
                {
                    "fingerprint": fp,
                    "plugin_id": plugin_id,
                    "template_id": template_id[:200],
                    "title": str(data["title"])[:300],
                    "severity": data["severity"],
                    "matched_at": matched_at[:2000],
                    "asset_id": known.get(matched_at) or known.get(target_value),
                    "data": {**data, "matched_at": matched_at},
                    "status": "open",
                    "first_seen": now,
                    "last_seen": now,
                }
                for fp, (_, data, template_id, matched_at, target_value) in rows
            ]
        )
        result = db.execute(
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
            ).returning(Finding.fingerprint, Finding.id)
        )
        ids.update(result.all())
    for rows in _chunks(sorted(found.items())):
        occ = insert(FindingOccurrence).values(
            [
                {"finding_id": ids[fp], "scan_id": run.scan_id, "run_id": run.id, "event_seq": f[0], "seen_at": now}
                for fp, f in rows
            ]
        )
        db.execute(
            occ.on_conflict_do_update(
                index_elements=["finding_id", "scan_id"],
                set_={"run_id": occ.excluded.run_id, "event_seq": occ.excluded.event_seq, "seen_at": now},
            )
        )
