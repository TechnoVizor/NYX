import json

import pytest

from app.sandbox import EGRESS_IMAGE, NETWORK, container_config, egress_allow, egress_config


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


def test_network_none_is_honored():
    cfg = container_config({"cpu": 0.5, "memory_mb": 64, "timeout_seconds": 10}, {}, permissions={"network": "none"})
    assert cfg["network_mode"] == "none"
    assert "network" not in cfg


def test_container_logs_are_capped():
    cfg = container_config({"cpu": 0.5, "memory_mb": 64, "timeout_seconds": 10}, {})
    assert cfg["log_config"].config == {"max-size": "50m", "max-file": "1"}


def test_kill_after_exit_is_not_a_timeout():
    import threading

    import docker

    from app.main import killer

    class Exited:
        def kill(self):
            raise docker.errors.APIError("container is not running")

    flag = threading.Event()
    killer(Exited(), flag)()
    assert not flag.is_set()


def test_firewall_gets_the_operator_deny_list():
    cfg = egress_config("public", [], "r1", deny=["203.0.113.7", "198.51.100.0/24"])
    assert cfg["environment"]["NYX_EGRESS_DENY"] == "203.0.113.7 198.51.100.0/24"


def test_firewall_has_only_net_admin():
    cfg = egress_config("target_scope", ["example.com", "10.0.0.1"], "r1")
    assert EGRESS_IMAGE == "nyx-egress:1"
    assert cfg["cap_drop"] == ["ALL"] and cfg["cap_add"] == ["NET_ADMIN"]
    assert cfg["security_opt"] == ["no-new-privileges"]
    assert cfg["read_only"] is True and cfg["tmpfs"] == {"/run": "size=1m"}
    assert (cfg["mem_limit"], cfg["pids_limit"]) == ("32m", 32)
    assert cfg["network"] == NETWORK
    assert cfg["environment"] == {
        "NYX_EGRESS_MODE": "target_scope",
        "NYX_EGRESS_ALLOW": "example.com 10.0.0.1",
        "NYX_EGRESS_DENY": "",
    }
    assert cfg["labels"] == {"nyx.run_id": "r1", "nyx.role": "egress"}
    assert "privileged" not in cfg or cfg["privileged"] is False


@pytest.mark.parametrize(
    "targets,allow",
    [
        ([{"type": "url", "value": "https://a.example.com:8443/x?y"}], ["a.example.com"]),
        ([{"type": "url", "value": "http://[2001:db8::1]:8080/x"}], ["2001:db8::1"]),
        (
            [{"type": "domain", "value": "a.example.com"}, {"type": "url", "value": "http://a.example.com/"}],
            ["a.example.com"],
        ),
        ([{"type": "ip", "value": "10.0.0.1"}, {"type": "cidr", "value": "10.1.0.0/24"}], ["10.0.0.1", "10.1.0.0/24"]),
        ([], []),
        # Same rule as the API: a URL typed without a scheme still has a host.
        ([{"type": "url", "value": "example.com:8443/x"}], ["example.com"]),
        ([{"type": "url", "value": "example.com"}], ["example.com"]),
    ],
)
def test_egress_allow_extracts_hosts(targets, allow):
    assert egress_allow(targets) == allow


def test_plugin_joins_the_firewall_namespace():
    cfg = container_config({"cpu": 0.5, "memory_mb": 64, "timeout_seconds": 10}, {}, network_mode="container:abc")
    assert cfg["network_mode"] == "container:abc"
    assert "network" not in cfg
