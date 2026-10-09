"""The API's handle on the scan engine. Routes are sync (they run in a thread), the client is async: the helpers
hop onto the event loop with anyio."""

import asyncio
import functools
import logging

from anyio import from_thread
from fastapi import HTTPException, Request
from temporalio.client import Client

from app.config import settings
from app.worker import TASK_QUEUE

log = logging.getLogger("nyx.temporal")
UNAVAILABLE = "Scan engine unavailable."


async def connect() -> Client | None:
    try:
        return await asyncio.wait_for(Client.connect(settings.temporal_address), 5)
    except Exception as e:  # noqa: BLE001  the API still serves everything else
        log.warning("scan engine unreachable at %s: %s", settings.temporal_address, e)
        return None


def get_temporal(request: Request) -> Client:
    client = getattr(request.app.state, "temporal", None)
    if client is None:
        raise HTTPException(503, UNAVAILABLE)
    return client


def workflow_id(scan_id) -> str:
    return f"scan-{scan_id}"


def start_scan(client, scan_id) -> None:
    from_thread.run(
        functools.partial(
            client.start_workflow, "ScanWorkflow", str(scan_id), id=workflow_id(scan_id), task_queue=TASK_QUEUE
        )
    )


def signal_scan(client, scan_id, name: str) -> None:
    from_thread.run(client.get_workflow_handle(workflow_id(scan_id)).signal, name)


def cancel_scan(client, scan_id) -> None:
    from_thread.run(client.get_workflow_handle(workflow_id(scan_id)).cancel)
