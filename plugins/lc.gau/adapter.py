"""gau -> NYX events: every URL a web archive has seen on the domain becomes an endpoint asset."""

from urllib.parse import urlsplit

from nyx_plugin import INPUT, TARGETS, emit, log, progress, run_tool

MAX_URLS = 5000  # per run: a big domain has millions in the archives
SKIP = "png,jpg,jpeg,gif,svg,ico,css,woff,woff2,ttf,eot,mp4,webp"

domains = [t["value"] for t in TARGETS]
cmd = ["gau", "--json", "--providers", "wayback,commoncrawl,otx,urlscan", "--blacklist", SKIP, "--fp"]
cmd += ["--threads", str(INPUT.get("rate_limit", 2))]
progress(0)
seen = set()
for rec in run_tool(cmd, stdin="\n".join(domains) + "\n"):
    url = rec.get("url")
    if not url or url in seen:
        continue
    if len(seen) >= MAX_URLS:
        log(f"Stopped at {MAX_URLS} archived URLs; the archives have more.", "warning")
        break
    seen.add(url)
    host = (urlsplit(url).hostname or "").lower()
    domain = next((d for d in domains if host == d or host.endswith("." + d)), domains[0])
    emit("asset", {"kind": "endpoint", "value": url, "source": "archive"}, target={"type": "domain", "value": domain})
progress(100)
