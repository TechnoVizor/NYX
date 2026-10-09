"""python -m app.worker — the only process that executes scans."""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from temporalio.client import Client
from temporalio.worker import Worker

from app.activities import ALL
from app.config import settings
from app.workflows import ScanWorkflow

TASK_QUEUE = "nyx-scans"


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    client = await Client.connect(settings.temporal_address)
    with ThreadPoolExecutor(max_workers=8) as pool:
        worker = Worker(
            client,
            task_queue=TASK_QUEUE,
            workflows=[ScanWorkflow],
            activities=ALL,
            activity_executor=pool,
            # = the runner's slots: extra batches wait in Temporal instead of bouncing off the runner's 429.
            max_concurrent_activities=4,
        )
        await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
