import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import SessionLocal
from app.registry import sync_plugins
from app.routes import auth, health, plugins, runs, scope
from app.runner import get_runner
from app.runs import fail_interrupted_runs


@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as db:
        if n := fail_interrupted_runs(db):
            logging.getLogger("nyx").warning("marked %d interrupted runs as failed", n)
        sync_plugins(db, get_runner())
    yield


app = FastAPI(title="NYX API", version="0.2.0", lifespan=lifespan)
for r in (health, auth, scope, plugins, runs):
    app.include_router(r.router)
