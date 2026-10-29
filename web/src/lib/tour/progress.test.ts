import { test } from "node:test";
import assert from "node:assert/strict";
import { progress, type Facts } from "./progress.ts";

const facts = (f: Partial<Facts> = {}): Facts => ({ role: "admin", scopeCount: 0, scans: [], findingsTotal: 0, reviewedTotal: 0, ...f });
const scan = (status: Facts["scans"][number]["status"]) => ({ id: "s1", status, error: null });
const done = (f: Facts) => progress(f).items.filter((i) => i.done).map((i) => i.id);

test("a fresh workspace asks for a target", () => {
  assert.equal(progress(facts()).current, "target");
  assert.deepEqual(done(facts()), ["account"]);
});

test("with a target, the next step is a scan", () => {
  assert.equal(progress(facts({ scopeCount: 1 })).current, "scan");
});

test("a running scan leaves only the review", () => {
  const r = progress(facts({ scopeCount: 1, scans: [scan("RUNNING")] }));
  assert.equal(r.current, "review");
  assert.equal(r.allDone, false);
});

test("a finished scan that found nothing completes the path", () => {
  assert.equal(progress(facts({ scopeCount: 1, scans: [scan("COMPLETED")] })).allDone, true);
});

test("a reviewed finding completes the path", () => {
  const r = progress(facts({ scopeCount: 1, scans: [scan("COMPLETED")], findingsTotal: 3, reviewedTotal: 1 }));
  assert.equal(r.allDone, true);
  assert.equal(r.current, null);
});

test("a failed scan with nothing found does not count as reviewed", () => {
  assert.equal(progress(facts({ scopeCount: 1, scans: [scan("FAILED")] })).current, "review");
});
