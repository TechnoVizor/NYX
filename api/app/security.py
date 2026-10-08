import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Cookie, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import AuthSession, User

COOKIE = "nyx_session"
_hasher = PasswordHasher()
# Verified against when the email is unknown, so both login failures cost one argon2 check.
_DUMMY_HASH = _hasher.hash("nyx-dummy-password")

DB = Annotated[Session, Depends(get_db)]
Token = Annotated[str | None, Cookie(alias=COOKIE)]


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def _digest(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def start_session(db: Session, user: User, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    ttl = timedelta(hours=settings.session_ttl_hours)
    db.add(AuthSession(user_id=user.id, token_hash=_digest(token), expires_at=datetime.now(UTC) + ttl))
    db.commit()
    response.set_cookie(
        COOKIE,
        token,
        max_age=int(ttl.total_seconds()),
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def end_session(db: Session, token: str | None, response: Response) -> None:
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == _digest(token)))
        db.commit()
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="lax", secure=settings.cookie_secure)


def current_user(db: DB, token: Token = None) -> User:
    row = db.scalar(select(AuthSession).where(AuthSession.token_hash == _digest(token))) if token else None
    if row is not None and row.expires_at <= datetime.now(UTC):
        db.delete(row)
        db.commit()
        row = None
    if row is None:
        raise HTTPException(401, "Not signed in.")
    return db.get(User, row.user_id)


def require_role(*roles: str):
    def check(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Your role can't do this.")
        return user

    return check
