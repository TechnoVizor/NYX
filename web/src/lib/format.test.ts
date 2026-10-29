import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, duration } from "./format.ts";

const now = new Date("2026-10-29T12:00:00Z");

test("recent times read as minutes, hours or days ago", () => {
  assert.equal(ago("2026-10-29T11:59:40Z", now), "just now");
  assert.equal(ago("2026-10-29T11:15:00Z", now), "45 min ago");
  assert.equal(ago("2026-10-29T09:00:00Z", now), "3 h ago");
  assert.equal(ago("2026-10-27T12:00:00Z", now), "2 d ago");
});

test("older times read as a short date", () => {
  assert.equal(ago("2026-10-11T14:32:06Z", now), "11 Oct");
  assert.equal(ago("2025-03-02T10:00:00Z", now), "2 Mar 2025");
});

test("durations read as seconds, minutes or hours", () => {
  assert.equal(duration(45), "45 s");
  assert.equal(duration(1018), "17 min");
  assert.equal(duration(3900), "1 h 5 min");
});
