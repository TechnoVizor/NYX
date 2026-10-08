from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.models import Plugin, PluginInstallation, PluginVersion, User
from app.security import DB, current_user, require_role

router = APIRouter(prefix="/api/v1/plugins", tags=["plugins"])
Anyone = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_role("admin"))]


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
    runs: list[dict] = []


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
    return {**_row(p, v, i), "manifest": v.manifest, "runs": []}


@router.patch("/{plugin_id}", response_model=PluginOut)
def patch_plugin(plugin_id: str, body: PluginPatch, db: DB, _: Admin):
    p, v, i = installed(db, plugin_id)
    i.enabled = body.enabled
    db.commit()
    return _row(p, v, i)
