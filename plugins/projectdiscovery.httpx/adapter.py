"""httpx -> NYX events: every live HTTP endpoint becomes an http_service asset."""

from nyx_plugin import INPUT, TARGETS, emit, progress, run_tool

kinds = {t["value"]: t["type"] for t in TARGETS}
progress(0)
cmd = ["httpx", "-json", "-silent", "-duc", "-sc", "-title", "-td", "-server", "-rl", str(INPUT.get("rate_limit", 10))]
for rec in run_tool(cmd, stdin="\n".join(kinds) + "\n"):
    url = rec.get("url")
    if not url:
        continue
    source = rec.get("input") or url
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
        target={"type": kinds.get(source, "url"), "value": source},
    )
progress(100)
