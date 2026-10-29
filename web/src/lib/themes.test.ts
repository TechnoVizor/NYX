import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, mix } from "./contrast.ts";
import { readFileSync } from "node:fs";
import { THEMES, deriveTokens, hueOf, themeById, themeCss } from "./themes.ts";

const SURFACES = ["background", "surface-1", "surface-2", "surface-3"] as const;
const TEXT = ["foreground", "muted-foreground", "subtle", "brand", "sev-critical", "sev-high", "sev-medium", "sev-low", "sev-info", "purple"] as const;
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
    assert.ok(contrast(k.purple, k["purple-soft"]) >= 4.5, `purple: ${ratio(k.purple, k["purple-soft"])}`);
    assert.ok(contrast(k.brand, k["brand-soft"]) >= 4.5, `brand on brand-soft: ${ratio(k.brand, k["brand-soft"])}`);
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

test("nyx speaks Dovetail", () => {
  const k = deriveTokens(themeById("nyx")!);
  assert.deepEqual(
    [k.background, k["surface-2"], k.foreground, k["muted-foreground"], k.brand, k.primary, k["primary-foreground"]],
    ["#0a0a0a", "#141414", "#ffffff", "#a7a7a7", "#6798ff", "#ffffff", "#0a0a0a"],
  );
});

test("cards sit on the panel tone in every theme", () => {
  for (const t of THEMES) assert.equal(deriveTokens(t).card, t.input.panel, t.id);
});

test("hueOf is stable and never red (red means danger)", () => {
  assert.equal(hueOf("projectdiscovery.nuclei"), hueOf("projectdiscovery.nuclei"));
  for (const n of ["a", "b", "nuclei", "httpx", "subfinder", "katana", "gau", "tlsx", "naabu"]) assert.notEqual(hueOf(n), "red");
});

test("mix", () => {
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mix("#102030", "#102030", 0.3), "#102030");
});

test("committed themes.css is up to date", () =>
  assert.equal(readFileSync(new URL("../app/themes.css", import.meta.url), "utf8"), themeCss()));
