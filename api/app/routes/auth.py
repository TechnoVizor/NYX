import re
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.models import User
from app.security import DB, Token, current_user, end_session, hash_password, start_session, verify_password

router = APIRouter(prefix="/api/v1", tags=["auth"])
_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def _email(value: str) -> str:
    # Same shape check as the login form. Not EmailStr: it rejects .local / .internal / .home.arpa,
    # which is exactly where self-hosted installs live.
    value = value.strip()
    if len(value) > 320 or not _EMAIL.fullmatch(value):
        raise ValueError("Enter a valid email address.")
    return value


Email = Annotated[str, AfterValidator(_email)]


class SignupIn(BaseModel):
    email: Email
    password: str = Field(min_length=10, max_length=256)


class LoginIn(BaseModel):
    email: Email
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    role: str
    created_at: datetime


@router.post("/auth/signup", status_code=201, response_model=UserOut)
def signup(body: SignupIn, response: Response, db: DB):
    # ponytail: two simultaneous first signups could both become admin; add an advisory lock if that ever matters.
    first = db.scalar(select(func.count()).select_from(User)) == 0
    if not first and not settings.allow_signup:
        raise HTTPException(403, "Sign-up is closed. Ask an admin for an account.")
    user = User(
        email=body.email.lower(), password_hash=hash_password(body.password), role="admin" if first else "analyst"
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists.") from None
    start_session(db, user, response)
    return user


@router.post("/auth/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: DB):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not verify_password(user.password_hash if user else None, body.password):
        raise HTTPException(401, "Wrong email or password.")
    start_session(db, user, response)
    return user


@router.post("/auth/logout", status_code=204)
def logout(response: Response, db: DB, token: Token = None) -> None:
    end_session(db, token, response)


@router.get("/me", response_model=UserOut)
def me(user: Annotated[User, Depends(current_user)]):
    return user
