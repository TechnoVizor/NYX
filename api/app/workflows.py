"""ScanWorkflow: decides what runs when. Deterministic: it holds ids only, every side effect is an activity
(app/activities.py), referenced by name so this module imports nothing from the app."""

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, CancelledError, is_cancelled_exception
from temporalio.workflow import ActivityCancellationType

MAX_IN_FLIGHT = 4  # the runner's slots
BATCH_QUEUE_SUFFIX = "-batches"  # batches get their own queue and slots (app/worker.py)
# A cancel abandons a running short activity (it never heartbeats); app/scans.py makes sure an abandoned
# plan or set_status that finishes after finalize cannot reopen the scan or leave runs behind.
SHORT = {"start_to_close_timeout": timedelta(minutes=1)}
BATCH = {
    # The runner enforces each plugin's own time limit; this only bounds a batch that lost its runner.
    "start_to_close_timeout": timedelta(hours=2),
    "heartbeat_timeout": timedelta(seconds=30),
    "retry_policy": RetryPolicy(
        initial_interval=timedelta(seconds=2),
        backoff_coefficient=2.0,
        maximum_interval=timedelta(seconds=60),
        maximum_attempts=5,
    ),
    "cancellation_type": ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
}


@workflow.defn
class ScanWorkflow:
    def __init__(self) -> None:
        self.paused = False
        self.started: set[str] = set()
        self.tasks: dict[str, asyncio.Task] = {}

    @workflow.signal
    def pause(self) -> None:
        self.paused = True

    @workflow.signal
    def resume(self) -> None:
        self.paused = False

    @workflow.query
    def state(self) -> dict:
        return {"paused": self.paused, "in_flight": sorted(self.tasks), "started": len(self.started)}

    @workflow.run
    async def run(self, scan_id: str) -> str:
        try:
            await self._call("set_status", scan_id, "RUNNING")
            while True:
                for run_id in [r for r, t in self.tasks.items() if t.done()]:
                    self.tasks.pop(run_id).result()
                if self.paused:
                    await self._call("set_status", scan_id, "PAUSED")
                    await workflow.wait_condition(lambda: not self.paused)
                    await self._call("set_status", scan_id, "RUNNING")
                for run_id in await self._call("plan", scan_id):
                    if run_id not in self.started and len(self.tasks) < MAX_IN_FLIGHT:
                        self.started.add(run_id)
                        self.tasks[run_id] = asyncio.create_task(self._batch(run_id))
                if not self.tasks:
                    return await self._call("finalize", scan_id, False)
                await workflow.wait_condition(lambda: self.paused or any(t.done() for t in self.tasks.values()))
        except (asyncio.CancelledError, ActivityError) as e:
            # A cancel that lands while the workflow awaits an activity surfaces as ActivityError(CancelledError).
            if not is_cancelled_exception(e):
                raise
            for t in self.tasks.values():
                t.cancel()
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)
            await self._call("finalize", scan_id, True)
            raise

    async def _batch(self, run_id: str) -> None:
        try:
            await workflow.execute_activity(
                "run_batch", run_id, task_queue=workflow.info().task_queue + BATCH_QUEUE_SUFFIX, **BATCH
            )
        except ActivityError as e:
            if isinstance(e.cause, CancelledError):
                raise
            # Retries exhausted (runner down) or a non-retryable error: the run must not stay PENDING.
            await self._call("mark_failed", run_id, getattr(e.cause, "message", None) or str(e))

    async def _call(self, name: str, *args):
        return await workflow.execute_activity(name, args=list(args), **SHORT)
