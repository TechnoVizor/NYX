"""httpx -> NYX events: every live HTTP endpoint becomes an http_service asset."""

from nyx_plugin import INPUT, emit, progress, run_tool

target = INPUT["target"]["value"]
progress(0)
cmd = ["httpx", "-json", "-silent", "-duc", "-sc", "-title", "-td", "-server", "-rl", str(INPUT.get("rate_limit", 10))]
for rec in run_tool(cmd, stdin=target + "\n"):
    url = rec.get("url")
    if not url:
        continue
    emit(
        "asset",
        {
            "kind": "http_service",
            "value": url,
            "status_code": rec.get("status_code"),
            "title": rec.get("title"),
            "webserver": rec.get("webserver"),
            "tech": rec.get("tech", []),
            "ip": rec.get("host_ip"),
        },
    )
progress(100)
