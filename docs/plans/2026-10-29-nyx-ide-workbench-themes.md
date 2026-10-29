# NYX workbench (IDE shell, themes, less text) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the NYX workspace an IDE-style shell (icon rail, breadcrumbs, live status bar), 9 switchable themes with Settings → Appearance, and a colour-and-icon pass that removes explanatory text.

**Architecture:** Themes are TypeScript data (`web/src/lib/themes.ts`); one derivation turns ~17 inputs into every existing CSS token as hex, a generator writes `web/src/app/themes.css` (`[data-theme="<id>"]` blocks), and the per-theme contrast test uses the same derivation. Preference logic is pure (`theme-pref.ts`), applied by an inline head script before paint and a `useTheme` hook after. Shell pieces (rail, top bar, status bar) replace `Sidebar`; their logic (breadcrumbs, status-bar state) is pure and unit-tested.

**Tech Stack:** Next.js 16.3 (read `web/node_modules/next/dist/docs` before touching layout/head APIs), React 19, Tailwind 4, base-ui shadcn components, lucide-react, `motion` 14, TanStack Query, zustand, `node --test` with TS type stripping (tests import siblings with `.ts`).

**Spec:** `docs/specs/2026-10-29-nyx-ide-workbench-themes-design.md` (product context: `PRODUCT.md`).

## Global Constraints

- No new dependencies.
- UI copy in English; commits in English.
- WCAG 2.2 AA in every theme: text 4.5:1, control boundaries and focus 3:1, nothing below 12px (existing `text-[9|10|11px]` test stays).
- Colour is never the only signal: every coloured state keeps an icon or a word.
- Motion: ease-out curves (`cubic-bezier(0.23, 1, 0.32, 1)`), ≤ 250ms; no animation on Ctrl+K, rail clicks or the status bar; `prefers-reduced-motion` honoured.
- localStorage access wrapped in try/catch (pattern: `web/src/lib/tour/storage.ts`).
- Login page and `(auth)` routes stay NYX dark regardless of preference.
- Keep working: guided tour (`data-tour` anchors), mobile nav, command palette, viewer role hides New scan.
- No menu item, tab or link leads to a `PlaceholderPage` (`nav.test.ts`).

## Review Focus

1. Corrupt or old `nyx-theme` value in localStorage (bad JSON, unknown theme id) → falls back to defaults, no crash, no blank page. Pinned in Task 2.
2. System mode with the OS switching light/dark while the app is open → theme follows live without reload. Pinned in Task 3 (Playwright `emulate_media`).
3. A theme whose accent cannot carry white text (GitHub Dark `#2f81f7`) → status bar and primary buttons still pass because `bar`/`onBar` and `primary` are separate tested inputs. Pinned in Task 1.
4. Several scans running plus an older failed scan → bar shows newest running + "+N", not the alert; alert only when the newest scan overall is FAILED and unseen. Pinned in Task 6.
5. Tour on the new rail: every `nav-*` anchor still exists exactly once among visible elements at 1400 and 390. Pinned in Task 5 Playwright check.

---

### Task 1: Theme data, derivation, per-theme contrast

**Files:**
- Create: `web/src/lib/themes.ts`
- Create: `web/src/lib/themes.test.ts`
- Modify: `web/src/lib/contrast.ts` (drop `tokens()`, add `mix()`)
- Modify: `web/src/lib/contrast.test.ts` (keep only the 12px test)

**Interfaces:**
- Produces:
  - `type ThemeId = "nyx" | "github-dark" | "github-light" | "one-dark" | "monokai" | "dracula" | "nord" | "catppuccin-mocha" | "catppuccin-latte"`
  - `type ThemeInput = { bg; side; panel; fg; muted; border; accent; onAccent; primary; onPrimary; bar; onBar; barAlert; onBarAlert; red; orange; yellow; green; blue; purple: string }` (all `#rrggbb`)
  - `type Theme = { id: ThemeId; name: string; kind: "light" | "dark"; input: ThemeInput; overrides?: Partial<Record<TokenName, string>> }`
  - `const THEMES: Theme[]` (order = spec table), `themeById(id: string): Theme | undefined`
  - `type TokenName` = the CSS custom properties below without `--`
  - `deriveTokens(t: Theme): Record<TokenName, string>` — every value `#rrggbb`
  - `hueOf(name: string): "red" | "orange" | "yellow" | "green" | "blue" | "purple"` — stable pick for plugin tiles (hash of name)
  - in `contrast.ts`: `mix(a: string, b: string, p: number): string` — sRGB channel interpolation, `p` = share of `b`

