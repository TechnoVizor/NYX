from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.findings import OPEN, SEVERITIES
from app.models import Asset, Finding, Scan, User
from app.routes.findings import RANK
from app.routes.scans import ScanOut
from app.security import DB, current_user

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])
Anyone = Annotated[User, Depends(current_user)]


@router.get("")
def dashboard(db: DB, _: Anyone):
    now = datetime.now(UTC)
    days = [now.date() - timedelta(days=29 - i) for i in range(30)]
    is_open = Finding.status.in_(OPEN)
    by_sev = dict(db.execute(select(Finding.severity, func.count()).where(is_open).group_by(Finding.severity)).all())
    day = func.date(func.timezone("UTC", Finding.first_seen))
    per_day = dict(db.execute(select(day, func.count()).where(day >= days[0]).group_by(day)).all())
    top = db.execute(
        select(Asset, func.count(Finding.id), func.min(RANK))
        .join(Finding, Finding.asset_id == Asset.id)
        .where(is_open)
        .group_by(Asset.id)
        .order_by(func.count(Finding.id).desc(), func.min(RANK), Asset.value)
        .limit(5)
    ).all()
    return {
        "open_by_severity": {s: by_sev.get(s, 0) for s in SEVERITIES},
        "open_total": sum(by_sev.values()),
        "assets_total": db.scalar(select(func.count()).select_from(Asset)),
        "assets_new_7d": db.scalar(select(func.count()).where(Asset.first_seen >= now - timedelta(days=7))),
        "findings_per_day": [{"date": d.isoformat(), "count": per_day.get(d, 0)} for d in days],
        "recent_scans": [
            ScanOut.model_validate(s) for s in db.scalars(select(Scan).order_by(Scan.created_at.desc()).limit(5))
        ],
        "top_assets": [
            {"id": a.id, "kind": a.kind, "value": a.value, "open_findings": n, "worst_severity": SEVERITIES[w]}
            for a, n, w in top
        ],
    }
