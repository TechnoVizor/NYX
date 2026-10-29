import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Pages carry a title, not a sentence under it: state is shown, not described.
test("no page header carries a description", () => {
  const root = new URL("../", import.meta.url);
  const files = readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith(".tsx"));
  const wordy = files.filter((f) => /<PageHeader[^>]*\bdescription=/.test(readFileSync(new URL(f.replaceAll("\\", "/"), root), "utf8")));
  assert.deepEqual(wordy, []);
});
