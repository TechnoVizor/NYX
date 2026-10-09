"""ScanWorkflow against Temporal's time-skipping test server, with scripted activities under the real names."""

import asyncio
import contextlib
import os
import uuid

import pytest
from temporalio import activity
from temporalio.client import Client, WorkflowFailureError
from temporalio.exceptions import ApplicationError
from temporalio.testing import WorkflowEnvironment

from app.worker import build_workers
from app.workflows import ScanWorkflow


class Engine:
    """A fake scan: plan() returns what is pending; finishing a run may add its children."""

    def __init__(self, roots, children=None, hold=(), fail=(), plan_delay=0.0):
        self.pending = list(roots)
        self.children = children or {}
        self.hold = {r: asyncio.Event() for r in hold}
        self.fail = set(fail)
        self.status, self.ran, self.failed = [], [], {}
        self.running, self.max_running, self.final = set(), 0, None
        self.plan_delay, self.planning, self.log = plan_delay, False, []

    def activities(self):
        @activity.defn(name="set_status")
        async def set_status(scan_id: str, status: str) -> None:
            self.status.append(status)

        @activity.defn(name="plan")
        async def plan(scan_id: str) -> list[str]:
            self.planning = True
            await asyncio.sleep(self.plan_delay)  # a slow plan is still a plan: it finishes even if cancelled
            self.planning = False
            self.log.append("plan")
            return list(self.pending)

        @activity.defn(name="run_batch")
        async def run_batch(run_id: str) -> None:
            self.ran.append(run_id)
            self.running.add(run_id)
            self.max_running = max(self.max_running, len(self.running))
            try:
                await asyncio.sleep(0.05)
                if run_id in self.hold:
                    while not self.hold[run_id].is_set():
                        activity.heartbeat()
                        await asyncio.sleep(0.05)
                if run_id in self.fail:
                    raise ApplicationError("Runner unreachable.", non_retryable=True)
            finally:
                self.running.discard(run_id)
            self.pending.remove(run_id)
            self.pending += self.children.get(run_id, [])

        @activity.defn(name="finalize")
        async def finalize(scan_id: str, cancelled: bool) -> str:
            self.log.append("finalize")
            self.final = cancelled
            return "CANCELLED" if cancelled else "COMPLETED"

        @activity.defn(name="mark_failed")
        async def mark_failed(run_id: str, message: str) -> None:
            self.failed[run_id] = message
            self.pending.remove(run_id)

        return [set_status, plan, run_batch, finalize, mark_failed]


async def until(cond, timeout=10.0):
    for _ in range(int(timeout / 0.05)):
        if cond():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("condition not reached")


async def environment() -> WorkflowEnvironment:
    # NYX_TEMPORAL_TEST_ADDRESS points at a running dev server (compose.dev.yml publishes one on 127.0.0.1:7233),
    # for machines that cannot download Temporal's test server; CI uses the time-skipping server.
    if addr := os.environ.get("NYX_TEMPORAL_TEST_ADDRESS"):
        return WorkflowEnvironment.from_client(await Client.connect(addr))
    return await WorkflowEnvironment.start_time_skipping()


def scenario(engine, body):
    queue = f"t-{uuid.uuid4()}"  # a shared dev server must not hand one test's tasks to another's worker

    async def main():
        async with await environment() as env:
            acts = engine.activities()
            control = [a for a in acts if a.__name__ != "run_batch"]
            batch = [a for a in acts if a.__name__ == "run_batch"]
            # The production worker layout, slot limits included.
            workers = build_workers(env.client, queue, control, batch)
            async with contextlib.AsyncExitStack() as stack:
                for w in workers:
                    await stack.enter_async_context(w)
                handle = await env.client.start_workflow(
                    ScanWorkflow.run, "scan-1", id=f"scan-{uuid.uuid4()}", task_queue=queue
                )
                return await body(handle)

    return asyncio.run(main())


def test_runs_children_until_nothing_is_pending():
    e = Engine(["a"], {"a": ["b", "c"], "b": ["d"]})
    assert scenario(e, lambda h: h.result()) == "COMPLETED"
    assert sorted(e.ran) == ["a", "b", "c", "d"]  # each once
    assert e.status[0] == "RUNNING" and e.final is False


def test_at_most_four_in_flight():
    ids = [f"r{i}" for i in range(10)]
    e = Engine(ids, hold=ids)

    async def body(h):
        await until(lambda: len(e.running) == 4)
        await asyncio.sleep(1)  # room for a fifth to start, if anything would let it
        assert len(e.running) == 4
        for ev in e.hold.values():
            ev.set()
        return await h.result()

    assert scenario(e, body) == "COMPLETED"
    assert e.max_running == 4 and len(e.ran) == 10


def test_pause_blocks_new_batches_until_resume():
    e = Engine(["a"], {"a": ["b"]}, hold=["a"])

    async def body(h):
        await until(lambda: "a" in e.running)
        await h.signal(ScanWorkflow.pause)
        await until(lambda: "PAUSED" in e.status)
        e.hold["a"].set()
        await asyncio.sleep(0.5)
        assert "b" not in e.ran
        await h.signal(ScanWorkflow.resume)
        return await h.result()

    assert scenario(e, body) == "COMPLETED"
    assert e.ran == ["a", "b"]


def test_cancel_finalizes_cancelled():
    e = Engine(["a", "b"], hold=["a", "b"])

    async def body(h):
        await until(lambda: e.running == {"a", "b"})
        await h.cancel()
        with pytest.raises(WorkflowFailureError):
            await h.result()

    scenario(e, body)
    assert e.final is True and not e.running


def test_cancel_while_paused():
    e = Engine(["a"], {"a": ["b"]})

    async def body(h):
        await h.signal(ScanWorkflow.pause)
        await until(lambda: "PAUSED" in e.status)
        await h.cancel()
        with pytest.raises(WorkflowFailureError):
            await h.result()

    scenario(e, body)
    assert e.final is True


def test_failed_batch_is_marked():
    e = Engine(["a"], fail=["a"])
    assert scenario(e, lambda h: h.result()) == "COMPLETED"  # the fake finalize; real one decides FAILED
    assert e.failed == {"a": "Runner unreachable."}


def test_cancel_during_a_slow_plan_still_finalizes_after_it():
    e = Engine(["a"], plan_delay=2.0)

    async def body(h):
        await until(lambda: e.planning)
        await h.cancel()
        with pytest.raises(WorkflowFailureError):
            await h.result()

    scenario(e, body)
    assert e.final is True


def test_pause_shows_and_cancel_finalizes_while_every_batch_slot_is_busy():
    ids = [f"r{i}" for i in range(4)]
    e = Engine(ids, hold=ids)

    async def body(h):
        await until(lambda: len(e.running) == 4)
        await h.signal(ScanWorkflow.pause)
        await until(lambda: "PAUSED" in e.status, timeout=5)
        await h.cancel()
        with pytest.raises(WorkflowFailureError):
            await h.result()

    scenario(e, body)
    assert e.final is True and not e.running