- [ ] **Step 1: Write the failing tests** in `themes.test.ts`:

```ts
const SURFACES = ["background", "surface-1", "surface-2", "surface-3"] as const;
const TEXT = ["foreground", "muted-foreground", "subtle", "brand", "sev-critical", "sev-high", "sev-medium", "sev-low", "sev-info"] as const;

test("nine themes in spec order", () =>
  assert.deepEqual(THEMES.map((t) => t.id), ["nyx", "github-dark", "github-light", "one-dark", "monokai", "dracula", "nord", "catppuccin-mocha", "catppuccin-latte"]));

for (const theme of THEMES) {
  const k = deriveTokens(theme);
  test(`${theme.id}: text reaches 4.5:1 on every surface`, () => { for (const fg of TEXT) for (const bg of SURFACES) assert.ok(contrast(k[fg], k[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(k[fg], k[bg]).toFixed(2)}`); });
  test(`${theme.id}: severity text on its own pill`, () => { for (const s of ["critical", "high", "medium", "low", "info"]) assert.ok(contrast(k[`sev-${s}`], k[`sev-${s}-soft`]) >= 4.5); });
  test(`${theme.id}: filled controls and status bar`, () => {
    for (const [fg, bg] of [["primary-foreground", "primary"], ["on-bar", "bar"], ["on-bar-alert", "bar-alert"], ["sidebar-primary-foreground", "sidebar-primary"]]) assert.ok(contrast(k[fg], k[bg]) >= 4.5, `${fg} on ${bg}`);
  });
  test(`${theme.id}: control boundaries and focus reach 3:1`, () => { for (const fg of ["input", "ring"]) for (const bg of ["background", "surface-1"]) assert.ok(contrast(k[fg], k[bg]) >= 3); });
}

test("nyx keeps today's palette", () => {
  const k = deriveTokens(themeById("nyx")!);
  assert.equal(k.background, "#050506"); assert.equal(k.brand, "#8ea2ff"); assert.equal(k["sev-critical"], "#ff5d62");
});
test("hueOf is stable", () => assert.equal(hueOf("projectdiscovery.nuclei"), hueOf("projectdiscovery.nuclei")));
test("mix", () => { assert.equal(mix("#000000", "#ffffff", 0.5), "#808080"); assert.equal(mix("#102030", "#102030", 0.3), "#102030"); });
```

- [ ] **Step 2: Run** `cd web && pnpm test` — Expected: FAIL, `themes.ts` not found.

- [ ] **Step 3: Implement `themes.ts` and `mix()`.** Tokens produced (every one `globals.css` `:root` has today, plus new): `background surface-1 surface-2 surface-3 foreground muted-foreground subtle card card-foreground popover popover-foreground primary primary-foreground secondary secondary-foreground muted accent accent-foreground destructive border border-strong input ring brand brand-soft sev-{critical,high,medium,low,info} sev-{…}-soft chart-1..5 sidebar sidebar-foreground sidebar-primary sidebar-primary-foreground sidebar-accent sidebar-accent-foreground sidebar-border sidebar-ring bar on-bar bar-alert on-bar-alert`. Starting formulas (tune with a ledger ruling if a theme fails):

| token | formula |
|---|---|
| background / surface-1 / surface-2 / surface-3 | `bg` / `mix(bg, fg, .03)` / `panel` / `mix(panel, fg, .05)` |
| foreground, muted-foreground, subtle | `fg`, `muted`, `muted` |
| card, popover, secondary, muted | surface-1, surface-2, surface-3, surface-3 |
| primary / primary-foreground | `primary` / `onPrimary` |
| accent (hover tint), sidebar-accent | `mix(bg, fg, .06)` |
| border / border-strong / input | `border` / `mix(border, fg, .15)` / `mix(border, fg, .35)` |
| ring, brand, sidebar-primary / its foreground | `accent` / `onAccent` |
| brand-soft | `mix(bg, accent, .14)` |
| sev-critical/high/medium/low/info, destructive | red/orange/yellow/green/blue, red |
| sev-*-soft | `mix(bg, hue, .15)` |
| chart-1..5 | accent, blue, green, yellow, orange |
| sidebar | `side` |
| bar, on-bar, bar-alert, on-bar-alert | inputs |

Inputs: NYX from today's `:root` (via `overrides` where the formula differs, e.g. surfaces `#0a0a0c #101014 #16161b`, `subtle #8e8e97`, `input #68686f`); IDE themes from the research palettes (in the spec's source repos; values the research marked unverified — Monokai orange/blue, One Dark red/yellow/green/blue/border/accent — are checked against the source file). A value that fails is nudged in lightness only, with a one-line `// adapted: muted #88846f → #a59f85 for 4.5:1` comment beside it. Unused `--chart`/`--sidebar` names stay so components need no change.

