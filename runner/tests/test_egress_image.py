"""The firewall image on its own: which rules each mode installs."""

import os
import time

import docker
import pytest

try:
    client = docker.from_env()
    client.ping()
except Exception:  # noqa: BLE001
    client = None
needs_docker = pytest.mark.skipif(client is None, reason="Docker not available")
EGRESS_DIR = os.path.join(os.path.dirname(__file__), "..", "egress")


@pytest.fixture(scope="module")
def image():
    client.images.build(path=EGRESS_DIR, tag="nyx-egress:1")
    return "nyx-egress:1"


def start(image, mode, allow=""):
    c = client.containers.run(
        image,
        detach=True,
        cap_drop=["ALL"],
        cap_add=["NET_ADMIN"],
        read_only=True,
        tmpfs={"/run": "size=1m"},
        environment={"NYX_EGRESS_MODE": mode, "NYX_EGRESS_ALLOW": allow},
    )
    for _ in range(100):
        c.reload()
        if b"ready" in c.logs(stdout=True, stderr=False) or c.status == "exited":
            break
        time.sleep(0.1)
    return c


def rules(c):
    return c.exec_run(["iptables", "-S", "OUTPUT"]).output.decode()


@needs_docker
def test_target_scope_allows_only_listed_addresses(image):
    c = start(image, "target_scope", "192.0.2.10 198.51.100.0/24")
    try:
        r = rules(c)
        assert "-P OUTPUT DROP" in r
        assert "-A OUTPUT -o lo -j ACCEPT" in r
        assert "-d 192.0.2.10/32 -j ACCEPT" in r
        assert "-d 198.51.100.0/24 -j ACCEPT" in r
    finally:
        c.remove(force=True)


@needs_docker
def test_target_scope_resolves_names(image):
    c = start(image, "target_scope", "localhost")
    try:
        assert "-d 127.0.0.1/32 -j ACCEPT" in rules(c)
    finally:
        c.remove(force=True)


@needs_docker
def test_unresolvable_name_still_ready(image):
    c = start(image, "target_scope", "no-such-host.invalid")
    try:
        assert b"ready" in c.logs(stdout=True, stderr=False)
        assert b"unresolved: no-such-host.invalid" in c.logs(stdout=False, stderr=True)
    finally:
        c.remove(force=True)


@needs_docker
def test_public_drops_private_ranges(image):
    c = start(image, "public")
    try:
        r = rules(c)
        assert "-P OUTPUT ACCEPT" in r
        for net in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "100.64.0.0/10"):
            assert f"-d {net} -j DROP" in r
        assert r.index("-o lo -j ACCEPT") < r.index("-d 127.0.0.0/8 -j DROP")
    finally:
        c.remove(force=True)


@needs_docker
def test_bad_mode_exits_without_ready(image):
    c = start(image, "wide_open")
    try:
        assert c.status == "exited"
        assert b"ready" not in c.logs(stdout=True, stderr=False)
        assert b"egress: unknown mode wide_open" in c.logs(stdout=False, stderr=True)
    finally:
        c.remove(force=True)
