import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (f: string) => readFileSync(new URL(f.replaceAll("\\", "/"), root), "utf8");

// Depth is tone, not shadow (Dovetail): only the modal dialog may cast one.
test("no drop shadows on cards, popovers or menus", () => {
  const files = readdirSync(new URL("components/", root), { recursive: true }).map(String).filter((f) => f.endsWith(".tsx"));
  const shady = files.filter((f) => !f.endsWith("dialog.tsx") && /\bshadow-(sm|md|lg|xl|2xl)\b/.test(read(`components/${f}`)));
  assert.deepEqual(shady, []);
});

test("corners stop at 8px", () => {
  const css = read("app/globals.css");
  for (const r of ["lg", "xl", "2xl", "3xl", "4xl"]) assert.match(css, new RegExp(`--radius-${r}: 8px;`), r);
});
