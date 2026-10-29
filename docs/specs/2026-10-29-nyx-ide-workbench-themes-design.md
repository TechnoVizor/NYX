# NYX workbench: IDE shell, themes, less text

Date: 2026-10-29. Status: direction agreed in chat from the mockup (`.superpowers/brainstorm/…/workbench.html`, Findings screen in 8 themes); pending written review. Part 1 of 2: part 2 ("Findings like a CRM": grouping by issue, side peek panel, saved views, triage with reasons, bulk actions) gets its own spec next.

## Why

The owner says the workspace "doesn't look good", has "still too much text — the user will go crazy", and should feel like the most convenient CRM with a VS Code / IDE vibe, with IDE themes to choose from. Today: pure black, every block a card, a 240px text sidebar, page subtitles on every screen, a hero-metric row on Home, status shown as coloured words. Research (Attio, Twenty, Linear, GitHub code scanning, VS Code, Zed, Warp) points at the same few moves: an icon rail, a status bar that shows live state, a command palette for everything, themes as data with live preview, colour and icons carrying state.

Audience and product truth: `PRODUCT.md`.

Success:

1. Any screen, with labels hidden, reads as an IDE-style workbench: icon rail, breadcrumbs, status bar.
2. A user switches between 9 themes and Light/Dark/System in Settings → Appearance or from Ctrl+K, sees the result immediately, and it survives reload with no flash of the wrong theme.
3. Every theme passes the contrast test (4.5:1 text, 3:1 controls/focus) — enforced per theme in CI.
4. Each screen loses its explanatory sentences; status, severity, kind and tool are shown by colour + icon (+ one word where needed).

## Goals

- Theme system: themes as data, Light/Dark/System with a light slot and a dark slot.
- Settings → Appearance (Settings returns to navigation with this one tab).
- IDE shell: activity rail, top bar with breadcrumbs, status bar.
- Text diet and colour pass across the existing screens.

## Non-goals

- Part 2 work: findings grouping, peek panel, saved views, triage reasons, bulk actions, secondary sidebar with views/target tree (the mockup shows it; it lands with part 2).
- Editor tabs, explorer tree, split panes — they add little to a CRUD workspace.
- Server-side preference storage (per-user, synced across devices).
- Custom theme editor or importing VS Code theme JSON.
- Theming the login page: it stays NYX dark (brand surface, no user yet).
- Translating UI copy.

## Anti-goals

- A theme that ships failing contrast "because that's how Monokai looks". Palettes are adapted until they pass; adaptations are listed beside the theme data.
- A flash of the default theme on load, or a theme switch that needs Save or reload.
- Animation on things used dozens of times a day (Ctrl+K, rail clicks, status bar).
- Colour as the only signal: every coloured state keeps an icon or a word.
- Losing anything that works today: the guided tour, mobile nav, command palette, roles (viewer sees no New scan).

## 1. Themes

**Model.** A theme is a small object: id, name, kind (`light` | `dark`), and ~15 inputs — `bg`, `side` (rail/top bar), `panel` (raised surfaces, popovers), `fg`, `muted`, `border`, `accent`, `onAccent`, and the hues `red`, `orange`, `yellow`, `green`, `blue`, `purple`. Every existing token (`--background`, `--surface-1..3`, `--card`, `--popover`, `--muted-foreground`, `--subtle`, `--border`, `--border-strong`, `--input`, `--ring`, `--brand`, `--brand-soft`, `--sev-*`, `--chart-*`, `--sidebar-*`, `--primary`, `--destructive`, `--accent`) is derived from these inputs in one shared mapping (CSS `color-mix` where a tint is needed), so components do not change to support a theme. Severity: critical=red, high=orange, medium=yellow, low=green, info=blue.

**Themes (9).**

| id | name | kind | source palette (MIT) |
|---|---|---|---|
| `nyx` | NYX | dark | today's tokens (#050506 ground, #8ea2ff brand) — the default |
| `github-dark` | GitHub Dark | dark | primer/github-vscode-theme |
| `github-light` | GitHub Light | light | primer/github-vscode-theme |
| `one-dark` | One Dark | dark | Binaryify/OneDark-Pro |
| `monokai` | Monokai | dark | microsoft/vscode theme-monokai |
| `dracula` | Dracula | dark | dracula/visual-studio-code |
| `nord` | Nord | dark | nordtheme |
| `catppuccin-mocha` | Catppuccin Mocha | dark | catppuccin/palette |
| `catppuccin-latte` | Catppuccin Latte | light | catppuccin/palette |

