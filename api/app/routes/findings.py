import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select

from app.findings import SENSITIVE, SEVERITIES, STATUSES, masked, masked_event
from app.models import Asset, Finding, FindingOccurrence, PluginEvent, Scan, User
from app.security import DB, current_user, require_role

router = APIRouter(prefix="/api/v1/findings", tags=["findings"])
Anyone = Annotated[User, Depends(current_user)]
Operator = Annotated[User, Depends(require_role("admin", "analyst"))]
PAGE = 200
RANK = case({s: i for i, s in enumerate(SEVERITIES)}, value=Finding.severity)


class ReviewIn(BaseModel):
    status: Literal["open", "confirmed", "false_positive", "accepted_risk", "fixed"]
    note: str | None = Field(default=None, max_length=2000)


def _many(raw: str | None, allowed: tuple[str, ...], what: str) -> list[str]:
    values = [v.strip() for v in (raw or "").split(",") if v.strip()]
    if bad := next((v for v in values if v not in allowed), None):
        raise HTTPException(422, f"Unknown {what}: {bad}.")
    return values


def occurrences_count():
    return select(func.count()).where(FindingOccurrence.finding_id == Finding.id).correlate(Finding).scalar_subquery()


def row(f: Finding, a: Asset | None, occurrences: int) -> dict:
    return {
        "id": f.id,
        "title": f.title,
        "severity": f.severity,
        "status": f.status,
        "plugin_id": f.plugin_id,
        "template_id": f.template_id,
        "matched_at": f.matched_at,
        "asset": {"id": a.id, "kind": a.kind, "value": a.value} if a else None,
        "first_seen": f.first_seen,
        "last_seen": f.last_seen,
        "occurrences": occurrences,
    }


def _detail(db, f: Finding) -> dict:
    a = db.get(Asset, f.asset_id) if f.asset_id else None
    occ = db.execute(
        select(FindingOccurrence, Scan.root_target)
        .join(Scan, Scan.id == FindingOccurrence.scan_id)
        .where(FindingOccurrence.finding_id == f.id)
        .order_by(FindingOccurrence.seen_at.desc())
    ).all()
    newest = occ[0][0] if occ else None
    raw = None
    if newest and newest.run_id:
        raw = db.scalar(
            select(PluginEvent.payload).where(PluginEvent.run_id == newest.run_id, PluginEvent.seq == newest.event_seq)
        )
    return {
        **row(f, a, len(occ)),
        "data": masked(f.data),
        "status_note": f.status_note,
        "status_by": f.status_by,
        "status_at": f.status_at,
        "occurrences_list": [
            {"scan_id": o.scan_id, "root_target": t, "run_id": o.run_id, "event_seq": o.event_seq, "seen_at": o.seen_at}
            for o, t in occ
        ],
        "raw": masked_event(raw),
    }


def _get(db, finding_id: uuid.UUID) -> Finding:
    f = db.get(Finding, finding_id)
    if f is None:
        raise HTTPException(404, "No such finding.")
    return f


@router.get("")
def list_findings(
    db: DB,
    _: Anyone,
    severity: str | None = None,
    status: str | None = None,
    plugin_id: str | None = None,
    scan_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    after: Annotated[int, Query(ge=0)] = 0,
):
    where = []
    if sev := _many(severity, SEVERITIES, "severity"):
        where.append(Finding.severity.in_(sev))
    if st := _many(status, STATUSES, "status"):
        where.append(Finding.status.in_(st))
    if plugin_id:
        where.append(Finding.plugin_id == plugin_id)
    if scan_id:
        where.append(Finding.id.in_(select(FindingOccurrence.finding_id).where(FindingOccurrence.scan_id == scan_id)))
    if q:
        where.append(
            or_(*(c.icontains(q, autoescape=True) for c in (Finding.title, Finding.template_id, Finding.matched_at)))
        )
    total = db.scalar(select(func.count()).select_from(Finding).where(*where))
    rows = db.execute(
        select(Finding, Asset, occurrences_count())
        .outerjoin(Asset, Asset.id == Finding.asset_id)
        .where(*where)
        .order_by(RANK, Finding.last_seen.desc(), Finding.id)
        .offset(after)
        .limit(PAGE)
    ).all()
    return {"items": [row(f, a, n) for f, a, n in rows], "total": total}


@router.get("/{finding_id}")
def get_finding(finding_id: uuid.UUID, db: DB, _: Anyone):
    return _detail(db, _get(db, finding_id))


@router.get("/{finding_id}/reveal")
def reveal(finding_id: uuid.UUID, db: DB, _: Operator):
    """The raw values behind the masked ones, for someone who has to act on them."""
    f = _get(db, finding_id)
    return {k: f.data[k] for k in SENSITIVE if k in f.data}


@router.patch("/{finding_id}")
def review(finding_id: uuid.UUID, body: ReviewIn, db: DB, user: Operator):
    f = _get(db, finding_id)
    f.status, f.status_note, f.status_by, f.status_at = body.status, body.note, user.id, datetime.now(UTC)
    db.commit()
    return _detail(db, f)
