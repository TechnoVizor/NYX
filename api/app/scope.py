"""Scope: which targets NYX may touch, and how hard. Pure functions, no database."""

import ipaddress
import re
from collections.abc import Sequence
from typing import Protocol
from urllib.parse import urlsplit

_LABEL = r"(?!-)[a-z0-9-]{1,63}(?<!-)"
_DOMAIN = re.compile(rf"^(?=.{{1,253}}$)(?:{_LABEL}\.)+{_LABEL}$")
WIDEST_PREFIX = {4: 16, 6: 48}


class ScopeLike(Protocol):
    kind: str
    value: str
    active_allowed: bool


def _domain(value: str) -> str:
    d = value.strip().lower().rstrip(".")
    # ponytail: ASCII names only; punycode (xn--) works, raw unicode IDNs are refused until someone needs them.
    if not _DOMAIN.fullmatch(d):
        raise ValueError(f"{value!r} is not a domain name.")
    return d


def normalize_entry(kind: str, value: str) -> str:
    if kind == "domain":
        if "*" in value:
            raise ValueError("Write example.com, not *.example.com: a domain entry already covers its subdomains.")
        return _domain(value)
    if kind == "cidr":
        try:
            net = ipaddress.ip_network(value.strip(), strict=False)
        except ValueError:
            raise ValueError(f"{value!r} is not an IP address or CIDR range.") from None
        if net.prefixlen < WIDEST_PREFIX[net.version]:
            raise ValueError(f"{net} is too wide. Use /{WIDEST_PREFIX[net.version]} or narrower.")
        return str(net)
    raise ValueError(f"Unknown scope kind {kind!r}.")


def parse_target(type: str, value: str):
    """Return ("domain", name) | ("ip", address) | ("cidr", network). Raise ValueError if it cannot be parsed."""
    if type == "url":
        host = urlsplit(value if "://" in value else f"//{value}").hostname
        if not host:
            raise ValueError(f"{value!r} has no host.")
        value, type = host, "domain"
    if type in ("domain", "ip"):
        try:
            return "ip", ipaddress.ip_address(value.strip().strip("[]"))
        except ValueError:
            if type == "ip":
                raise
        return "domain", _domain(value)
    if type == "cidr":
        return "cidr", ipaddress.ip_network(value.strip(), strict=False)
    raise ValueError(f"Unknown target type {type!r}.")


def _covers(entry: ScopeLike, kind: str, parsed) -> bool:
    if entry.kind == "domain":
        return kind == "domain" and (parsed == entry.value or parsed.endswith("." + entry.value))
    net = ipaddress.ip_network(entry.value)
    if kind == "ip":
        return parsed.version == net.version and parsed in net
    if kind == "cidr":
        return parsed.version == net.version and parsed.subnet_of(net)
    return False


def find_entry(target_type: str, target_value: str, entries: Sequence[ScopeLike]) -> ScopeLike | None:
    try:
        kind, parsed = parse_target(target_type, target_value)
    except ValueError:
        return None
    return next((e for e in entries if _covers(e, kind, parsed)), None)


def refusal(risk_level: str, target_value: str, entry: ScopeLike | None) -> str | None:
    """None when the run may go ahead, otherwise the sentence to show the user."""
    if risk_level == "intrusive":
        return "Intrusive plugins are disabled in this version of NYX."
    if entry is None:
        return f"{target_value} is not in scope."
    if risk_level != "passive" and not entry.active_allowed:
        return f"{target_value} is in scope for passive plugins only. Allow active scanning on its scope entry first."
    return None
