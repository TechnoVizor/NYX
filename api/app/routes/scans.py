import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app import scans
from app.models import SCAN_FINAL, PluginRun, PluginVersion, Scan, ScanTarget, ScopeTarget, User
from app.registry import installed_plugins
from app.routes.common import Target
from app.routes.runs import RunOut, run_out
from app.scope import find_entry, normalized_target
from app.security import DB, current_user, require_role
from app.temporal import UNAVAILABLE, cancel_scan, get_temporal, signal_scan, start_scan

router = APIRouter(prefix="/api/v1/scans", tags=["scans"])
Anyone = Annotated[User, Depends(current_user)]
Operator = Annotated[User, Depends(require_role("admin", "analyst"))]
Engine = Annotated[object, Depends(get_temporal)]


class ScanIn(BaseModel):
    target: Target
    plugin_ids: list[str] | None = Field(default=None, max_length=200)
    max_depth: int = Field(default=2, ge=1, le=3)


class ScanOut(BaseModel):
    id: uuid.UUID
    root_target: dict
    plugin_ids: list[str]
    max_depth: int
    max_targets: int
    status: str
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class ScanDetailOut(ScanOut):
    targets_in_scope: int
    targets_out_of_scope: int
    runs: dict[str, int]
    events: int
    container_seconds: float


class ScanTargetOut(BaseModel):
    type: str
    value: str
    depth: int
    in_scope: bool
    refusal: str | None
    source_run_id: uuid.UUID | None

    model_config = {"from_attributes": True}


def _scan(db, scan_id: uuid.UUID) -> Scan:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(404, "No such scan.")
    return scan


def launch(db, scan: Scan, engine) -> None:
    """Commit, then start the workflow; if Temporal refuses, the scan is failed rather than left CREATED."""
    db.commit()
    try:
        start_scan(engine, scan.id)
    except Exception:  # noqa: BLE001
        scans.fail_start(db, scan.id)
        raise HTTPException(503, UNAVAILABLE) from None


@router.post("", status_code=202, response_model=ScanOut)
def create(body: ScanIn, db: DB, user: Operator, engine: Engine):
    try:
        root = normalized_target(body.target.type, body.target.value)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    if find_entry(root["type"], root["value"], db.scalars(select(ScopeTarget)).all()) is None:
        raise HTTPException(403, f"{root['value']} is not in scope.")
    rows = {p.id: (p, v, i) for p, v, i in db.execute(installed_plugins()).all()}
    if body.plugin_ids is None:
        ids = sorted(pid for pid, (p, v, i) in rows.items() if i.enabled and v.digest and p.risk_level != "intrusive")
    else:
        ids = list(dict.fromkeys(body.plugin_ids))
        for pid in ids:
            if pid not in rows:
                raise HTTPException(422, f"Unknown plugin {pid}.")
            p, v, i = rows[pid]
            if not i.enabled or not v.digest:
                raise HTTPException(422, f"{p.name} can't run: it is disabled or its image is missing.")
    if not ids:
        raise HTTPException(422, "Select at least one plugin.")
    scan = scans.create_scan(db, root, ids, body.max_depth, user.id)
    launch(db, scan, engine)
    return scan


@router.get("", response_model=list[ScanOut])
def list_scans(db: DB, _: Anyone):
    return db.scalars(select(Scan).order_by(Scan.created_at.desc()).limit(50)).all()


@router.get("/{scan_id}", response_model=ScanDetailOut)
def get_scan(scan_id: uuid.UUID, db: DB, _: Anyone):
    scan = _scan(db, scan_id)
    in_scope = dict(
        db.execute(
            select(ScanTarget.in_scope, func.count()).where(ScanTarget.scan_id == scan_id).group_by(ScanTarget.in_scope)
        ).all()
    )
    runs = dict(
        db.execute(
            select(PluginRun.status, func.count()).where(PluginRun.scan_id == scan_id).group_by(PluginRun.status)
        ).all()
    )
    events, seconds = db.execute(
        select(
            func.coalesce(func.sum(PluginRun.event_count), 0),
            func.coalesce(func.sum(func.extract("epoch", PluginRun.finished_at - PluginRun.started_at)), 0),
        ).where(PluginRun.scan_id == scan_id)
    ).one()
    return {
        **ScanOut.model_validate(scan).model_dump(),
        "targets_in_scope": in_scope.get(True, 0),
        "targets_out_of_scope": in_scope.get(False, 0),
        "runs": runs,
        "events": int(events),
        "container_seconds": float(seconds),
    }


@router.get("/{scan_id}/runs", response_model=list[RunOut])
def scan_runs(scan_id: uuid.UUID, db: DB, _: Anyone):
    _scan(db, scan_id)
    rows = db.execute(
        select(PluginRun, PluginVersion)
        .join(PluginVersion, PluginVersion.id == PluginRun.plugin_version_id)
        .where(PluginRun.scan_id == scan_id)
        .order_by(PluginRun.created_at, PluginRun.id)
    ).all()
    return [run_out(r, v) for r, v in rows]


@router.get("/{scan_id}/targets", response_model=list[ScanTargetOut])
def scan_targets(
    scan_id: uuid.UUID,
    db: DB,
    _: Anyone,
    in_scope: bool | None = None,
    after: Annotated[int, Query(ge=0)] = 0,
):
    _scan(db, scan_id)
    q = select(ScanTarget).where(ScanTarget.scan_id == scan_id)
    if in_scope is not None:
        q = q.where(ScanTarget.in_scope.is_(in_scope))
    q = q.order_by(ScanTarget.created_at, ScanTarget.type, ScanTarget.value).offset(after).limit(500)
    return db.scalars(q).all()


def _control(db, scan_id: uuid.UUID) -> Scan:
    scan = _scan(db, scan_id)
    if scan.status in SCAN_FINAL:
        raise HTTPException(409, "The scan has finished.")
    return scan


@router.post("/{scan_id}/pause", status_code=202, response_model=ScanOut)
def pause(scan_id: uuid.UUID, db: DB, _: Operator, engine: Engine):
    scan = _control(db, scan_id)
    signal_scan(engine, scan_id, "pause")
    return scan


@router.post("/{scan_id}/resume", status_code=202, response_model=ScanOut)
def resume(scan_id: uuid.UUID, db: DB, _: Operator, engine: Engine):
    scan = _control(db, scan_id)
    signal_scan(engine, scan_id, "resume")
    return scan


@router.post("/{scan_id}/cancel", status_code=202, response_model=ScanOut)
def cancel(scan_id: uuid.UUID, db: DB, _: Operator, engine: Engine):
    scan = _control(db, scan_id)
    cancel_scan(engine, scan_id)
    return scan