- [ ] **Step 4: Run** `pnpm test` — Expected: all theme tests PASS; 12px test PASS.

- [ ] **Step 5: Commit** `feat(web): theme data and per-theme contrast test`

### Task 2: Generated theme CSS and preference logic

**Files:**
- Create: `web/scripts/themes.ts` (writes the CSS), `web/src/app/themes.css` (generated, committed)
- Create: `web/src/lib/theme-pref.ts`, `web/src/lib/theme-pref.test.ts`
- Modify: `web/src/lib/themes.ts` (add `themeCss()`), `web/src/app/globals.css`, `web/package.json` (script `"themes": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/themes.ts"`)

**Interfaces:**
- Consumes: Task 1 `THEMES`, `deriveTokens`, `themeById`.
- Produces:
  - `themeCss(): string` — `:root, [data-theme="nyx"] { … }` then one `[data-theme="<id>"] { color-scheme: light|dark; --<token>: #hex; … }` per theme.
  - `type Mode = "light" | "dark" | "system"`; `type ThemePref = { mode: Mode; dark: ThemeId; light: ThemeId }`; `DEFAULT_PREF = { mode: "dark", dark: "nyx", light: "github-light" }`; `PREF_KEY = "nyx-theme"`
  - `resolveTheme(p: ThemePref, systemDark: boolean): ThemeId`
  - `pickTheme(p: ThemePref, id: ThemeId): ThemePref`
  - `parsePref(raw: string | null): ThemePref` (never throws)
  - `loadPref(): ThemePref`, `savePref(p: ThemePref): void` (try/catch)

- [ ] **Step 1: Failing tests** in `theme-pref.test.ts` and an added case in `themes.test.ts`:

