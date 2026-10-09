import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

from app.contract import validate_event

ROOT = Path(__file__).resolve().parents[2] / "plugins"
CASES = {
    "projectdiscovery.subfinder": ({"type": "domain", "value": "example.com"}, {"asset", "relation"}),
    "projectdiscovery.dnsx": ({"type": "domain", "value": "example.com"}, {"asset", "relation"}),
    "projectdiscovery.httpx": ({"type": "domain", "value": "testbed.nyx-lab.test"}, {"asset"}),
}


@pytest.mark.parametrize("plugin", sorted(CASES))
def test_adapter_turns_fixture_into_valid_events(plugin):
    target, must_have = CASES[plugin]
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "sdk"),
        "NYX_FIXTURE": str(ROOT / plugin / "fixtures" / "output.jsonl"),
        "NYX_INPUT": json.dumps(
            {
                "run_id": "r1",
                "plugin_id": plugin,
                "plugin_version": "x",
                "target": target,
                "config": {},
                "rate_limit": 10,
            }
        ),
    }
    out = subprocess.run(
        [sys.executable, str(ROOT / plugin / "adapter.py")], env=env, capture_output=True, text=True, check=True
    )
    events = [json.loads(line) for line in out.stdout.splitlines()]
    assert all(validate_event(e) == [] for e in events)
    kinds = Counter(e["type"] for e in events)
    assert must_have <= set(kinds)
    assert kinds["progress"] == 2


def run_adapter(plugin, targets):
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "sdk"),
        "NYX_FIXTURE": str(ROOT / plugin / "fixtures" / "output.jsonl"),
        "NYX_INPUT": json.dumps(
            {
                "run_id": "r1",
                "plugin_id": plugin,
                "plugin_version": "x",
                "targets": targets,
                "target": targets[0],
                "config": {},
                "rate_limit": 10,
            }
        ),
    }
    out = subprocess.run(
        [sys.executable, str(ROOT / plugin / "adapter.py")], env=env, capture_output=True, text=True, check=True
    )
    return [json.loads(line) for line in out.stdout.splitlines()]


# The first target has no record in the fixture: events must name the host they are about, not targets[0].
@pytest.mark.parametrize(
    "plugin,targets,host",
    [
        (
            "projectdiscovery.dnsx",
            [{"type": "domain", "value": "other.example.com"}, {"type": "domain", "value": "example.com"}],
            "example.com",
        ),
        (
            "projectdiscovery.httpx",
            [{"type": "domain", "value": "x.nyx-lab.test"}, {"type": "domain", "value": "testbed.nyx-lab.test"}],
            "testbed.nyx-lab.test",
        ),
    ],
)
def test_list_adapters_name_the_host_per_event(plugin, targets, host):
    events = run_adapter(plugin, targets)
    assets = [e for e in events if e["type"] == "asset"]
    assert assets
    assert all(validate_event(e) == [] for e in events)
    assert {e["target"]["value"] for e in assets} == {host}


def test_subfinder_runs_every_domain_in_the_batch():
    events = run_adapter(
        "projectdiscovery.subfinder",
        [{"type": "domain", "value": "example.org"}, {"type": "domain", "value": "example.com"}],
    )
    relations = [e for e in events if e["type"] == "relation"]
    assert relations
    assert all(validate_event(e) == [] for e in events)
    # The fixture replays once per domain, so every domain in the batch shows up as an event target.
    assert {e["target"]["value"] for e in relations} == {"example.org", "example.com"}
