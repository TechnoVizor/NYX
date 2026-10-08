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
