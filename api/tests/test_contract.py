import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.contract import load_manifest, validate_event, validate_manifest

ROOT = Path(__file__).resolve().parents[2] / "plugins"


def good_manifest() -> dict:
    return load_manifest(ROOT / "_template" / "plugin.yaml")


def good_event(**over) -> dict:
    e = {
        "event_version": "1",
        "type": "asset",
        "plugin_run_id": "00000000-0000-0000-0000-000000000001",
        "plugin_id": "example.template",
        "plugin_version": "0.1.0",
        "timestamp": "2026-10-08T12:00:00Z",
        "target": {"type": "domain", "value": "example.com"},
        "data": {"kind": "subdomain", "value": "a.example.com"},
    }
    e.update(over)
    return e


def test_template_manifest_is_valid():
    assert validate_manifest(good_manifest()) == []


@pytest.mark.parametrize(
    "path,value",
    [
        (("permissions", "docker_socket"), True),
        (("permissions", "host_mounts"), True),
        (("classification", "risk_level"), "nuclear"),
        (("io", "accepts"), ["email"]),
        (("api_version",), "platform.security/v2"),
        (("runtime", "image"), "nyx-plugin/template:latest"),
        (("metadata", "id"), "a." + "b" * 200),
        (("metadata", "version"), "1.2." + "3" * 60),
        (("runtime", "image"), "nyx-plugin/" + "t" * 200 + ":1"),
    ],
)
def test_manifest_rejects_unsafe_or_unknown_values(path, value):
    m = good_manifest()
    node = m
    for k in path[:-1]:
        node = node[k]
    node[path[-1]] = value
    assert validate_manifest(m) != []


def test_event_valid():
    assert validate_event(good_event()) == []


@pytest.mark.parametrize(
    "over",
    [
        {"type": "teleport"},
        {"event_version": "2"},
        {"confidence": 1.5},
        {"timestamp": "yesterday"},
        {"data": {"value": "missing kind"}},
        {"type": "relation", "data": {"from": "a"}},
        {"type": "log", "data": {"level": "info"}},
    ],
)
def test_event_invalid(over):
    assert validate_event(good_event(**over)) != []


def test_sdk_emits_valid_events(tmp_path):
    fixture = tmp_path / "out.jsonl"
    fixture.write_text('{"host": "a.example.com"}\nnot json\n')
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "sdk"),
        "NYX_FIXTURE": str(fixture),
        "NYX_INPUT": json.dumps(
            {
                "run_id": "00000000-0000-0000-0000-000000000001",
                "plugin_id": "example.template",
                "plugin_version": "0.1.0",
                "target": {"type": "domain", "value": "example.com"},
                "config": {},
                "rate_limit": 10,
            }
        ),
    }
    out = subprocess.run(
        [sys.executable, str(ROOT / "_template" / "adapter.py")], env=env, capture_output=True, text=True, check=True
    )
    lines = [json.loads(line) for line in out.stdout.splitlines()]
    assert [e["type"] for e in lines] == ["progress", "asset", "log", "progress"]
    assert all(validate_event(e) == [] for e in lines)


def test_sdk_streams_events_while_the_tool_runs(tmp_path):
    import time

    tool = tmp_path / "slowtool.py"
    tool.write_text('import json, sys, time\nprint(json.dumps({"host": "a.example.com"}), flush=True)\ntime.sleep(4)\n')
    adapter = tmp_path / "adapter.py"
    adapter.write_text(
        "import sys\nfrom nyx_plugin import emit, run_tool\n"
        f"for r in run_tool([sys.executable, {str(tool)!r}]):\n"
        "    emit('asset', {'kind': 'subdomain', 'value': r['host']})\n"
    )
    env = {**os.environ, "PYTHONPATH": str(ROOT / "sdk"), "NYX_INPUT": "{}"}
    env.pop("NYX_FIXTURE", None)
    start = time.monotonic()
    proc = subprocess.Popen([sys.executable, str(adapter)], env=env, stdout=subprocess.PIPE, text=True)
    first = proc.stdout.readline()
    first_at = time.monotonic() - start
    proc.wait(timeout=30)
    assert '"asset"' in first
    assert first_at < 3, f"first event after {first_at:.1f}s: the SDK waits for the tool to finish"
