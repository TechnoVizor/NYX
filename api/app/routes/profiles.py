import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.models import ScanProfile, User
from app.registry import installed_plugins
from app.routes.scans import check_config
from app.security import DB, current_user, require_role

router = APIRouter(prefix="/api/v1/profiles", tags=["profiles"])
Anyone = Annotated[User, Depends(current_user)]
Operator = Annotated[User, Depends(require_role("admin", "analyst"))]


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    plugin_ids: list[str] | None = Field(default=None, min_length=1, max_length=200)
    plugin_config: dict[str, dict] | None = None
    max_depth: int | None = Field(default=None, ge=1, le=3)


class ProfileIn(ProfilePatch):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)
    plugin_ids: list[str] = Field(min_length=1, max_length=200)
    plugin_config: dict[str, dict] = {}
    max_depth: int = Field(ge=1, le=3)


class ProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    builtin: bool
    plugin_ids: list[str]
    plugin_config: dict
    max_depth: int
    created_at: datetime
    updated_at: datetime
    available: bool
    unavailable: list[str]


def _rows(db) -> dict:
    return {p.id: (p, v, i) for p, v, i in db.execute(installed_plugins()).all()}


def _out(profile: ScanProfile, rows: dict) -> ProfileOut:
    missing = [pid for pid in profile.plugin_ids if not (pid in rows and rows[pid][2].enabled and rows[pid][1].digest)]
    fields = {k: getattr(profile, k) for k in ProfileOut.model_fields if k not in ("available", "unavailable")}
    return ProfileOut(**fields, available=not missing, unavailable=missing)


def _save(db, profile: ScanProfile, changes: dict) -> ProfileOut:
    """Apply validated changes; the profile's own config follows its plugin list."""
    rows = _rows(db)
    name = changes.get("name", profile.name)
    ids = list(dict.fromkeys(changes.get("plugin_ids", profile.plugin_ids or [])))
    config = changes.get("plugin_config", {k: v for k, v in (profile.plugin_config or {}).items() if k in ids})
    clash = db.scalar(select(ScanProfile.id).where(ScanProfile.name == name))
    if clash is not None and clash != profile.id:
        raise HTTPException(409, f"A profile named {name} already exists.")
    if unknown := next((pid for pid in ids if pid not in rows), None):
        raise HTTPException(422, f"Unknown plugin {unknown}.")
    check_config(rows, ids, config)
    profile.name, profile.plugin_ids, profile.plugin_config = name, ids, config
    profile.description = changes.get("description", profile.description or "")
    profile.max_depth = changes.get("max_depth", profile.max_depth)
    db.add(profile)
    db.commit()
    return _out(profile, rows)


def _editable(db, profile_id: uuid.UUID) -> ScanProfile:
    profile = db.get(ScanProfile, profile_id)
    if profile is None:
        raise HTTPException(404, "No such profile.")
    if profile.builtin:
        raise HTTPException(409, "Built-in profiles are read-only.")
    return profile


@router.get("", response_model=list[ProfileOut])
def list_profiles(db: DB, _: Anyone):
    rows = _rows(db)
    return [
        _out(p, rows) for p in db.scalars(select(ScanProfile).order_by(ScanProfile.builtin.desc(), ScanProfile.name))
    ]


@router.post("", status_code=201, response_model=ProfileOut)
def create(body: ProfileIn, db: DB, user: Operator):
    return _save(db, ScanProfile(created_by=user.id), body.model_dump())


@router.patch("/{profile_id}", response_model=ProfileOut)
def edit(profile_id: uuid.UUID, body: ProfilePatch, db: DB, _: Operator):
    return _save(db, _editable(db, profile_id), body.model_dump(exclude_unset=True))


@router.delete("/{profile_id}", status_code=204)
def delete(profile_id: uuid.UUID, db: DB, _: Operator):
    db.delete(_editable(db, profile_id))
    db.commit()
    return Response(status_code=204)