```ts
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
// themes.test.ts
test("committed themes.css is up to date", () => assert.equal(readFileSync(new URL("../app/themes.css", import.meta.url), "utf8"), themeCss()));
```
(`parsePref` field-wise: a slot holding a theme of the wrong kind falls back to that slot's default; the 5th junk case resets both slots.)

- [ ] **Step 2: Run** `pnpm test` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement**, run `pnpm themes`, then in `globals.css`: `@import "./themes.css";`, delete the colour tokens from `:root` (keep `--radius`), replace hard-coded `rgb(255 255 255 / x)` (scrollbar, selection, `.bg-grid`) with `color-mix(in srgb, var(--foreground) x%, transparent)`, update the "dark-only" comment. In `(auth)` layout or login root element set `data-theme="nyx"` so it stays dark.
- [ ] **Step 4: Run** `pnpm test && pnpm lint && pnpm build` — Expected: PASS; app looks unchanged in NYX (screenshot `/app/dashboard` 1400 vs `now-app_dashboard-1400.png` in the scratchpad).
- [ ] **Step 5: Commit** `feat(web): generated theme css and theme preference`

### Task 3: Apply the theme (no flash, system follow, crossfade)

**Files:**
- Create: `web/src/lib/use-theme.ts`
- Modify: `web/src/app/layout.tsx`, `web/src/providers/providers.tsx`

**Interfaces:**
- Consumes: Task 2 `loadPref`, `savePref`, `resolveTheme`, `pickTheme`, `PREF_KEY`, `DEFAULT_PREF`; Task 1 `themeById`.
- Produces: `useTheme(): { pref: ThemePref; theme: Theme; setMode(m: Mode): void; pick(id: ThemeId): void }` (zustand store so the rail, status bar, palette and Appearance share it); `applyTheme(id: ThemeId): void` sets `data-theme`, toggles the `dark` class by kind, sets `color-scheme`, updates `<meta name="theme-color">` to the theme's `side`, wraps the change in `document.startViewTransition` (150ms crossfade, ease-out, via `::view-transition-old/new(root)` CSS) unless reduced motion or unsupported.

- [ ] **Step 1:** Inline boot script in `<head>` of `app/layout.tsx` (a string built from `PREF_KEY`, `DEFAULT_PREF` and the id→kind map; no imports at runtime): reads localStorage in try/catch, resolves with `matchMedia('(prefers-color-scheme: dark)')`, sets `data-theme` + class + `color-scheme` on `<html>`. Remove the hard-coded `dark` class and `colorScheme: "dark"` from `viewport`; add `suppressHydrationWarning` to `<html>`.
- [ ] **Step 2:** `useTheme` store + a `ThemeSync` component in `Providers` that applies on change and listens to the media query in system mode.
- [ ] **Step 3: Verify** with a Playwright script (scratchpad): set `localStorage['nyx-theme']` to GitHub Light, reload `/app/dashboard`, assert `html[data-theme=github-light]` at `domcontentloaded` and body background `rgb(255, 255, 255)`; set system mode, `page.emulate_media(color_scheme="light")` → `github-light`, then `"dark"` → `nyx` without reload; set junk JSON → `nyx`. Expected: all assertions pass, no console errors.
- [ ] **Step 4:** `pnpm test && pnpm lint` PASS. **Commit** `feat(web): apply theme before paint and follow system`

### Task 4: Settings → Appearance and theme commands

**Files:**
- Create: `web/src/app/app/settings/appearance/page.tsx`, `web/src/components/settings/appearance-view.tsx`, `web/src/components/settings/theme-card.tsx`
- Modify: `web/src/lib/nav.ts` (`settingsTabs = [{ label: "Appearance", href: "/app/settings/appearance" }]`), `web/src/app/app/settings/page.tsx` if present else add a redirect `/app/settings` → appearance, `web/src/lib/nav.test.ts` (settings tabs included in the no-placeholder check), `web/src/components/layout/command-palette.tsx`

**Interfaces:** Consumes Task 3 `useTheme`; Task 1 `THEMES`.

- [ ] **Step 1: Failing test** in `nav.test.ts`: every `settingsTabs` href resolves to a page that does not import `PlaceholderPage` (reuse the existing helper). Run: FAIL (workspace etc. are placeholders).
- [ ] **Step 2:** Implement per spec §2: segmented Mode (Sun/Moon/Monitor icons, `role="radiogroup"`), "Dark" and "Light" grids of `ThemeCard` (miniature: rail strip, three rows with high/medium/low pills, status bar strip; drawn in the card's own tokens via `data-theme` on the card root; name below; selected = check icon + 2px ring in `--ring`; keyboard: arrow keys move, Enter/Space pick). In system mode the grid matching `matchMedia` gets "Active now", the other "Used when your system is light/dark". Old placeholder settings routes stay reachable by URL only.
- [ ] **Step 3:** Palette: group "Theme" with `Theme: <name>` (Palette icon + 3-colour swatch) calling `pick(id)` and `Theme mode: Light/Dark/System` calling `setMode`; palette stays open-without-animation.
- [ ] **Step 4: Run** `pnpm test && pnpm lint`; Playwright: click Monokai card → `html[data-theme=monokai]`; Ctrl+K "Theme: Nord" → `nord`; reload keeps `nord`. **Commit** `feat(web): settings appearance with live theme cards`

### Task 5: Activity rail and top bar

**Files:**
- Create: `web/src/components/layout/activity-rail.tsx`, `web/src/components/layout/breadcrumbs.tsx`, `web/src/lib/crumbs.ts`, `web/src/lib/crumbs.test.ts`
- Modify: `web/src/components/layout/app-shell.tsx` (rail replaces `Sidebar`; grid: rail | column(top bar, main) ; status bar slot from Task 6), `topbar.tsx`, `web/src/lib/nav.ts` (add `settingsNav: NavItem = { label: "Settings", href: "/app/settings/appearance", icon: Settings, tour: "nav-settings" }`), `web/src/stores/ui-store.ts` (remove `sidebarCollapsed`/`toggleSidebar`)
- Delete: `web/src/components/layout/sidebar.tsx`

**Interfaces:**
- Produces: `crumbs(pathname: string, names: Record<string, string>): { label: string; href?: string; mono?: boolean }[]` — section label from `navGroups`/`settingsNav`; a record id segment becomes its name from `names` (falls back to the first 8 chars of the id, mono); last crumb has no href.

- [ ] **Step 1: Failing tests:**

```ts
test("section", () => assert.deepEqual(crumbs("/app/scans", {}), [{ label: "Scans" }]));
test("record with name", () => assert.deepEqual(crumbs("/app/scans/abc123ef-9/findings", { "abc123ef-9": "testbed.nyx-lab.test" }),
  [{ label: "Scans", href: "/app/scans" }, { label: "testbed.nyx-lab.test", href: "/app/scans/abc123ef-9", mono: true }, { label: "Findings" }]));
test("unknown id falls back to short id", () => assert.equal(crumbs("/app/findings/0123456789", {})[1].label, "01234567"));
test("settings", () => assert.deepEqual(crumbs("/app/settings/appearance", {}), [{ label: "Settings", href: "/app/settings/appearance" }, { label: "Appearance" }]));
```
- [ ] **Step 2:** Run FAIL; implement `crumbs`; run PASS.
- [ ] **Step 3:** Rail per spec §3: 48px, `bg-sidebar`, logo mark on top, New scan (`Plus` on `bg-primary`, hidden for viewers), path items, gap, Setup items, spacer, Settings. Each item a `Tooltip` (side right, label; "2 · Scans" for stepped items), `aria-label`, `aria-current`, active = `text-brand bg-brand-soft`. Findings badge = `open_by_severity.critical + high` from `useDashboard()`, `bg-sev-critical` with `text-primary-foreground`-safe colour (use `on-bar-alert`), hidden at 0, `aria-label` includes the count. `data-tour` on each item. Hidden below md.
- [ ] **Step 4:** Top bar: breadcrumbs left (names from the scan/finding/asset query already cached for that id when present; record crumbs mono), search button, tour "?" (unchanged behaviour), avatar button (initial on `bg-brand`) opening a base-ui Menu (from the shadcn registry via `shadcn` skill if not present) with email, role chip, Sign out (keeps `useSignOut` error display). Remove the email text and Sign out button.
- [ ] **Step 5: Verify** `pnpm test && pnpm lint`; Playwright at 1400 and 390: each `nav-*` anchor matches exactly one visible element; tour from a reset state reaches the Targets step spotlight on the rail icon; viewer-less admin sees New scan. **Commit** `feat(web): activity rail, breadcrumbs and avatar menu`

### Task 6: Status bar

**Files:**
- Create: `web/src/lib/status-bar.ts`, `web/src/lib/status-bar.test.ts`, `web/src/components/layout/status-bar.tsx`
- Modify: `app-shell.tsx`, scan detail page/header (mark failed scan seen), `web/src/lib/tour/storage.ts` pattern reused for `nyx-seen-failed`

**Interfaces:**
- Consumes: `Scan`, `ScanStatus`, `scanLive` (hooks.ts); Task 3 `useTheme`.
- Produces: `type BarState = { kind: "running"; scan: Scan; more: number } | { kind: "failed"; scan: Scan } | { kind: "idle" }`; `barState(scans: Scan[], seenFailed: string | null): BarState` (scans newest-first by `created_at`).

- [ ] **Step 1: Failing tests:**

```ts
const s = (id: string, status: ScanStatus, created_at: string) => ({ id, status, created_at } as Scan);
test("idle", () => assert.deepEqual(barState([s("a", "COMPLETED", "2026-10-29T10:00:00Z")], null), { kind: "idle" }));
test("newest running plus count, even with an older failure", () => {
  const r = barState([s("c", "RUNNING", "2026-10-29T12:00:00Z"), s("b", "RUNNING", "2026-10-29T11:00:00Z"), s("a", "FAILED", "2026-10-29T10:00:00Z")], null);
  assert.equal(r.kind, "running"); assert.equal(r.kind === "running" && r.scan.id, "c"); assert.equal(r.kind === "running" && r.more, 1);
});
test("newest failed and unseen alerts", () => assert.equal(barState([s("a", "FAILED", "2026-10-29T10:00:00Z")], null).kind, "failed"));
test("seen failure goes quiet", () => assert.equal(barState([s("a", "FAILED", "2026-10-29T10:00:00Z")], "a").kind, "idle"));
test("partial and cancelled never alert", () => { for (const st of ["PARTIAL", "CANCELLED"] as const) assert.equal(barState([s("a", st, "2026-10-29T10:00:00Z")], null).kind, "idle"); });
test("CREATED counts as running", () => assert.equal(barState([s("a", "CREATED", "2026-10-29T10:00:00Z")], null).kind, "running"));
```
- [ ] **Step 2:** Run FAIL; implement; run PASS.
- [ ] **Step 3:** Component per spec §3 (≥ md, 24px, `bg-bar text-on-bar`, `bg-bar-alert text-on-bar-alert` when failed, no transition): running → `Loader2` spin (static under reduced motion) + mono target + "`done`/`total` tools" from `useScan(id).data.runs` (done = SUCCEEDED+FAILED+TIMED_OUT+CANCELLED, total = `plugin_ids.length`) + "+N", link to the scan; idle → `CircleCheck` "Idle"; failed → `CircleX` "Scan failed · <target>" link; then shield + open critical+high (link `/app/findings?severity=critical,high` — match `syncQuery`'s format); right: Palette + theme name (link Appearance), `Ctrl K` kbd. Uses `useScans()` (already polled). Scan detail page writes its id to `nyx-seen-failed` when its status is FAILED.
- [ ] **Step 4: Verify** `pnpm test && pnpm lint`; Playwright with mocked `/api/scans` (route interception) for running and failed states, screenshot both. **Commit** `feat(web): live status bar`

### Task 7: Status, plugin and kind visuals

**Files:**
- Modify: `web/src/components/scans/scan-status.tsx`, `web/src/components/findings/finding-status.tsx`, `scans-table.tsx`, `findings-table.tsx`, `finding-detail.tsx`, `scan-overview.tsx`, `assets-view.tsx`
- Create: `web/src/components/shared/plugin-tile.tsx`, `web/src/components/shared/status-meta.test.ts`
- Create: `web/src/lib/status-meta.ts`

**Interfaces:**
- Produces: `scanStatusMeta: Record<ScanStatus | RunStatus, { label: string; tone: "green" | "orange" | "red" | "blue" | "yellow" | "muted"; icon: LucideIcon; spin?: boolean }>`, `findingStatusMeta: Record<FindingStatus, same>`; `<StatusText status>` and `<FindingStatusText status>` keep their names and render icon + word in the tone colour; `<PluginTile id name />` = 20px rounded tile, first letter of the tool name, `bg-sev-*`-family colour from `hueOf(id)` with readable text, tooltip = name.

- [ ] **Step 1: Failing test** `status-meta.test.ts`: every `ScanStatus`, `RunStatus` and `FindingStatus` value has a meta with non-empty label and icon; values per spec: COMPLETED/SUCCEEDED green check, PARTIAL orange, FAILED/TIMED_OUT red, CANCELLED muted, RUNNING blue spin, CREATED/PENDING muted clock, PAUSED muted pause; open blue, confirmed yellow, fixed green, false_positive muted, accepted_risk muted.
- [ ] **Step 2:** Run FAIL; implement; run PASS.
- [ ] **Step 3:** Replace the "N tools" wrench chip with a row of up to 5 `PluginTile`s + "+N"; plugin column in findings/scan overview uses `PluginTile` + name on wide screens; asset kind icons get kind colours (domain/subdomain blue, ip purple, port/service orange, http_service green, certificate yellow).
- [ ] **Step 4:** `pnpm test && pnpm lint`; screenshot Scans + Findings at 1400 in NYX and GitHub Light. **Commit** `feat(web): colour-coded statuses and plugin tiles`

### Task 8: Text diet and Home strip

**Files:**
- Modify: `web/src/components/shared/page-header.tsx` (drop `description` prop), every caller in `web/src/app/app/**/page.tsx` and `plugin-detail.tsx`; `web/src/components/home/home-view.tsx`; empty states in `scans-table.tsx`, `findings-table.tsx`, `assets-view.tsx`, `plugins-table.tsx`, `profiles-view.tsx`, `scope-manager.tsx`
- Test: `web/src/lib/nav.test.ts` (or new `copy.test.ts`)

- [ ] **Step 1: Failing test** `copy.test.ts`: no `.tsx` under `src/app/app` or `src/components` passes `description=` to `PageHeader` (regex over files, like the 12px test). Run FAIL.
- [ ] **Step 2:** Remove descriptions; where a sentence carried a rule the user needs (scope rules on Targets), move it behind an `Info` icon tooltip next to the title. Run PASS.
- [ ] **Step 3:** Home: the four metric cards become one strip of 4 links (icon in hue, mono number, ≤ 3-word label): Flame red "Critical + high" → findings filtered; ShieldAlert orange "Open findings" → findings; Boxes blue "Assets" → assets; Sparkles green "New this week" → assets. Plain sections with a heading and hairline replace card shells for "Open by severity", "New findings per day", "Recent scans", "Top assets" (keep content). Empty states: icon in a soft-tinted circle + one line + one action.
- [ ] **Step 4:** `pnpm test && pnpm lint`. **Commit** `feat(web): cut explanatory copy, home stat strip`

### Task 9: Mobile restyle and full verification

**Files:** Modify `mobile-nav.tsx` (tokens only: active item `text-brand` + top bar indicator stays; More sheet gains Settings and the theme mode switch), `web/src/components/tour/*` only if anchors need it.

- [ ] **Step 1:** Mobile: More sheet lists Setup items, Settings, New scan (non-viewers), Sign out; breadcrumbs show only the current section under md.
- [ ] **Step 2: Verify** Playwright screenshots of Home, Targets, Scans, scan detail, Findings, finding detail, Assets, Profiles, Plugins, Appearance at 1400 and 390 in NYX, GitHub Light and Monokai (60 shots, scratchpad `ide/`); read every one; fix what they show in one batch, re-shoot only the fixed screens.
- [ ] **Step 3:** Run the impeccable detector once: `"C:/Users/Local/.claude/plugins/cache/impeccable/impeccable/4.8.0/skills/impeccable/scripts/impeccable" detect --json web/src/components web/src/app`; fix mechanical findings.
- [ ] **Step 4:** `pnpm test && pnpm lint && pnpm build` PASS. **Commit** `feat(web): mobile workbench polish`; write `docs/checkpoints/2026-10-29-ide-workbench.md` (what shipped, rulings, deferred) and commit `docs: checkpoint for ide workbench`.
