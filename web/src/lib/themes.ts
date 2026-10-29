// Themes as data. Each theme gives ~20 inputs; deriveTokens() turns them into every CSS token the components use,
// scripts/themes.ts writes them to app/themes.css, and themes.test.ts checks the same values for contrast.
// IDE palettes are MIT-licensed (sources in the spec); values nudged for WCAG AA are marked "adapted".

import { mix } from "./contrast.ts";

export type ThemeId =
  | "nyx"
  | "github-dark"
  | "github-light"
  | "one-dark"
  | "monokai"
  | "dracula"
  | "nord"
  | "catppuccin-mocha"
  | "catppuccin-latte";

type Hue = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

export type ThemeInput = Record<
  "bg" | "side" | "panel" | "fg" | "muted" | "border" | "accent" | "onAccent" | "primary" | "onPrimary" | "bar" | "onBar" | "barAlert" | "onBarAlert" | Hue,
  string
>;

const TOKENS = [
  "background", "surface-1", "surface-2", "surface-3", "foreground", "muted-foreground", "subtle",
  "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground",
  "secondary", "secondary-foreground", "muted", "accent", "accent-foreground", "destructive",
  "border", "border-strong", "input", "ring", "brand", "brand-soft",
  "sev-critical", "sev-high", "sev-medium", "sev-low", "sev-info",
  "sev-critical-soft", "sev-high-soft", "sev-medium-soft", "sev-low-soft", "sev-info-soft",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
  "bar", "on-bar", "bar-alert", "on-bar-alert",
] as const;
export type TokenName = (typeof TOKENS)[number];

export type Theme = { id: ThemeId; name: string; kind: "light" | "dark"; input: ThemeInput; overrides?: Partial<Record<TokenName, string>> };

export const THEMES: Theme[] = [
  {
    id: "nyx",
    name: "NYX",
    kind: "dark",
    input: {
      bg: "#050506", side: "#0a0a0c", panel: "#101014", fg: "#f4f4f5", muted: "#a1a1aa", border: "#19191c",
      accent: "#8ea2ff", onAccent: "#08080a", primary: "#f4f4f5", onPrimary: "#08080a",
      bar: "#8ea2ff", onBar: "#08080a", barAlert: "#ff5d62", onBarAlert: "#08080a",
      red: "#ff5d62", orange: "#ff9b52", yellow: "#e6c95c", green: "#55c991", blue: "#72a8ff", purple: "#b392ff",
    },
    overrides: { "surface-1": "#0a0a0c", "surface-3": "#16161b", subtle: "#8e8e97", input: "#68686f", "border-strong": "#232327" },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    kind: "dark",
    input: {
      bg: "#0d1117", side: "#010409", panel: "#161b22", fg: "#e6edf3", muted: "#8d96a0", border: "#30363d",
      accent: "#4493f8", onAccent: "#0d1117", primary: "#4493f8", onPrimary: "#0d1117",
      bar: "#1f6feb", onBar: "#ffffff", barAlert: "#da3633", onBarAlert: "#ffffff",
      red: "#f85149", orange: "#db6d28", yellow: "#d29922", green: "#3fb950", blue: "#4493f8", purple: "#ab7df8",
    },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    kind: "light",
    input: {
      bg: "#ffffff", side: "#f6f8fa", panel: "#f6f8fa", fg: "#1f2328", muted: "#59636e", border: "#d0d7de",
      accent: "#0967d6" /* adapted: #0969da */, onAccent: "#ffffff", primary: "#0967d6", onPrimary: "#ffffff",
      bar: "#0967d6", onBar: "#ffffff", barAlert: "#cf222e", onBarAlert: "#ffffff",
      red: "#cb212d" /* adapted: #cf222e */, orange: "#b44900" /* adapted: #bc4c00 */, yellow: "#916100" /* adapted: #9a6700 */, green: "#197b35" /* adapted: #1a7f37 */, blue: "#0967d6" /* adapted: #0969da */, purple: "#8250df",
    },
  },
  {
    id: "one-dark",
    name: "One Dark",
    kind: "dark",
    input: {
      bg: "#282c34", side: "#21252b", panel: "#2c313a", fg: "#abb2bf", muted: "#9da5b4", border: "#3e4452",
      accent: "#61afef", onAccent: "#21252b", primary: "#61afef", onPrimary: "#21252b",
      bar: "#61afef", onBar: "#21252b", barAlert: "#e06c75", onBarAlert: "#21252b",
      red: "#e6888f" /* adapted: #e06c75 */, orange: "#d19a66", yellow: "#e5c07b", green: "#98c379", blue: "#61afef", purple: "#c678dd",
    },
    overrides: { input: mix("#3e4452", "#abb2bf", 0.5) }, // adapted: control boundary 3:1
  },
  {
    id: "monokai",
    name: "Monokai",
    kind: "dark",
    input: {
      bg: "#272822", side: "#1e1f1c", panel: "#31322b", fg: "#f8f8f2", muted: "#aba68e" /* adapted: #a59f85 */, border: "#414339",
      accent: "#a6e22e", onAccent: "#272822", primary: "#a6e22e", onPrimary: "#272822",
      bar: "#a6e22e", onBar: "#272822", barAlert: "#fa4989" /* adapted: #f92672 */, onBarAlert: "#272822",
      red: "#fb7ba9" /* adapted: #f92672 */, orange: "#fd971f", yellow: "#e6db74", green: "#a6e22e", blue: "#66d9ef", purple: "#ae81ff",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    kind: "dark",
    input: {
      bg: "#282a36", side: "#21222c", panel: "#303241", fg: "#f8f8f2", muted: "#9ea8c7", border: "#44475a",
      accent: "#bd93f9", onAccent: "#21222c", primary: "#bd93f9", onPrimary: "#21222c",
      bar: "#bd93f9", onBar: "#21222c", barAlert: "#ff5555", onBarAlert: "#21222c",
      red: "#ff8181" /* adapted: #ff5555 */, orange: "#ffb86c", yellow: "#f1fa8c", green: "#50fa7b", blue: "#8be9fd", purple: "#bd93f9",
    },
  },
  {
    id: "nord",
    name: "Nord",
    kind: "dark",
    input: {
      bg: "#2e3440", side: "#272c36", panel: "#3b4252", fg: "#eceff4", muted: "#b4bbc8" /* adapted: #a3abbb */, border: "#434c5e",
      accent: "#8dc3d2" /* adapted: #88c0d0 */, onAccent: "#2e3440", primary: "#8dc3d2", onPrimary: "#2e3440",
      bar: "#8dc3d2", onBar: "#2e3440", barAlert: "#a6545c" /* adapted: #bf616a */, onBarAlert: "#eceff4",
      red: "#deaeb3" /* adapted: #bf616a */, orange: "#e0af9f" /* adapted: #d08770 */, yellow: "#ebcb8b", green: "#a9c293" /* adapted: #a3be8c */, blue: "#a7bdd4" /* adapted: #81a1c1 */, purple: "#b48ead",
    },
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    kind: "dark",
    input: {
      bg: "#1e1e2e", side: "#181825", panel: "#262637", fg: "#cdd6f4", muted: "#a6adc8", border: "#313244",
      accent: "#cba6f7", onAccent: "#1e1e2e", primary: "#cba6f7", onPrimary: "#1e1e2e",
      bar: "#cba6f7", onBar: "#1e1e2e", barAlert: "#f38ba8", onBarAlert: "#1e1e2e",
      red: "#f38ba8", orange: "#fab387", yellow: "#f9e2af", green: "#a6e3a1", blue: "#89b4fa", purple: "#cba6f7",
    },
  },
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    kind: "light",
    input: {
      bg: "#eff1f5", side: "#e6e9ef", panel: "#e6e9ef", fg: "#4c4f69", muted: "#5c5f77", border: "#ccd0da",
      accent: "#8036e1" /* adapted: #8839ef */, onAccent: "#ffffff", primary: "#8036e1", onPrimary: "#ffffff",
      bar: "#8036e1", onBar: "#ffffff", barAlert: "#d20f39", onBarAlert: "#ffffff",
      red: "#bf0e34" /* adapted: #d20f39 */, orange: "#a84207" /* adapted: #fe640b */, yellow: "#8a5812" /* adapted: #df8e1d */, green: "#2d701e" /* adapted: #40a02b */, blue: "#1a59d5" /* adapted: #1e66f5 */, purple: "#8839ef",
    },
    overrides: { input: mix("#ccd0da", "#4c4f69", 0.6) }, // adapted: control boundary 3:1
  },
];

