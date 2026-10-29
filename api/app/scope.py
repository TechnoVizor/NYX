"""Scope: which targets NYX may touch, and how hard. Pure functions, no database."""

import ipaddress
import re
from collections.abc import Sequence
from typing import Protocol
from urllib.parse import urlsplit, urlunsplit

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


def canonical_url(url: str) -> str:
    """The URL without a port its scheme implies, so https://h:443/x and https://h/x are one thing. Nothing else
    changes: tools get URLs as written."""
    parts = urlsplit(url)
    try:
        port = parts.port
    except ValueError:
        return url
    if port is not None and port == {"http": 80, "https": 443}.get(parts.scheme.lower()):
        return urlunsplit(parts._replace(netloc=parts.netloc.rsplit(":", 1)[0]))
    return url


def _service(value: str) -> tuple[str, int]:
    """host:port -> (host, port). Raise ValueError without a valid port."""
    parts = urlsplit(f"//{value}")
    if not parts.hostname or parts.port is None:  # .port raises ValueError for 70000 or "http"
        raise ValueError(f"{value!r} is not host:port.")
    return parts.hostname, parts.port


def parse_target(type: str, value: str):
    """Return ("domain", name) | ("ip", address) | ("cidr", network). Raise ValueError if it cannot be parsed."""
    # urlsplit silently drops tab/CR/LF, and tools read newlines as "next target": refuse them outright,
    # so what is checked here is exactly what the plugin receives.
    if any(c.isspace() or not c.isprintable() for c in value):
        raise ValueError("Targets cannot contain spaces, line breaks or control characters.")
    if type in ("url", "service") and ("@" in value or "\\" in value):
        raise ValueError("URLs with @ or backslashes are refused: they can point somewhere other than they look.")
    if type == "service":
        value, type = _service(value)[0], "domain"
    elif type == "url":
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


def normalized_target(type: str, value: str) -> dict:
    """The target exactly as the plugin will get it. URLs keep their path; hosts are normalized."""
    kind, parsed = parse_target(type, value)
    if type == "url":
        return {"type": "url", "value": canonical_url(value)}
    if type == "service":
        host = f"[{parsed}]" if kind == "ip" and parsed.version == 6 else str(parsed)
        return {"type": "service", "value": f"{host}:{_service(value)[1]}"}
    return {"type": kind, "value": str(parsed)}


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
