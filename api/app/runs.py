"""Running one plugin against one target: gate, hand-off to the runner, event intake."""

import json
import uuid
from datetime import UTC, datetime
from time import monotonic

from sqlalchemy import update

from app.config import settings
from app.contract import validate_event
from app.db import SessionLocal
from app.models import PluginEvent, PluginRun, PluginVersion
from app.runner import RunnerClient, RunnerError

FINAL = ("SUCCEEDED", "FAILED", "TIMED_OUT")


def _now():
    return datetime.now(UTC)


class _TooMuchOutput(Exception):
    pass


def _parse(line: str) -> dict | None:
    try:
        doc = json.loads(line)
    except (ValueError, RecursionError):
        return None
    return doc if isinstance(doc, dict) else None


def _scrub(value):
    """Postgres JSONB refuses NUL characters; drop them rather than lose the event."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    if isinstance(value, dict):
        return {_scrub(k): _scrub(v) for k, v in value.items()}
    return value


def execute_run(run_id: uuid.UUID, runner: RunnerClient) -> None:
    with SessionLocal() as db:
        run = db.get(PluginRun, run_id)
        version = db.get(PluginVersion, run.plugin_version_id)
        m = version.manifest
        run.status, run.started_at = "RUNNING", _now()
        db.commit()
        body = {
            "image": version.image,
            "digest": version.digest,
            "resources": m["resources"],
            "permissions": m["permissions"],
            "input": {
                "run_id": str(run.id),
                "plugin_id": version.plugin_id,
                "plugin_version": version.version,
                "targets": run.targets,
                "target": run.targets[0],  # single-target adapters read this one
                "config": {},
                "rate_limit": m["limits"]["default_rate_limit"],
            },
        }
        expected = (str(run.id), version.plugin_id, version.version)
        seq, last_commit, pending = (
            0,
            monotonic(),
            None,
        )  # pending: a {"runner": ...} line, trusted only if it is the last

        def store(line: str, doc: dict | None, valid: bool) -> None:
            nonlocal seq, last_commit
            if seq >= settings.max_events_per_run:
                raise _TooMuchOutput
            seq += 1
            payload = _scrub(doc) if doc is not None else {"raw": line[:4000].replace("\x00", "")}
            db.add(
                PluginEvent(
                    run_id=run.id, seq=seq, type=str(payload.get("type", "invalid"))[:16], payload=payload, valid=valid
                )
            )
            # Batch commits: one per line made a 44k-line Subfinder run outlast its own timeout.
            if seq % 500 == 0 or monotonic() - last_commit > 1:
                run.event_count = seq
                db.commit()
                last_commit = monotonic()

        lines = runner.run(body)
        try:
            for line in lines:
                if not line.strip():
                    continue
                doc = _parse(line)
                if pending is not None:
                    store(*pending, valid=False)  # a result line followed by more output was not the runner's
                    pending = None
                if doc is not None and set(doc) == {"runner"}:
                    pending = (line, doc)
                    continue
                ok = doc is not None and not validate_event(doc)
                ok = ok and (doc.get("plugin_run_id"), doc.get("plugin_id"), doc.get("plugin_version")) == expected
                store(line, doc, ok)
            trailer = pending[1]["runner"] if pending and isinstance(pending[1]["runner"], dict) else None
        except RunnerError as e:
            run.status, run.error = "FAILED", str(e)
        except _TooMuchOutput:
            run.status, run.error = "FAILED", f"Too much output: stopped after {seq} events."
        except Exception:  # noqa: BLE001  never leave a run RUNNING because one line could not be stored
            db.rollback()
            run = db.get(PluginRun, run_id)
            run.status, run.error = "FAILED", "Could not store the plugin's output."
        else:
            if trailer is None:
                run.status, run.error = "FAILED", "Runner ended without a result."
            else:
                run.exit_code = trailer.get("exit_code")
                if trailer.get("timed_out"):
                    run.status, run.error = "TIMED_OUT", "Stopped at the plugin's time limit."
                elif run.exit_code == 0:
                    run.status = "SUCCEEDED"
                else:
                    run.status, run.error = (
                        "FAILED",
                        (trailer.get("stderr_tail") or f"Exit code {run.exit_code}.")[-4000:],
                    )
        finally:
            close = getattr(lines, "close", None)
            if close:
                close()
        run.event_count = db.query(PluginEvent).filter(PluginEvent.run_id == run.id).count()
        run.finished_at = _now()
        db.commit()


def fail_interrupted_runs(db) -> int:
    result = db.execute(
        update(PluginRun)
        .where(PluginRun.status.in_(("PENDING", "RUNNING")))
        .values(status="FAILED", error="Interrupted by restart.", finished_at=_now())
    )
    db.commit()
    return result.rowcount