export const themeById = (id: string): Theme | undefined => THEMES.find((t) => t.id === id);

export function deriveTokens({ input: i, overrides }: Theme): Record<TokenName, string> {
  const surface1 = mix(i.bg, i.fg, 0.03);
  const surface3 = mix(i.panel, i.fg, 0.05);
  const hover = mix(i.bg, i.fg, 0.06);
  const sev = { critical: i.red, high: i.orange, medium: i.yellow, low: i.green, info: i.blue };
  const t: Record<TokenName, string> = {
    background: i.bg, "surface-1": surface1, "surface-2": i.panel, "surface-3": surface3,
    foreground: i.fg, "muted-foreground": i.muted, subtle: i.muted,
    card: surface1, "card-foreground": i.fg, popover: i.panel, "popover-foreground": i.fg,
    primary: i.primary, "primary-foreground": i.onPrimary,
    secondary: surface3, "secondary-foreground": i.fg, muted: surface3,
    accent: hover, "accent-foreground": i.fg, destructive: i.red,
    border: i.border, "border-strong": mix(i.border, i.fg, 0.15), input: mix(i.border, i.fg, 0.4),
    ring: i.accent, brand: i.accent, "brand-soft": mix(i.bg, i.accent, 0.14),
    "sev-critical": sev.critical, "sev-high": sev.high, "sev-medium": sev.medium, "sev-low": sev.low, "sev-info": sev.info,
    "sev-critical-soft": mix(i.bg, sev.critical, 0.12), "sev-high-soft": mix(i.bg, sev.high, 0.12),
    "sev-medium-soft": mix(i.bg, sev.medium, 0.12), "sev-low-soft": mix(i.bg, sev.low, 0.12), "sev-info-soft": mix(i.bg, sev.info, 0.12),
    "chart-1": i.accent, "chart-2": i.blue, "chart-3": i.green, "chart-4": i.yellow, "chart-5": i.orange,
    sidebar: i.side, "sidebar-foreground": i.fg, "sidebar-primary": i.accent, "sidebar-primary-foreground": i.onAccent,
    "sidebar-accent": hover, "sidebar-accent-foreground": i.fg, "sidebar-border": i.border, "sidebar-ring": i.accent,
    bar: i.bar, "on-bar": i.onBar, "bar-alert": i.barAlert, "on-bar-alert": i.onBarAlert,
  };
  return { ...t, ...overrides };
}

/** Stable theme hue for a name, so a plugin keeps its colour across screens. */
export function hueOf(name: string): Hue {
  const hues: Hue[] = ["red", "orange", "yellow", "green", "blue", "purple"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return hues[h % hues.length];
}
