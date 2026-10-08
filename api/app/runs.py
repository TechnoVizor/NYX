"""Running one plugin against one target: gate, hand-off to the runner, event intake."""

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import update

from app.contract import validate_event
from app.db import SessionLocal
from app.models import PluginEvent, PluginRun, PluginVersion
from app.runner import RunnerClient, RunnerError

FINAL = ("SUCCEEDED", "FAILED", "TIMED_OUT")


def _now():
    return datetime.now(UTC)


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
            "input": {
                "run_id": str(run.id),
                "plugin_id": version.plugin_id,
                "plugin_version": version.version,
                "target": run.target,
                "config": {},
                "rate_limit": m["limits"]["default_rate_limit"],
            },
        }
        seq, trailer = 0, None
        try:
            for line in runner.run(body):
                if not line.strip():
                    continue
                try:
                    doc = json.loads(line)
                except json.JSONDecodeError:
                    doc = None
                if isinstance(doc, dict) and set(doc) == {"runner"}:
                    trailer = doc["runner"]
                    continue
                valid = isinstance(doc, dict) and not validate_event(doc) and doc.get("plugin_run_id") == str(run.id)
                seq += 1
                payload = doc if isinstance(doc, dict) else {"raw": line[:4000]}
                db.add(
                    PluginEvent(
                        run_id=run.id,
                        seq=seq,
                        type=str(payload.get("type", "invalid"))[:16],
                        payload=payload,
                        valid=valid,
                    )
                )
                run.event_count = seq
                db.commit()
        except RunnerError as e:
            run.status, run.error = "FAILED", str(e)
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
