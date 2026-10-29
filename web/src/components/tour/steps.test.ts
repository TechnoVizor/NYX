import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFor } from "./steps.ts";

const facts = { role: "admin" as const, scopeCount: 1, scans: [{ id: "s1", status: "FAILED" as const, error: "Runner down." }], findingsTotal: 0, reviewedTotal: 0 };

test("a failed scan offers Run again, wherever the user is", () => {
  for (const path of ["/app/dashboard", "/app/findings"]) {
    const c = copyFor({ step: "scan", index: 3, variant: "scan-failed" }, facts, path);
    assert.equal(c.primary?.label, "Run again");
    assert.ok(c.body.startsWith("Runner down."));
  }
});
