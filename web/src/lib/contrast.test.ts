import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Colour contrast per theme lives in themes.test.ts.

test("no text smaller than 12px", () => {
  const root = new URL("../", import.meta.url);
  const files = readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith(".tsx") || f.endsWith(".css"));
  const tiny = files.filter((f) => /text-\[(9|10|11)(\.5)?px\]/.test(readFileSync(new URL(f.replaceAll("\\", "/"), root), "utf8")));
  assert.deepEqual(tiny, []);
});
