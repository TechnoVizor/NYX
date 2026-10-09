"""Template adapter: run the tool for each target in the batch, turn each JSON record into NYX events."""

from nyx_plugin import TARGETS, emit, progress, run_tool

progress(0)
for target in TARGETS:
    for record in run_tool(["your-tool", "-d", target["value"], "-json"]):
        emit("asset", {"kind": "subdomain", "value": record["host"]}, target=target)
progress(100)
