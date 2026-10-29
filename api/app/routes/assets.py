import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select

from app.findings import OPEN
from app.models import Asset, Finding, Scan, ScanTarget, User
from app.routes.findings import RANK, occurrences_count, row
from app.routes.scans import ScanOut
from app.security import DB, current_user

router = APIRouter(prefix="/api/v1/assets", tags=["assets"])
Anyone = Annotated[User, Depends(current_user)]
PAGE = 200


def _out(a: Asset, open_findings: int) -> dict:
    fields = ("id", "kind", "value", "data", "first_seen", "last_seen")
    return {**{k: getattr(a, k) for k in fields}, "open_findings": open_findings}


@router.get("")
def list_assets(
    db: DB,
    _: Anyone,
    kind: str | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    after: Annotated[int, Query(ge=0)] = 0,
):
    where = [Asset.kind == kind] if kind else []
    if q:
        where.append(Asset.value.icontains(q, autoescape=True))
    open_count = (
        select(func.count())
        .where(Finding.asset_id == Asset.id, Finding.status.in_(OPEN))
        .correlate(Asset)
        .scalar_subquery()
    )
    rows = db.execute(
        select(Asset, open_count).where(*where).order_by(Asset.last_seen.desc(), Asset.id).offset(after).limit(PAGE)
    ).all()
    total = db.scalar(select(func.count()).select_from(Asset).where(*where))
    return {"items": [_out(a, n) for a, n in rows], "total": total}


@router.get("/{asset_id}")
def get_asset(asset_id: uuid.UUID, db: DB, _: Anyone):
    a = db.get(Asset, asset_id)
    if a is None:
        raise HTTPException(404, "No such asset.")
    findings = db.execute(
        select(Finding, occurrences_count())
        .where(Finding.asset_id == a.id)
        .order_by(RANK, Finding.last_seen.desc(), Finding.id)
    ).all()
    seen_in = select(ScanTarget.scan_id).where(ScanTarget.value == a.value)
    scans = db.scalars(
        select(Scan)
        .where(or_(Scan.id == a.last_scan_id, Scan.id.in_(seen_in)))
        .order_by(Scan.created_at.desc())
        .limit(20)
    )
    return {
        **_out(a, sum(f.status in OPEN for f, _ in findings)),
        "findings": [row(f, a, n) for f, n in findings],
        "scans": [ScanOut.model_validate(s) for s in scans],
    }
