"""How a plugin container is allowed to run. One pure function so every flag is visible and tested."""

import json
from urllib.parse import urlsplit

from docker.types import LogConfig

NETWORK = "nyx-plugins"
EGRESS_IMAGE = "nyx-egress:1"


def container_config(
    resources: dict,
    input: dict,
    extra_env: dict | None = None,
    permissions: dict | None = None,
    network_mode: str | None = None,
) -> dict:
    cfg = {
        "detach": True,
        "read_only": True,
        "tmpfs": {"/tmp": "size=64m"},
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges"],
        "user": "65534:65534",
        "privileged": False,
        "pids_limit": 256,
        "mem_limit": f"{int(resources['memory_mb'])}m",
        "nano_cpus": int(float(resources["cpu"]) * 1_000_000_000),
        "network": NETWORK,
        # Docker keeps a copy of stdout/stderr on disk; cap it so a chatty plugin cannot fill the host.
        "log_config": LogConfig(type="json-file", config={"max-size": "50m", "max-file": "1"}),
        "environment": {"NYX_INPUT": json.dumps(input), **(extra_env or {})},
        "labels": {"nyx.run_id": str(input.get("run_id", ""))},
    }
    if (permissions or {}).get("network") == "none":
        del cfg["network"]
        cfg["network_mode"] = "none"
    if network_mode is not None:  # the plugin lives in its firewall's network namespace
        del cfg["network"]
        cfg["network_mode"] = network_mode
    return cfg


def egress_allow(targets: list[dict]) -> list[str]:
    """What the firewall lets the plugin reach: hosts for URLs, values as they are for the rest."""
    out: list[str] = []
    for t in targets:
        value = urlsplit(t["value"]).hostname if t.get("type") == "url" else t.get("value")
        if value and value not in out:
            out.append(value)
    return out


def egress_config(mode: str, allow: list[str], run_id: str) -> dict:
    """The firewall container. Root inside (iptables needs it) with NET_ADMIN as its only capability."""
    return {
        "detach": True,
        "read_only": True,
        "tmpfs": {"/run": "size=1m"},  # iptables' lock file
        "cap_drop": ["ALL"],
        "cap_add": ["NET_ADMIN"],
        "security_opt": ["no-new-privileges"],
        "mem_limit": "32m",
        "pids_limit": 32,
        "network": NETWORK,
        "log_config": LogConfig(type="json-file", config={"max-size": "1m", "max-file": "1"}),
        "environment": {"NYX_EGRESS_MODE": mode, "NYX_EGRESS_ALLOW": " ".join(allow)},
        "labels": {"nyx.run_id": run_id, "nyx.role": "egress"},
    }
