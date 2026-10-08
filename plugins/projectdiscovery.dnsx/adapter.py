"""dnsx -> NYX events: each resolved address becomes an ip asset and a resolves_to relation."""

from nyx_plugin import INPUT, emit, progress, run_tool

domain = INPUT["target"]["value"]
progress(0)
for rec in run_tool(["dnsx", "-a", "-aaaa", "-resp", "-json", "-silent", "-duc", "-rl", str(INPUT.get("rate_limit", 50))], stdin=domain + "\n"):
    host = rec.get("host", domain)
    for ip in [*rec.get("a", []), *rec.get("aaaa", [])]:
        emit("asset", {"kind": "ip", "value": ip})
        emit("relation", {"from": host, "to": ip, "kind": "resolves_to"})
progress(100)
