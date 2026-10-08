"""nyx-runner: the only NYX component with the Docker socket. Starts one locked-down container per plugin run."""

import json
import secrets
import threading
from typing import Annotated

import docker
from docker.errors import ImageNotFound, NotFound
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
app = FastAPI(title="NYX runner", version="0.1.0")
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


@app.post("/v1/runs", dependencies=[Auth])
def start(body: RunIn):
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Runner is busy. Try again in a moment.")
    try:
        d = engine()
        ensure_network(d)
        container = d.containers.run(body.digest, **container_config(body.resources, body.input, EXTRA_ENV))
    except Exception as e:  # noqa: BLE001
        slots.release()
        raise HTTPException(500, f"Could not start the plugin: {e}") from None
    return StreamingResponse(
        stream(container, int(body.resources["timeout_seconds"])), media_type="application/x-ndjson"
    )


def stream(container, timeout: int):
    timed_out = threading.Event()

    def kill():
        timed_out.set()
        try:
            container.kill()
        except NotFound:
            pass

    timer = threading.Timer(timeout, kill)
    timer.start()
    try:
        buf = b""
        for chunk in container.logs(stream=True, follow=True, stdout=True, stderr=False):
            buf += chunk
            *lines, buf = buf.split(b"\n")
            for line in lines:
                yield line + b"\n"
        if buf:
            yield buf + b"\n"
        code = container.wait().get("StatusCode")
        stderr = container.logs(stdout=False, stderr=True)[-4096:].decode("utf-8", "replace")
        yield (
            json.dumps({"runner": {"exit_code": code, "timed_out": timed_out.is_set(), "stderr_tail": stderr}}) + "\n"
        ).encode()
    finally:
        timer.cancel()
        try:
            container.remove(force=True)
        except NotFound:
            pass
        slots.release()
