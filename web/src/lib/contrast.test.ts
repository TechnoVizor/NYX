import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { contrast, tokens } from "./contrast.ts";

const t = tokens(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));
const surfaces = ["--background", "--surface-1", "--surface-2", "--surface-3"];

test("text tokens reach 4.5:1 on every surface", () => {
  for (const fg of ["--foreground", "--muted-foreground", "--subtle", "--brand", "--sev-critical", "--sev-high", "--sev-medium", "--sev-low", "--sev-info"])
    for (const bg of surfaces) assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}`);
});

test("control boundaries and focus reach 3:1", () => {
  for (const fg of ["--input", "--ring"])
    for (const bg of ["--background", "--surface-1"]) assert.ok(contrast(t[fg], t[bg]) >= 3, `${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}`);
});

test("no text smaller than 12px", () => {
  const root = new URL("../", import.meta.url);
  const files = readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith(".tsx") || f.endsWith(".css"));
  const tiny = files.filter((f) => /text-\[(9|10|11)(\.5)?px\]/.test(readFileSync(new URL(f.replaceAll("\\", "/"), root), "utf8")));
  assert.deepEqual(tiny, []);
});
