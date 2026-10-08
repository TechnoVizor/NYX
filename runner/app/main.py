"""nyx-runner: the only NYX component with the Docker socket. Starts one locked-down container per plugin run."""

import json
import secrets
import threading
from contextlib import asynccontextmanager
from typing import Annotated

import docker
from docker.errors import APIError, ImageNotFound, NotFound
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.sandbox import NETWORK, container_config


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NYX_RUNNER_")
    token: str = ""
    max_runs: int = 4


settings = Settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        ensure_network(docker.from_env())
    except docker.errors.DockerException:
        pass  # no Docker yet; start() creates the network on the first run
    yield


app = FastAPI(title="NYX runner", version="0.1.0", lifespan=lifespan)
slots = threading.BoundedSemaphore(settings.max_runs)
EXTRA_ENV: dict = {}  # tests only


def authorized(authorization: Annotated[str, Header()] = "") -> None:
    if not settings.token or not secrets.compare_digest(authorization, f"Bearer {settings.token}"):
        raise HTTPException(401, "Bad runner token.")


Auth = Depends(authorized)


def engine() -> docker.DockerClient:
    return docker.from_env()


def ensure_network(d: docker.DockerClient) -> None:
    # Checked on every run (one cheap API call) so a deleted network heals itself and no startup hook is needed.
    if not d.networks.list(names=[NETWORK]):
        d.networks.create(NETWORK, driver="bridge")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/v1/images/{image:path}", dependencies=[Auth])
def image_digest(image: str):
    try:
        return {"digest": engine().images.get(image).id}
    except ImageNotFound:
        raise HTTPException(404, "Image not found.") from None


class RunIn(BaseModel):
    image: str
    digest: str
    resources: dict
    input: dict
    permissions: dict = {}


@app.post("/v1/runs", dependencies=[Auth])
def start(body: RunIn):
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Runner is busy. Try again in a moment.")
    try:
        d = engine()
        ensure_network(d)
        cfg = container_config(body.resources, body.input, EXTRA_ENV, body.permissions)
        container = d.containers.run(body.digest, **cfg)
    except Exception as e:  # noqa: BLE001
        slots.release()
        raise HTTPException(500, f"Could not start the plugin: {e}") from None
    return StreamingResponse(
        stream(container, int(body.resources["timeout_seconds"])), media_type="application/x-ndjson"
    )


MAX_LINE = 64 * 1024


def killer(container, timed_out: threading.Event):
    """Timer callback: only a kill that actually happened counts as a timeout (an exited container answers 409)."""

    def kill():
        try:
            container.kill()
        except (NotFound, APIError):
            return
        timed_out.set()

    return kill


def stream(container, timeout: int):
    timed_out = threading.Event()
    timer = threading.Timer(timeout, killer(container, timed_out))
    timer.start()
    try:
        buf, skipping = b"", False
        for chunk in container.logs(stream=True, follow=True, stdout=True, stderr=False):
            buf += chunk
            *lines, buf = buf.split(b"\n")
            for line in lines:
                if skipping:
                    skipping = False  # the tail of an over-long line we already cut
                    continue
                yield line[:MAX_LINE] + b"\n"
            if len(buf) > MAX_LINE:
                # A line with no end in sight: pass its head on, drop the rest up to the next newline.
                if not skipping:
                    yield buf[:MAX_LINE] + b"\n"
                buf, skipping = b"", True
        if buf and not skipping:
            yield buf[:MAX_LINE] + b"\n"
        code = container.wait().get("StatusCode")
        stderr = container.logs(stdout=False, stderr=True, tail=50)[-4096:].decode("utf-8", "replace")
        trailer = {"runner": {"exit_code": code, "timed_out": timed_out.is_set(), "stderr_tail": stderr}}
        yield (json.dumps(trailer) + "\n").encode()
    finally:
        timer.cancel()
        try:
            container.remove(force=True)
        except NotFound:
            pass
        slots.release()
