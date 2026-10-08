"""How a plugin container is allowed to run. One pure function so every flag is visible and tested."""

import json

NETWORK = "nyx-plugins"


def container_config(resources: dict, input: dict, extra_env: dict | None = None) -> dict:
    return {
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
        "environment": {"NYX_INPUT": json.dumps(input), **(extra_env or {})},
        "labels": {"nyx.run_id": str(input.get("run_id", ""))},
    }
