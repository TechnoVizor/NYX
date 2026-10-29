"""Katana -> NYX events: every page the crawler reaches on a web service becomes an endpoint asset."""

from nyx_plugin import CONFIG, INPUT, TARGETS, emit, progress, resolvers, run_tool

urls = [t["value"] for t in TARGETS]
cmd = ["katana", "-j", "-silent", "-duc", "-or", "-ob", "-iqp", "-fsu", "-fs", "fqdn", "-ct", "3m", "-c", "5"]
cmd += ["-d", str(CONFIG.get("depth", 2)), "-rl", str(INPUT.get("rate_limit", 50))]
if dns := resolvers():
    cmd += ["-r", dns]
progress(0)
seen = set()
for rec in run_tool(cmd, stdin="\n".join(urls) + "\n"):
    req = rec.get("request") or {}
    url = req.get("endpoint")
    if not url or url in seen:
        continue
    seen.add(url)
    source = next((u for u in urls if url.startswith(u)), urls[0])
    data = {
        "kind": "endpoint",
        "value": url,
        "method": req.get("method", "GET"),
        "status_code": (rec.get("response") or {}).get("status_code"),
        "source": "crawl",
    }
    emit("asset", {k: v for k, v in data.items() if v is not None}, target={"type": "url", "value": source})
progress(100)
