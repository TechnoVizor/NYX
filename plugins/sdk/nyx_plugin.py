"""NYX plugin SDK. One file, stdlib only, copied into every plugin image.

The platform passes the run input as JSON in NYX_INPUT. A plugin writes one event per line to stdout
(see plugins/schemas/event.schema.json) and anything for humans to stderr. With NYX_FIXTURE set,
run_tool() replays a recorded tool output instead of running the tool, so adapters are testable offline.
"""

import json
import os
import subprocess
import sys
import tempfile
from collections.abc import Iterator
from datetime import UTC, datetime

INPUT: dict = json.loads(os.environ.get("NYX_INPUT", "{}"))


def emit(type: str, data: dict, target: dict | None = None, confidence: float | None = None) -> None:
    event = {
        "event_version": "1",
        "type": type,
        "plugin_run_id": INPUT.get("run_id", ""),
        "plugin_id": INPUT.get("plugin_id", ""),
        "plugin_version": INPUT.get("plugin_version", ""),
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "target": target or INPUT.get("target", {}),
        "data": data,
    }
    if confidence is not None:
        event["confidence"] = confidence
    print(json.dumps(event, separators=(",", ":")), flush=True)


def log(message: str, level: str = "info") -> None:
    emit("log", {"level": level, "message": message})


def progress(percent: int) -> None:
    emit("progress", {"percent": max(0, min(100, int(percent)))})


def run_tool(cmd: list[str], stdin: str | None = None) -> Iterator[dict]:
    """Yield each JSON line the tool prints. Non-JSON lines become warnings. A failing tool exits the plugin."""
    fixture = os.environ.get("NYX_FIXTURE")
    if fixture:
        with open(fixture, encoding="utf-8") as f:
            yield from _parse(f.read().splitlines())
        return
    # Stream stdout so events reach the platform while the tool is still working. stderr goes to a file in /tmp
    # (the only writable place in the sandbox) so a chatty tool cannot block on a full pipe.
    with tempfile.TemporaryFile("w+") as err:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=err,
            text=True,
        )
        if stdin is not None:
            proc.stdin.write(stdin)
            proc.stdin.close()
        yield from _parse(proc.stdout)
        code = proc.wait()
        if code != 0:
            err.seek(0)
            print(err.read()[-4000:], file=sys.stderr)
            raise SystemExit(code)


def _parse(lines) -> Iterator[dict]:
    for line in lines:
        if not line.strip():
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            log(f"Skipped a line the tool printed that is not JSON: {line.strip()[:200]}", "warning")
