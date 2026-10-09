"""nyx-runner: the only NYX component with the Docker socket. Starts one locked-down container per plugin run."""

import json
import secrets
import threading
import time
from contextlib import asynccontextmanager
from typing import Annotated

import docker
from docker.errors import APIError, ImageNotFound, NotFound
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.sandbox import EGRESS_IMAGE, NETWORK, container_config, egress_allow, egress_config


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


READY_SECONDS = 15


def egress_mode(network: str) -> str:
    return "public" if network == "public" else "target_scope"


def start_firewall(d, network: str, input: dict):
    """Start the run's firewall and wait for its rules. Returns the container; raises HTTPException(500) otherwise."""
    targets = input.get("targets") or ([input["target"]] if input.get("target") else [])
    try:
        fw = d.containers.run(
            EGRESS_IMAGE, **egress_config(egress_mode(network), egress_allow(targets), str(input.get("run_id", "")))
        )
    except ImageNotFound:
        raise HTTPException(
            500, "Egress firewall image missing. Build it with: docker compose --profile plugins build"
        ) from None
    deadline = time.monotonic() + READY_SECONDS
    while time.monotonic() < deadline:
        if b"ready" in fw.logs(stdout=True, stderr=False):
            return fw
        fw.reload()
        if fw.status == "exited":
            break
        time.sleep(0.1)
    tail = fw.logs(stdout=False, stderr=True)[-1000:].decode("utf-8", "replace").strip()
    fw.remove(force=True)
    raise HTTPException(500, f"Egress firewall did not start: {tail or 'no output'}")


@app.post("/v1/runs", dependencies=[Auth])
def start(body: RunIn):
    network = body.permissions.get("network", "target_scope")
    if network not in ("none", "public", "target_scope"):
        raise HTTPException(422, f"Unknown network mode {network}.")
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Runner is busy. Try again in a moment.")
    fw = None
    try:
        d = engine()
        ensure_network(d)
        mode = None
        if network != "none":
            fw = start_firewall(d, network, body.input)
            mode = f"container:{fw.id}"
        cfg = container_config(body.resources, body.input, EXTRA_ENV, body.permissions, network_mode=mode)
        container = d.containers.run(body.digest, **cfg)
    except Exception as e:  # noqa: BLE001
        slots.release()
        if fw is not None:
            fw.remove(force=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(500, f"Could not start the plugin: {e}") from None
    return StreamingResponse(
        stream(container, int(body.resources["timeout_seconds"]), fw), media_type="application/x-ndjson"
    )


@app.delete("/v1/runs/{run_id}", status_code=204, dependencies=[Auth])
def cancel(run_id: str):
    """Kill the run's container. The streaming request for it then ends with its trailer, as on any exit."""
    containers = engine().containers.list(all=True, filters={"label": f"nyx.run_id={run_id}"})
    if not containers:
        raise HTTPException(404, "No such run.")
    for c in containers:
        try:
            c.kill()
        except (NotFound, APIError):
            pass  # already exited; stream() removes it


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


def stream(container, timeout: int, firewall=None):
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
        if firewall is not None:
            try:
                firewall.remove(force=True)
            except NotFound:
                pass
        slots.release()
