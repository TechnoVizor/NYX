"""Naabu -> NYX events: every open TCP port becomes a port asset, host:port, on the host it was found on."""

from nyx_plugin import CONFIG, INPUT, TARGETS, emit, log, progress, resolvable, resolvers, run_tool

kinds = {t["value"]: t["type"] for t in TARGETS}
cmd = ["naabu", "-j", "-silent", "-duc", "-s", "c", "-Pn", "-ec", "-tp", str(CONFIG.get("top_ports", "100"))]
cmd += ["-rate", str(INPUT.get("rate_limit", 300))]
if dns := resolvers():
    cmd += ["-r", dns]
progress(0)
# naabu stops with an error when no host in the batch resolves: a name from a certificate often does not.
hosts = resolvable(list(kinds))
if skipped := len(kinds) - len(hosts):
    log(f"Skipped {skipped} host(s) that do not resolve.")
seen = set()
for rec in run_tool(cmd, stdin="\n".join(hosts) + "\n") if hosts else ():
    host, port = rec.get("host") or rec.get("ip"), rec.get("port")
    if not host or not port or (host, port) in seen:
        continue  # naabu reports a port again on every verification pass
    seen.add((host, port))
    emit(
        "asset",
        {
            "kind": "port",
            "value": f"[{host}]:{port}" if ":" in host else f"{host}:{port}",
            "port": port,
            "protocol": rec.get("protocol", "tcp"),
            "ip": rec.get("ip"),
        },
        target={"type": kinds.get(host, "ip"), "value": host},
    )
progress(100)