Starting hex values are in the research table (bg/sidebar/fg/muted/border/accent/hues); values marked unverified there are checked against the source file before use. Where a value fails contrast it is nudged (lightness only, hue kept) and the change noted next to the theme.

**Preference.** `{ mode: "light" | "dark" | "system", dark: ThemeId, light: ThemeId }`, defaults `{ mode: "dark", dark: "nyx", light: "github-light" }`. Stored in the browser (`localStorage`, key `nyx-theme`, wrapped in try/catch like the tour). System mode follows `prefers-color-scheme` live.

**Picking a theme** (one rule for the Appearance grids and Ctrl+K): the theme goes into the slot of its kind. If mode is Light or Dark, mode also switches to that theme's kind, so the pick is always visible at once. If mode is System, only the slot changes; the grid of the kind the OS is showing right now is marked "Active now", the other "Used when your system is light/dark".

**Applying.** The resolved theme id is set as `data-theme` on `<html>`, plus `color-scheme` and the `dark` class for dark themes. A tiny inline script in the root layout's `<head>` resolves it before first paint (no flash). `viewport.themeColor` follows the active theme's `side` value at runtime.

**Switch motion.** Theme change crossfades the page via the View Transitions API (~150ms, ease-out) when available and motion is allowed; otherwise instant.

**Where themes live.** Theme inputs and the derivation formulas live in one TypeScript module (`web/src/lib/themes.ts`) — the single source. The `[data-theme]` CSS is written from it (a small generator script run by `pnpm themes`, output committed as `web/src/app/themes.css`; a test fails if the committed file is stale). This lets the test check derived tokens with the same formulas the CSS uses. The old `tokens()` parser of the first `:root` block is retired.

