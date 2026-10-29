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
