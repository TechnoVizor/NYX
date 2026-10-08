"""How a plugin container is allowed to run. One pure function so every flag is visible and tested."""

import json

from docker.types import LogConfig

NETWORK = "nyx-plugins"


def container_config(
    resources: dict, input: dict, extra_env: dict | None = None, permissions: dict | None = None
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
    return cfg
