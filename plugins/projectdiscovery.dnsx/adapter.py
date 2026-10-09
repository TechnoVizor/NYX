"""dnsx -> NYX events: each resolved address becomes an ip asset and a resolves_to relation."""

from nyx_plugin import INPUT, TARGETS, emit, progress, run_tool

hosts = [t["value"] for t in TARGETS]
progress(0)
cmd = ["dnsx", "-a", "-aaaa", "-resp", "-json", "-silent", "-duc", "-rl", str(INPUT.get("rate_limit", 50))]
for rec in run_tool(cmd, stdin="\n".join(hosts) + "\n"):
    host = rec.get("host") or hosts[0]
    target = {"type": "domain", "value": host}
    for ip in [*rec.get("a", []), *rec.get("aaaa", [])]:
        emit("asset", {"kind": "ip", "value": ip}, target=target)
        emit("relation", {"from": host, "to": ip, "kind": "resolves_to"}, target=target)
progress(100)
