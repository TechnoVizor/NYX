from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter()


@router.get("/healthz")
def healthz(db: Annotated[Session, Depends(get_db)]):
    try:
        db.execute(text("select 1"))
    except SQLAlchemyError:
        raise HTTPException(503, "Database unreachable.") from None
    return {"status": "ok"}
