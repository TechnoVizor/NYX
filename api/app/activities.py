"""Temporal activities: every bit of I/O a scan does. Synchronous, run in the worker's thread pool."""

import contextvars
import threading
import uuid

from temporalio import activity
from temporalio.exceptions import CancelledError

from app import scans
from app.db import SessionLocal
from app.runner import get_runner
from app.runs import execute_run


@activity.defn(name="set_status")
def set_status(scan_id: str, status: str) -> None:
    with SessionLocal() as db:
        scans.set_status(db, uuid.UUID(scan_id), status)


@activity.defn(name="plan")
def plan(scan_id: str) -> list[str]:
    with SessionLocal() as db:
        return scans.plan(db, uuid.UUID(scan_id))


@activity.defn(name="finalize")
def finalize(scan_id: str, cancelled: bool) -> str:
    with SessionLocal() as db:
        return scans.finalize(db, uuid.UUID(scan_id), cancelled)


@activity.defn(name="mark_failed")
def mark_failed(run_id: str, message: str) -> None:
    with SessionLocal() as db:
        scans.mark_failed(db, uuid.UUID(run_id), message)


# no_thread_cancel_exception: the SDK would otherwise raise CancelledError into this thread at any point,
# including halfway through a database write. Cancellation is handled by the heartbeat thread instead.
@activity.defn(name="run_batch", no_thread_cancel_exception=True)
def run_batch(run_id: str) -> None:
    runner = get_runner()
    done = threading.Event()

    def beat():
        # Heartbeats keep flowing while the plugin is silent; a cancel request arrives through them.
        while not done.wait(1):
            activity.heartbeat()
            if activity.is_cancelled():
                runner.cancel(run_id)  # the container dies, the stream ends, execute_run finishes normally
                return

    threading.Thread(target=contextvars.copy_context().run, args=(beat,), daemon=True).start()
    try:
        execute_run(uuid.UUID(run_id), runner, cancelled=activity.is_cancelled)
    finally:
        done.set()
    if activity.is_cancelled():
        raise CancelledError("Cancelled.")


ALL = [set_status, plan, run_batch, finalize, mark_failed]
