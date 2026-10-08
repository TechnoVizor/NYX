import json

from app.sandbox import NETWORK, container_config


def test_container_is_locked_down():
    cfg = container_config({"cpu": 0.5, "memory_mb": 256, "timeout_seconds": 60}, {"run_id": "r1"})
    assert cfg["read_only"] is True
    assert cfg["tmpfs"] == {"/tmp": "size=64m"}
    assert cfg["cap_drop"] == ["ALL"]
    assert cfg["security_opt"] == ["no-new-privileges"]
    assert cfg["user"] == "65534:65534"
    assert cfg["pids_limit"] == 256
    assert cfg["mem_limit"] == "256m"
    assert cfg["nano_cpus"] == 500_000_000
    assert cfg["network"] == NETWORK
    assert cfg["privileged"] is False
    assert "volumes" not in cfg and "mounts" not in cfg
    assert json.loads(cfg["environment"]["NYX_INPUT"]) == {"run_id": "r1"}
