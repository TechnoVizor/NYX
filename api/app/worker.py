"""python -m app.worker — the only process that executes scans."""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from temporalio.client import Client
from temporalio.worker import Worker

from app.activities import BATCH, CONTROL
from app.config import settings
from app.workflows import BATCH_QUEUE_SUFFIX, ScanWorkflow

TASK_QUEUE = "nyx-scans"


BATCH_SLOTS = 4  # = the runner's slots: extra batches wait in Temporal instead of bouncing off the runner's 429


def build_workers(client: Client, task_queue: str, control: list, batch: list, executor=None) -> list[Worker]:
    """The workflow and its short activities on one queue, batches on their own with as many slots as the runner.

    Separate slots keep pause, cancel and other scans moving while every batch slot is busy.
    """
    return [
        Worker(
            client,
            task_queue=task_queue,
            workflows=[ScanWorkflow],
            activities=control,
            activity_executor=executor,
            max_concurrent_activities=8,
        ),
        Worker(
            client,
            task_queue=task_queue + BATCH_QUEUE_SUFFIX,
            activities=batch,
            activity_executor=executor,
            max_concurrent_activities=BATCH_SLOTS,
        ),
    ]


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    client = await Client.connect(settings.temporal_address)
    with ThreadPoolExecutor(max_workers=16) as pool:
        workers = build_workers(client, TASK_QUEUE, CONTROL, BATCH, pool)
        await asyncio.gather(*(w.run() for w in workers))


if __name__ == "__main__":
    asyncio.run(main())
