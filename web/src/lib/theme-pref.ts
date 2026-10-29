// Which theme the user wants, per browser. Storage can be missing or throw; junk falls back to the defaults.

import { themeById, type ThemeId } from "./themes.ts";

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
