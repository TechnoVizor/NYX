import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.models import PluginEvent, PluginRun, PluginVersion, User
from app.security import DB, current_user

router = APIRouter(prefix="/api/v1/runs", tags=["runs"])
Anyone = Annotated[User, Depends(current_user)]


class RunOut(BaseModel):
    id: uuid.UUID
    scan_id: uuid.UUID | None
    plugin_id: str
    plugin_version: str
    target: dict
    targets: list[dict]
    status: str
    error: str | None
    exit_code: int | None
    event_count: int
    attempt: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class EventOut(BaseModel):
    seq: int
    type: str
    valid: bool
    payload: dict


def run_out(run: PluginRun, version: PluginVersion) -> dict:
    return {
        "id": run.id,
        "scan_id": run.scan_id,
        "plugin_id": version.plugin_id,
        "plugin_version": version.version,
        "target": run.targets[0],
        "targets": run.targets,
        "status": run.status,
        "error": run.error,
        "exit_code": run.exit_code,
        "event_count": run.event_count,
        "attempt": run.attempt,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
    }


@router.get("/{run_id}", response_model=RunOut)
def get_run(run_id: uuid.UUID, db: DB, _: Anyone):
    run = db.get(PluginRun, run_id)
    if run is None:
        raise HTTPException(404, "No such run.")
    return run_out(run, db.get(PluginVersion, run.plugin_version_id))


@router.get("/{run_id}/events", response_model=list[EventOut])
def run_events(run_id: uuid.UUID, db: DB, _: Anyone, after: Annotated[int, Query(ge=0)] = 0):
    q = select(PluginEvent).where(PluginEvent.run_id == run_id, PluginEvent.seq > after).order_by(PluginEvent.seq)
    return db.scalars(q.limit(500)).all()
