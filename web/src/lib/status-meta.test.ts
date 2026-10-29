import { test } from "node:test";
import assert from "node:assert/strict";
import { findingStatusMeta, scanStatusMeta } from "./status-meta.ts";
import { findingStatuses } from "./types.ts";

const scanAll = ["CREATED", "RUNNING", "PAUSED", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED", "PENDING", "SUCCEEDED", "TIMED_OUT"] as const;

test("every scan and run status has a label, icon and tone", () => {
  for (const s of scanAll) {
    const m = scanStatusMeta[s];
    assert.ok(m?.label && typeof m.icon === "object" && m.tone, s);
  }
});

test("scan tones follow the spec", () => {
  const tone = (s: (typeof scanAll)[number]) => scanStatusMeta[s].tone;
  assert.deepEqual(scanAll.map(tone), ["muted", "blue", "muted", "green", "orange", "red", "muted", "muted", "green", "red"]);
  assert.equal(scanStatusMeta.RUNNING.spin, true);
});

test("finding statuses keep all five, with their words and tones", () => {
  assert.deepEqual(findingStatuses.map((s) => [findingStatusMeta[s].label, findingStatusMeta[s].tone]), [
    ["Open", "blue"], ["Confirmed", "yellow"], ["False positive", "muted"], ["Accepted risk", "muted"], ["Fixed", "green"],
  ]);
});
