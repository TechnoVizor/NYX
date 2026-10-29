"""tlsx -> NYX events: the certificate a host serves on 443 and the names it lists.

What is wrong with a certificate (expired, self-signed, mismatched) is left to Nuclei's ssl templates: one finding,
one source.
"""

import re

from nyx_plugin import INPUT, TARGETS, emit, progress, resolvers, run_tool

HOSTNAME = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")

kinds = {t["value"]: t["type"] for t in TARGETS}
cmd = ["tlsx", "-json", "-silent", "-duc", "-hash", "sha256", "-p", "443", "-c", str(INPUT.get("rate_limit", 25))]
if dns := resolvers():
    cmd += ["-r", dns]
progress(0)
for rec in run_tool(cmd, stdin="\n".join(kinds) + "\n"):
    host, fp = rec.get("host"), (rec.get("fingerprint_hash") or {}).get("sha256")
    if not host or not fp or rec.get("probe_status") is False:
        continue
    target = {"type": kinds.get(host, "domain"), "value": host}
    where = f"{host}:{rec.get('port', 443)}"
    names = sorted(
        {n.lower().removeprefix("*.") for n in [*(rec.get("subject_an") or []), rec.get("subject_cn") or ""]}
    )
    cert = {
        "kind": "certificate",
        "value": fp,
        "subject_cn": rec.get("subject_cn"),
        "sans": rec.get("subject_an") or [],
        "issuer": rec.get("issuer_cn") or rec.get("issuer_dn"),
        "not_before": rec.get("not_before"),
        "not_after": rec.get("not_after"),
        "tls_version": rec.get("tls_version"),
        "host": where,
    }
    emit("asset", {k: v for k, v in cert.items() if v is not None}, target=target)
    emit("relation", {"from": where, "to": fp, "kind": "serves_certificate"}, target=target)
    for name in names:
        if name != host and HOSTNAME.match(name):  # a name the certificate vouches for: scope decides the rest
            emit("asset", {"kind": "subdomain", "value": name}, target=target)
            emit("relation", {"from": fp, "to": name, "kind": "names"}, target=target)
progress(100)
