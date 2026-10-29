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

test("a done step says so on its own screen and moves on with Next", () => {
  const cases = [["target", 2, "/app/targets", "target-form"], ["scan", 3, "/app/scans", "nav-scans"], ["review", 5, "/app/findings", "finding-row"]] as const;
  for (const [step, index, path, target] of cases) {
    const c = copyFor({ step, index, variant: "done" }, facts, path);
    assert.equal(c.name, { target: "Targets", scan: "Scan", review: "Review" }[step]);
    assert.deepEqual(c.primary, { label: step === "review" ? "Finish" : "Next", ack: true }, step);
    assert.equal(c.target, target, step);
  }
});
