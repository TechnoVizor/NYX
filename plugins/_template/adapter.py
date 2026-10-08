"""Template adapter: run the tool, turn each JSON record into NYX events."""

from nyx_plugin import INPUT, emit, progress, run_tool

target = INPUT["target"]["value"]
progress(0)
for record in run_tool(["your-tool", "-d", target, "-json"]):
    emit("asset", {"kind": "subdomain", "value": record["host"]})
progress(100)
