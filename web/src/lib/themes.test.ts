import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, mix } from "./contrast.ts";
import { readFileSync } from "node:fs";
import { THEMES, deriveTokens, hueOf, themeById, themeCss } from "./themes.ts";

const SURFACES = ["background", "surface-1", "surface-2", "surface-3"] as const;
const TEXT = ["foreground", "muted-foreground", "subtle", "brand", "sev-critical", "sev-high", "sev-medium", "sev-low", "sev-info"] as const;
const ratio = (a: string, b: string) => contrast(a, b).toFixed(2);

test("nine themes in spec order", () =>
  assert.deepEqual(
    THEMES.map((t) => t.id),
    ["nyx", "github-dark", "github-light", "one-dark", "monokai", "dracula", "nord", "catppuccin-mocha", "catppuccin-latte"],
  ));

for (const theme of THEMES) {
  const k = deriveTokens(theme);
  test(`${theme.id}: text reaches 4.5:1 on every surface`, () => {
    for (const fg of TEXT) for (const bg of SURFACES) assert.ok(contrast(k[fg], k[bg]) >= 4.5, `${fg} on ${bg}: ${ratio(k[fg], k[bg])}`);
  });
  test(`${theme.id}: severity text on its own pill`, () => {
    for (const s of ["critical", "high", "medium", "low", "info"] as const)
      assert.ok(contrast(k[`sev-${s}`], k[`sev-${s}-soft`]) >= 4.5, `sev-${s}: ${ratio(k[`sev-${s}`], k[`sev-${s}-soft`])}`);
  });
  test(`${theme.id}: filled controls and status bar`, () => {
    const pairs = [["primary-foreground", "primary"], ["on-bar", "bar"], ["on-bar-alert", "bar-alert"], ["sidebar-primary-foreground", "sidebar-primary"]] as const;
    for (const [fg, bg] of pairs) assert.ok(contrast(k[fg], k[bg]) >= 4.5, `${fg} on ${bg}: ${ratio(k[fg], k[bg])}`);
  });
  test(`${theme.id}: control boundaries and focus reach 3:1`, () => {
    for (const fg of ["input", "ring"] as const)
      for (const bg of ["background", "surface-1"] as const) assert.ok(contrast(k[fg], k[bg]) >= 3, `${fg} on ${bg}: ${ratio(k[fg], k[bg])}`);
  });
}

test("nyx keeps today's palette", () => {
  const k = deriveTokens(themeById("nyx")!);
  assert.equal(k.background, "#050506");
  assert.equal(k.brand, "#8ea2ff");
  assert.equal(k["sev-critical"], "#ff5d62");
});

test("hueOf is stable", () => assert.equal(hueOf("projectdiscovery.nuclei"), hueOf("projectdiscovery.nuclei")));

test("mix", () => {
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mix("#102030", "#102030", 0.3), "#102030");
});

test("committed themes.css is up to date", () =>
  assert.equal(readFileSync(new URL("../app/themes.css", import.meta.url), "utf8"), themeCss()));
