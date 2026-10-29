// Which theme the user wants, per browser. Storage can be missing or throw; junk falls back to the defaults.

import { deriveTokens, THEMES, themeById, type ThemeId } from "./themes.ts";

export type Mode = "light" | "dark" | "system";
export type ThemePref = { mode: Mode; dark: ThemeId; light: ThemeId };

export const PREF_KEY = "nyx-theme";
export const DEFAULT_PREF: ThemePref = { mode: "dark", dark: "nyx", light: "github-light" };

export const resolveTheme = (p: ThemePref, systemDark: boolean): ThemeId =>
  (p.mode === "system" ? systemDark : p.mode === "dark") ? p.dark : p.light;

/** A picked theme fills the slot of its kind; outside System mode it also becomes visible at once. */
export function pickTheme(p: ThemePref, id: ThemeId): ThemePref {
  const kind = themeById(id)!.kind;
  return { ...p, [kind]: id, mode: p.mode === "system" ? "system" : kind };
}

export function parsePref(raw: string | null): ThemePref {
  try {
    const v = JSON.parse(raw ?? "");
    if (!["light", "dark", "system"].includes(v?.mode)) return DEFAULT_PREF;
    const slot = (kind: "light" | "dark") => (themeById(v[kind])?.kind === kind ? v[kind] : DEFAULT_PREF[kind]);
    return { mode: v.mode, dark: slot("dark"), light: slot("light") };
  } catch {
    return DEFAULT_PREF;
  }
}

export function loadPref(): ThemePref {
  try {
    return parsePref(localStorage.getItem(PREF_KEY));
  } catch {
    return DEFAULT_PREF;
  }
}

export function savePref(p: ThemePref): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    // the choice then lasts for this page only
  }
}

/**
 * Runs in <head> before first paint (no React, no imports): the same fallback rules as parsePref + resolveTheme,
 * then the same attributes applyTheme sets. Kept in step with them by theme-pref.test.ts.
 */
export function bootScript(): string {
  const kinds = Object.fromEntries(THEMES.map((t) => [t.id, t.kind]));
  const side = Object.fromEntries(THEMES.map((t) => [t.id, deriveTokens(t).sidebar]));
  return `(function(){var d=${JSON.stringify(DEFAULT_PREF)},k=${JSON.stringify(kinds)},s=${JSON.stringify(side)},p=d;try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(PREF_KEY)})||"");if(v&&["light","dark","system"].indexOf(v.mode)>=0)p={mode:v.mode,dark:k[v.dark]==="dark"?v.dark:d.dark,light:k[v.light]==="light"?v.light:d.light}}catch(e){}var id;try{id=(p.mode==="system"?matchMedia("(prefers-color-scheme: dark)").matches:p.mode==="dark")?p.dark:p.light}catch(e){id=p.dark}var h=document.documentElement;h.setAttribute("data-theme",id);h.classList.toggle("dark",k[id]==="dark");h.style.colorScheme=k[id];var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",s[id])})()`;
}
