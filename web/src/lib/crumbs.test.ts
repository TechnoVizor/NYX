import { test } from "node:test";
import assert from "node:assert/strict";
import { crumbs } from "./crumbs.ts";

test("section", () => assert.deepEqual(crumbs("/app/scans", {}), [{ label: "Scans" }]));
test("record with name", () =>
  assert.deepEqual(crumbs("/app/scans/abc123ef-9/findings", { "abc123ef-9": "testbed.nyx-lab.test" }), [
    { label: "Scans", href: "/app/scans" },
    { label: "testbed.nyx-lab.test", href: "/app/scans/abc123ef-9", mono: true },
    { label: "Findings" },
  ]));
test("unknown id falls back to short id", () => assert.equal(crumbs("/app/findings/0123456789", {})[1].label, "01234567"));
test("settings", () =>
  assert.deepEqual(crumbs("/app/settings/appearance", {}), [{ label: "Settings", href: "/app/settings/appearance" }, { label: "Appearance" }]));
test("home and new scan", () => {
  assert.deepEqual(crumbs("/app/dashboard", {}), [{ label: "Home" }]);
  assert.deepEqual(crumbs("/app/scans/new", {}), [{ label: "Scans", href: "/app/scans" }, { label: "New scan" }]);
});
