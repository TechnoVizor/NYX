import { test } from "node:test";
import assert from "node:assert/strict";
import { barState } from "./status-bar.ts";
import type { Scan, ScanStatus } from "./types.ts";

const s = (id: string, status: ScanStatus, created_at: string) => ({ id, status, created_at }) as Scan;

test("idle", () => assert.deepEqual(barState([s("a", "COMPLETED", "2026-10-29T10:00:00Z")], null), { kind: "idle" }));
test("newest running plus count, even with an older failure", () => {
  const r = barState([s("c", "RUNNING", "2026-10-29T12:00:00Z"), s("b", "RUNNING", "2026-10-29T11:00:00Z"), s("a", "FAILED", "2026-10-29T10:00:00Z")], null);
  assert.equal(r.kind, "running");
  assert.equal(r.kind === "running" && r.scan.id, "c");
  assert.equal(r.kind === "running" && r.more, 1);
});
test("newest failed and unseen alerts", () => assert.equal(barState([s("a", "FAILED", "2026-10-29T10:00:00Z")], null).kind, "failed"));
test("seen failure goes quiet", () => assert.equal(barState([s("a", "FAILED", "2026-10-29T10:00:00Z")], "a").kind, "idle"));
test("partial and cancelled never alert", () => {
  for (const st of ["PARTIAL", "CANCELLED"] as const) assert.equal(barState([s("a", st, "2026-10-29T10:00:00Z")], null).kind, "idle");
});
test("CREATED counts as running", () => assert.equal(barState([s("a", "CREATED", "2026-10-29T10:00:00Z")], null).kind, "running"));
test("order comes from created_at, not the list", () =>
  assert.equal(barState([s("old", "COMPLETED", "2026-10-29T09:00:00Z"), s("new", "FAILED", "2026-10-29T10:00:00Z")], null).kind, "failed"));
