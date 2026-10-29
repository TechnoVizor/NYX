"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { DEFAULT_PREF, loadPref, pickTheme, resolveTheme, savePref, type Mode, type ThemePref } from "./theme-pref.ts";
import { deriveTokens, themeById, type Theme, type ThemeId } from "./themes.ts";

type ThemeState = {
  pref: ThemePref;
  systemDark: boolean;
  loaded: boolean;
  setMode: (mode: Mode) => void;
  pick: (id: ThemeId) => void;
};

const store = create<ThemeState>((set) => ({
  pref: DEFAULT_PREF,
  systemDark: true,
  loaded: false,
  setMode: (mode) => set((s) => ({ pref: { ...s.pref, mode } })),
  pick: (id) => set((s) => ({ pref: pickTheme(s.pref, id) })),
}));

export function useTheme(): { pref: ThemePref; systemDark: boolean; theme: Theme; setMode: (m: Mode) => void; pick: (id: ThemeId) => void } {
  const { pref, systemDark, setMode, pick } = store();
  return { pref, systemDark, theme: themeById(resolveTheme(pref, systemDark))!, setMode, pick };
}

/** Sets the theme on <html> the way the boot script does; crossfades unless motion is reduced. */
export function applyTheme(id: ThemeId): void {
  const html = document.documentElement;
  if (html.getAttribute("data-theme") === id) return;
  const theme = themeById(id)!;
  const set = () => {
    html.setAttribute("data-theme", id);
    html.classList.toggle("dark", theme.kind === "dark");
    html.style.colorScheme = theme.kind;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", deriveTokens(theme).sidebar);
  };
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(set);
  else set();
}

/** Mounted once in Providers: loads the saved choice, follows the OS in System mode, applies and saves changes. */
export function ThemeSync() {
  const pref = store((s) => s.pref);
  const systemDark = store((s) => s.systemDark);
  const loaded = store((s) => s.loaded);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => store.setState({ systemDark: mq.matches });
    store.setState({ pref: loadPref(), systemDark: mq.matches, loaded: true });
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    // Before the saved choice is read the store holds defaults; the boot script has already painted the real theme.
    if (!loaded) return;
    applyTheme(resolveTheme(pref, systemDark));
    savePref(pref);
  }, [pref, systemDark, loaded]);

  return null;
}
