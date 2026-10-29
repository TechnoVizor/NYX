import { test } from "node:test";
import assert from "node:assert/strict";
import { barSeries, headline, metaLine, ring, statCells } from "./home.ts";
import type { Dashboard } from "./types.ts";

const zero = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
const day = (i: number, by?: Partial<typeof zero>) => {
  const b = { ...zero, ...by };
  return { date: `2026-10-${String(i).padStart(2, "0")}`, count: Object.values(b).reduce((a, n) => a + n, 0), ...(by ? { by_severity: b } : {}) };
};
const dash = (over: Partial<Dashboard> = {}): Dashboard => ({
  open_by_severity: { critical: 1, high: 11, medium: 3, low: 2, info: 0 },
  open_total: 17, assets_total: 20, assets_new_7d: 19,
  findings_per_day: Array.from({ length: 30 }, (_, i) => day(i + 1, i >= 27 ? { high: 2, low: 1 } : {})),
  recent_scans: [], top_assets: [], ...over,
});

test("headline", () => {
  assert.deepEqual(headline(12), { lead: "12 issues need you.", tail: "Scan something new?" });
  assert.equal(headline(1).lead, "1 issue needs you.");
  assert.deepEqual(headline(0), { lead: "All clear.", tail: "Scan something new?" });
});

test("stat cells", () => {
  const c = statCells(dash());
  assert.deepEqual(c.map((x) => [x.key, x.value, x.href, x.delta]), [
    ["urgent", 12, "/app/findings?severity=critical,high", undefined],
    ["open", 17, "/app/findings", undefined],
    ["assets", 20, "/app/assets", 19],
    ["new", 9, "/app/findings", undefined],
  ]);
  assert.equal(statCells(dash({ assets_new_7d: 0 }))[2].delta, undefined);
});

test("bars stack bottom-up and drop empty segments", () => {
  const { bars, max } = barSeries([day(1, { critical: 1, low: 2 }), day(2, {})]);
  assert.deepEqual(bars[0].segments, [{ severity: "low", value: 2 }, { severity: "critical", value: 1 }]);
  assert.deepEqual(bars[1].segments, []);
  assert.equal(max, 3);
});
test("all-zero days keep max at 1", () => assert.equal(barSeries([day(1, {}), day(2, {})]).max, 1));
test("an older API without by_severity draws one neutral segment", () =>
  assert.deepEqual(barSeries([{ date: "2026-10-01", count: 4 }]).bars[0].segments, [{ severity: "unknown", value: 4 }]));

test("ring shares", () => {
  const r = ring({ critical: 0, high: 12, medium: 3, low: 1, info: 0 });
  assert.deepEqual(r.map((x) => x.severity), ["high", "medium", "low"]);
  assert.equal(r.reduce((a, x) => a + x.share, 0), 1);
  assert.deepEqual(ring(zero), []);
});

test("meta line", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  assert.equal(metaLine(2, "2026-10-29T11:00:00Z", now), "Workspace · 2 targets · last scan 1 h ago");
  assert.equal(metaLine(1, null, now), "Workspace · 1 target");
  assert.equal(metaLine(0, null, now), "Workspace · no targets yet");
});
