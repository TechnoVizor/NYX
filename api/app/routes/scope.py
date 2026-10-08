import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import ScopeTarget, User
from app.scope import normalize_entry
from app.security import DB, current_user, require_role

router = APIRouter(prefix="/api/v1/scope", tags=["scope"])
Admin = Annotated[User, Depends(require_role("admin"))]
Anyone = Annotated[User, Depends(current_user)]


class ScopeIn(BaseModel):
    kind: Literal["domain", "cidr"]
    value: str = Field(max_length=253)
    active_allowed: bool = False
    authorization: str = Field(max_length=2000)

    @field_validator("authorization")
    @classmethod
    def _note(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Say who allowed this target and on what basis.")
        return v.strip()


class ScopeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: str
    value: str
    active_allowed: bool
    authorization: str
    created_at: datetime


@router.get("", response_model=list[ScopeOut])
def list_scope(db: DB, _: Anyone):
    return db.scalars(select(ScopeTarget).order_by(ScopeTarget.kind, ScopeTarget.value)).all()


@router.post("", status_code=201, response_model=ScopeOut)
def add_scope(body: ScopeIn, db: DB, user: Admin):
    try:
        value = normalize_entry(body.kind, body.value)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    entry = ScopeTarget(
        kind=body.kind,
        value=value,
        active_allowed=body.active_allowed,
        authorization=body.authorization,
        created_by=user.id,
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"{value} is already in scope.") from None
    return entry


@router.delete("/{entry_id}", status_code=204)
def remove_scope(entry_id: uuid.UUID, db: DB, _: Admin) -> None:
    entry = db.get(ScopeTarget, entry_id)
    if entry is None:
        raise HTTPException(404, "No such scope entry.")
    db.delete(entry)
    db.commit()
