"""Nuclei -> NYX events: every template hit becomes a finding.

Templates are baked into the image at a pinned version; nothing is downloaded at run time.
"""

from nyx_plugin import CONFIG, INPUT, TARGETS, emit, progress, run_tool

# Never configurable: checks that can hurt a target, run code, or call out of scope.
HARD_TAGS = ("dos", "fuzz", "fuzzing", "intrusive", "brute-force", "bruteforce")
HARD_TYPES = ("headless", "code", "javascript")
SEVERITIES = ("info", "low", "medium", "high", "critical")


def command(config: dict, rate_limit: int) -> list[str]:
    tags = dict.fromkeys([*HARD_TAGS, *config.get("exclude_tags", [])])
    severity = config.get("severity", ["low", "medium", "high", "critical"])
    return [
        "nuclei", "-jsonl", "-silent", "-duc", "-no-interactsh", "-t", "/templates", "-ud", "/templates",
        "-rl", str(rate_limit), "-severity", ",".join(severity), "-etags", ",".join(tags),
        "-exclude-type", ",".join(HARD_TYPES),
    ]  # fmt: skip


def strings(value) -> list[str]:
    return [str(v) for v in (value if isinstance(value, list) else [value] if value else [])]


def finding(rec: dict) -> dict:
    info = rec.get("info") or {}
    cls = info.get("classification") or {}
    severity = str(info.get("severity", "")).lower()
    data = {
        "template_id": rec.get("template-id"),
        "title": info.get("name") or rec.get("template-id") or "Nuclei finding",
        "severity": severity if severity in SEVERITIES else "info",
        "matched_at": rec.get("matched-at") or rec.get("host"),
        "description": info.get("description"),
        "references": strings(info.get("reference")),
        "cve": strings(cls.get("cve-id")),
        "cwe": strings(cls.get("cwe-id")),
        "extracted": strings(rec.get("extracted-results")),
        "curl": rec.get("curl-command"),
        "matcher": rec.get("matcher-name"),
    }
    return {k: v if isinstance(v, list) else str(v) for k, v in data.items() if v}


def main() -> None:
    urls = [t["value"] for t in TARGETS]
    progress(0)
    for rec in run_tool(command(CONFIG, INPUT.get("rate_limit", 10)), stdin="\n".join(urls) + "\n"):
        source = rec.get("url") or rec.get("host") or urls[0]
        target = next((u for u in urls if source.startswith(u)), source)
        emit("finding", finding(rec), target={"type": "url", "value": target})
    progress(100)


if __name__ == "__main__":
    main()