**Contrast test** (extends, never weakens, today's guarantees), for every theme:
- text 4.5:1 — `--foreground`, `--muted-foreground`, `--subtle`, `--brand`, and the five `--sev-*` on every surface (`--background`, `--surface-1`, `--surface-2`, `--surface-3`);
- severity and status pills — each hue as text on its own tinted pill background ≥ 4.5:1;
- `--primary-foreground` on `--primary` and status-bar text on each status-bar background (see §3) ≥ 4.5:1;
- `--input` and `--ring` on `--background` and `--surface-1` ≥ 3:1.
A theme added without passing fails CI.

## 2. Settings → Appearance

Route `/app/settings/appearance`; the gear at the bottom of the rail opens it. Settings' other placeholder tabs stay hidden; the Settings sub-nav shows Appearance only.

- **Mode:** a 3-way segmented control with icons — Light (sun), Dark (moon), System (monitor).
- **Dark theme** and **Light theme:** two grids of preview cards. Each card is a miniature workbench (rail, a few rows with severity pills, status bar) rendered in that theme's own tokens by scoping `data-theme` on the card, with the theme name under it. The selected card has a check and an accent ring. Clicking applies immediately; no Save.
- Hovering or arrow-focusing a card does not preview the whole app (keeps it calm); the card itself is the preview.
- Viewer, operator and admin all can change it (it is personal).

Command palette gets "Theme: <name>" entries (all 9) and "Theme mode: Light / Dark / System", applying immediately.

## 3. IDE shell

**Activity rail** (≥ md): 48px icon column replacing the 240px text sidebar and its Collapse.
- Top: New scan (accent `+` button; hidden for viewers, as today).
- Path items: Home, Targets, Scans, Findings, Assets; then Scan profiles, Plugins; bottom: Settings.
- Every icon has a tooltip with its name (and the tour step number for Targets–Assets, e.g. "2 · Scans").
- Active item: accent-coloured icon on an accent tint, plus `aria-current` (not colour alone — the tint is a shape).
- Findings shows a badge with open critical+high count (red), hidden at 0.
- `data-tour` anchors move onto the rail icons so the tour still spotlights them.

**Top bar:** breadcrumbs on the left (section › record, e.g. `Scans › testbed.nyx-lab.test`; record names in mono), search / Ctrl+K in the middle-right, the tour "?" button, and an avatar button (initial on a coloured circle) whose menu shows email + role and Sign out. The email-and-Sign-out text block goes away.

**Status bar** (≥ md, 24px, full width at the bottom). Its colours are theme inputs — `bar`/`onBar` (normal) and `barAlert`/`onBarAlert` (failed) — tested like the rest; they may differ from `accent` where a theme's accent cannot carry readable text.
- left: running scans — spinner + newest running scan's target + "3/8 tools", linking to it; "+N" when more run at once. When none run: a quiet "Idle" with a check.
- next: open critical+high count with a shield icon, linking to Findings filtered to it (same numbers as the dashboard's open-by-severity).
- right: theme name with palette icon (opens Appearance), and `Ctrl K`.
- Signature move: the bar is the live state of the workspace, like VS Code's bar in debug mode. Running keeps the normal colour and changes the content. If the newest scan in the workspace ended `FAILED` (not Partial or Cancelled), the bar switches to `barAlert` with "Scan failed · <target>" linking to it, until this browser has opened that scan's page (remembered in `localStorage`, key `nyx-seen-failed`, the scan id).

**Mobile** (< md): rail and status bar hidden; today's bottom bar and More sheet stay, restyled to the theme tokens; breadcrumbs collapse to the current section name.

## 4. Text diet and colour

Applies to Home, Targets, Scans, scan detail, Findings, finding detail, Assets, Scan profiles, Plugins.

- Remove page subtitles ("Every scan and how it ended." etc.). The page title stays (it is the breadcrumb's last part on desktop and the heading for screen readers).
- Statuses get a coloured icon + word: Completed (green check), Partial (orange half-circle), Failed (red x), Cancelled (muted slash), Running (blue spinner), Queued (muted clock). Finding statuses keep all five API values and their words: Open (blue), Confirmed (yellow), Fixed (green), False positive (muted, crossed circle), Accepted risk (muted, shield-off). Paused and Created scans: muted pause / muted clock. Whether false positive and accepted risk become dismiss *reasons* is a part 2 question.
- Plugins get a coloured letter tile (N = Nuclei, S = Subfinder, …) with the name in its tooltip; the colour is a stable pick from the theme hues.
- Asset kinds keep their icons and get kind colours.
- Home: the four metric cards become one compact strip of colour-coded stats (icon, number, short label), each a link to the filtered list; card shells around blocks are replaced by plain sections with a heading and a hairline where they add nothing.
- Empty states: icon + one line + one action.
- Long explanatory copy that must stay (e.g. scope rules) moves behind an info icon tooltip.

## 5. Constraints

- Next.js 16.3, React 19, Tailwind 4 tokens in `globals.css`, base-ui shadcn components, `motion` 14. No new dependencies.
- No text below 12px; existing contrast and nav tests keep passing.
- Motion: ease-out curves, ≤ 250ms, none on Ctrl+K / rail / status bar; `prefers-reduced-motion` honoured.
- Verified with Playwright screenshots at 1400 and 390 widths in at least NYX, GitHub Light and Monokai; a fresh reviewer at the end.

## 6. Left to the builder

Exact derived-token formulas, icon choices within lucide, spacing, which hue each plugin gets, the active-scans polling interval (reuse existing queries where possible), how the preview card miniature is drawn.

## Calls I made (not discussed)

- NYX's current palette stays as theme `nyx` and is the default dark theme; GitHub Light is the default light theme.
- Preference lives in the browser only.
- Appearance cards preview themselves; the whole app changes only on click.
- Login page is not themed.
- The secondary sidebar from the mockup (views, target tree) ships with part 2, where its content exists.
- Picking a theme of the other kind switches mode (unless System) so the pick is visible.
- Themes are TS data with generated CSS, so derived tokens can be tested.
- The status bar turns red only for `FAILED`, workspace-wide, until this browser opens that scan.
- False positive and Accepted risk keep their own labels.
