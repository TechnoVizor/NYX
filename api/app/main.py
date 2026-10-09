from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import SessionLocal
from app.registry import sync_plugins
from app.routes import auth, health, plugins, runs, scans, scope
from app.runner import get_runner
from app.temporal import connect


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        sync_plugins(db, get_runner())
    # Scans survive restarts in Temporal; nothing to clean up here any more.
    app.state.temporal = await connect()
    yield


app = FastAPI(title="NYX API", version="0.3.0", lifespan=lifespan)
for r in (health, auth, scope, plugins, runs, scans):
    app.include_router(r.router)
