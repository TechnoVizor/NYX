import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREF, parsePref, pickTheme, resolveTheme } from "./theme-pref.ts";

test("resolve", () => {
  assert.equal(resolveTheme(DEFAULT_PREF, false), "nyx");
  assert.equal(resolveTheme({ ...DEFAULT_PREF, mode: "light" }, true), "github-light");
  assert.equal(resolveTheme({ mode: "system", dark: "dracula", light: "catppuccin-latte" }, true), "dracula");
  assert.equal(resolveTheme({ mode: "system", dark: "dracula", light: "catppuccin-latte" }, false), "catppuccin-latte");
});

test("pick switches mode to the theme's kind unless system", () => {
  assert.deepEqual(pickTheme({ ...DEFAULT_PREF, mode: "light" }, "monokai"), { mode: "dark", dark: "monokai", light: "github-light" });
  assert.deepEqual(pickTheme({ ...DEFAULT_PREF, mode: "system" }, "catppuccin-latte"), { mode: "system", dark: "nyx", light: "catppuccin-latte" });
});

test("parsePref falls back on junk", () => {
  for (const raw of [null, "", "{", '{"mode":"neon"}', '{"mode":"dark","dark":"github-light","light":"nyx"}']) assert.deepEqual(parsePref(raw), DEFAULT_PREF);
  assert.deepEqual(parsePref('{"mode":"light","dark":"nord","light":"github-light"}'), { mode: "light", dark: "nord", light: "github-light" });
});

test("boot script resolves like parsePref + resolveTheme", async () => {
  const { runInNewContext } = await import("node:vm");
  const { bootScript } = await import("./theme-pref.ts");
  const cases: [string | null, boolean][] = [[null, true], ["{", false], ['{"mode":"system","dark":"dracula","light":"nord"}', false], ['{"mode":"light","dark":"nord","light":"catppuccin-latte"}', true], ['{"mode":"system","dark":"monokai","light":"github-light"}', true]];
  for (const [raw, dark] of cases) {
    const attrs: Record<string, string> = {};
    const classes = new Set<string>();
    const html = { setAttribute: (k: string, v: string) => (attrs[k] = v), classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) }, style: {} as Record<string, string> };
    runInNewContext(bootScript(), {
      localStorage: { getItem: () => raw },
      matchMedia: () => ({ matches: dark }),
      document: { documentElement: html, querySelector: () => null },
    });
    const want = resolveTheme(parsePref(raw), dark);
    assert.equal(attrs["data-theme"], want, String(raw));
    assert.equal(classes.has("dark"), ["github-light", "catppuccin-latte"].includes(want) === false);
  }
});
