"""Subfinder -> NYX events: every subdomain becomes an asset and a subdomain_of relation."""

from nyx_plugin import INPUT, emit, progress, run_tool

domain = INPUT["target"]["value"]
rate = str(INPUT.get("rate_limit", 20))
progress(0)
seen = set()
for rec in run_tool(["subfinder", "-d", domain, "-oJ", "-silent", "-duc", "-rl", rate]):
    host = rec.get("host", "").lower()
    if not host or host in seen:
        continue
    seen.add(host)
    emit("asset", {"kind": "subdomain", "value": host, "source": rec.get("source")})
    emit("relation", {"from": host, "to": domain, "kind": "subdomain_of"})
progress(100)
