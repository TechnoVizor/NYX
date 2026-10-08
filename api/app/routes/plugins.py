from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.models import Plugin, PluginInstallation, PluginRun, PluginVersion, ScopeTarget, User
from app.routes.runs import RunOut, run_out
from app.runner import RunnerClient, get_runner
from app.runs import execute_run
from app.scope import find_entry, refusal
from app.security import DB, current_user, require_role

router = APIRouter(prefix="/api/v1/plugins", tags=["plugins"])
Anyone = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_role("admin"))]
Operator = Annotated[User, Depends(require_role("admin", "analyst"))]


class PluginOut(BaseModel):
    id: str
    name: str
    publisher: str
    description: str
    categories: list[str]
    risk_level: str
    trust_level: str
    version: str
    image: str
    digest: str | None
    enabled: bool
    updated_at: datetime


class PluginDetailOut(PluginOut):
    manifest: dict
    runs: list[RunOut] = []


class PluginPatch(BaseModel):
    enabled: bool


def _row(p: Plugin, v: PluginVersion, i: PluginInstallation) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "publisher": p.publisher,
        "description": p.description,
        "categories": p.categories,
        "risk_level": p.risk_level,
        "trust_level": p.trust_level,
        "version": v.version,
        "image": v.image,
        "digest": v.digest,
        "enabled": i.enabled,
        "updated_at": p.updated_at,
    }


def _query():
    return (
        select(Plugin, PluginVersion, PluginInstallation)
        .join(PluginInstallation, PluginInstallation.plugin_id == Plugin.id)
        .join(PluginVersion, PluginVersion.id == PluginInstallation.plugin_version_id)
    )


def installed(db, plugin_id: str):
    row = db.execute(_query().where(Plugin.id == plugin_id)).first()
    if row is None:
        raise HTTPException(404, "No such plugin.")
    return row


@router.get("", response_model=list[PluginOut])
def list_plugins(db: DB, _: Anyone):
    return [_row(*r) for r in db.execute(_query().order_by(Plugin.name)).all()]


@router.get("/{plugin_id}", response_model=PluginDetailOut)
def get_plugin(plugin_id: str, db: DB, _: Anyone):
    p, v, i = installed(db, plugin_id)
    recent = db.scalars(
        select(PluginRun)
        .join(PluginVersion)
        .where(PluginVersion.plugin_id == plugin_id)
        .order_by(PluginRun.created_at.desc())
        .limit(10)
    ).all()
    runs = [run_out(r, db.get(PluginVersion, r.plugin_version_id)) for r in recent]
    return {**_row(p, v, i), "manifest": v.manifest, "runs": runs}


@router.patch("/{plugin_id}", response_model=PluginOut)
def patch_plugin(plugin_id: str, body: PluginPatch, db: DB, _: Admin):
    p, v, i = installed(db, plugin_id)
    i.enabled = body.enabled
    db.commit()
    return _row(p, v, i)


class Target(BaseModel):
    type: Literal["domain", "ip", "cidr", "url"]
    value: str = Field(min_length=1, max_length=2000)


class RunIn(BaseModel):
    target: Target


@router.post("/{plugin_id}/runs", status_code=202, response_model=RunOut)
def start_run(
    plugin_id: str,
    body: RunIn,
    db: DB,
    user: Operator,
    background: BackgroundTasks,
    runner: Annotated[RunnerClient, Depends(get_runner)],
):
    p, v, i = installed(db, plugin_id)
    if not i.enabled:
        raise HTTPException(409, f"{p.name} is disabled.")
    if not v.digest:
        raise HTTPException(409, f"{p.name}'s image is missing. Build it with: docker compose --profile plugins build")
    if body.target.type not in v.manifest["io"]["accepts"]:
        raise HTTPException(422, f"{p.name} does not accept {body.target.type} targets.")
    entry = find_entry(body.target.type, body.target.value, db.scalars(select(ScopeTarget)).all())
    if reason := refusal(p.risk_level, body.target.value, entry):
        raise HTTPException(403, reason)
    run = PluginRun(
        plugin_version_id=v.id, target=body.target.model_dump(), status="PENDING", requested_by=user.id, event_count=0
    )
    db.add(run)
    db.commit()
    background.add_task(execute_run, run.id, runner)
    return run_out(run, v)
