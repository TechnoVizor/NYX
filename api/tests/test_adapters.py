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
    "projectdiscovery.nuclei": ({"type": "url", "value": "http://testbed.nyx-lab.test"}, {"finding"}),
    "projectdiscovery.naabu": ({"type": "domain", "value": "testbed.nyx-lab.test"}, {"asset"}),
    "projectdiscovery.tlsx": ({"type": "domain", "value": "testbed.nyx-lab.test"}, {"asset", "relation"}),
    "projectdiscovery.katana": ({"type": "url", "value": "http://testbed.nyx-lab.test"}, {"asset"}),
    "lc.gau": ({"type": "domain", "value": "example.com"}, {"asset"}),
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


def _nuclei():
    import importlib.util

    sys.path.insert(0, str(ROOT / "sdk"))
    spec = importlib.util.spec_from_file_location("nuclei_adapter", ROOT / "projectdiscovery.nuclei" / "adapter.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # main() only runs under __main__
    return mod


@pytest.mark.parametrize(
    "config",
    [{}, {"severity": ["critical"]}, {"exclude_tags": ["cve"]}, {"exclude_tags": ["dos"], "severity": ["info"]}],
)
def test_nuclei_hard_exclusions_survive_any_config(config):
    m = _nuclei()
    cmd = m.command(config, 10)
    tags = cmd[cmd.index("-etags") + 1].split(",")
    assert set(m.HARD_TAGS) <= set(tags)
    assert cmd[cmd.index("-exclude-type") + 1] == ",".join(m.HARD_TYPES)
    assert "-no-interactsh" in cmd and "-duc" in cmd
    assert cmd[cmd.index("-severity") + 1] == ",".join(config.get("severity", ["low", "medium", "high", "critical"]))


def test_nuclei_fixture_maps_fields():
    target = {"type": "url", "value": "http://testbed.nyx-lab.test"}
    nyx_input = {"run_id": "r1", "plugin_id": "projectdiscovery.nuclei", "plugin_version": "x"}
    nyx_input |= {"targets": [target], "target": target, "config": {}, "rate_limit": 10}
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "sdk"),
        "NYX_FIXTURE": str(ROOT / "projectdiscovery.nuclei" / "fixtures" / "output.jsonl"),
        "NYX_INPUT": json.dumps(nyx_input),
    }
    adapter = str(ROOT / "projectdiscovery.nuclei" / "adapter.py")
    out = subprocess.run([sys.executable, adapter], env=env, capture_output=True, text=True, check=True)
    found = [e for e in map(json.loads, out.stdout.splitlines()) if e["type"] == "finding"]
    git = next(e for e in found if e["data"]["template_id"] == "git-config")
    assert git["data"]["matched_at"] == "http://testbed.nyx-lab.test/.git/config"
    assert git["data"]["severity"] == "medium"
    assert git["target"] == target
    full = next(e for e in found if e["data"].get("cve"))
    assert full["data"]["cve"] == ["CVE-2021-41773"] and full["data"]["references"] and full["data"]["curl"]


def assets(events, kind):
    return [e["data"]["value"] for e in events if e["type"] == "asset" and e["data"]["kind"] == kind]


def test_naabu_reports_each_port_once():
    # The fixture has every port twice: naabu repeats them on its verification pass.
    events = run_adapter("projectdiscovery.naabu", [{"type": "domain", "value": "testbed.nyx-lab.test"}])
    assert assets(events, "port") == ["testbed.nyx-lab.test:80", "testbed.nyx-lab.test:443"]


def test_tlsx_certificate_and_its_names():
    events = run_adapter("projectdiscovery.tlsx", [{"type": "domain", "value": "testbed.nyx-lab.test"}])
    assert len(assets(events, "certificate")) == 1
    assert assets(events, "subdomain") == ["admin.nyx-lab.test"]  # the SAN that is not the host itself
    assert not [e for e in events if e["type"] == "finding"]  # Nuclei's ssl templates own certificate findings


def test_katana_endpoints_are_unique_and_on_the_host():
    events = run_adapter("projectdiscovery.katana", [{"type": "url", "value": "http://testbed.nyx-lab.test"}])
    urls = assets(events, "endpoint")
    assert len(urls) == len(set(urls)) >= 3
    assert all(u.startswith("http://testbed.nyx-lab.test") for u in urls)


def test_gau_dedupes_archived_urls():
    events = run_adapter("lc.gau", [{"type": "domain", "value": "example.com"}])
    urls = assets(events, "endpoint")
    assert urls and len(urls) == len(set(urls))
    assert {e["target"]["value"] for e in events if e["type"] == "asset"} == {"example.com"}
