# NYX command center (Dovetail language + new Home) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole admin the Dovetail look (tone-layered dark, Inter + JetBrains Mono, 8px radii, no shadows, white primary, one blue accent) and rebuild Home as the Command center (headline, command bar, stat strip, 30-day severity bars + ring, recent scans, riskiest assets).

**Architecture:** Visual language lands through tokens and shared components: `themes.ts` (NYX palette, cards on `panel` in every theme), `globals.css` (radius scale, fonts), `ui/*` (no shadows). Home logic (headline, stat cells, bar geometry) is pure and unit-tested in `web/src/lib/home.ts`; the view composes small components in `web/src/components/home/`. The API adds one field, `findings_per_day[].by_severity`.

**Tech Stack:** Next.js 16.3 (read `web/node_modules/next/dist/docs` for `next/font`), React 19, Tailwind 4, base-ui shadcn, TanStack Query, `node --test`; FastAPI + SQLAlchemy + pytest for the API.

**Spec:** `docs/specs/2026-10-29-nyx-command-center-design.md` (context: `PRODUCT.md`, reference mockup `.superpowers/brainstorm/542-1793281749/content/home-directions.html` direction A).

## Global Constraints

- No new runtime dependencies beyond `next/font/google` Inter and JetBrains Mono.
- Depth is tone only: no `shadow-*` on cards/popovers/menus (dialog overlay may stay); no gradients, no glass.
- Blue accent never as a filled button background; severity colours only in data.
- Radius 8px for cards, inputs, buttons, menus; 4px for tags/pills/tiles.
- Every theme passes the contrast test; 12px floor, nav and copy tests keep passing.
- Keep: themes, sidebar, status bar, tour anchors (`home-steps`, `quick-scan`, `nav-*`), quick-scan behaviour (inline scope add for admins), roles (viewers: no command bar).
- Motion: only the running-scan dot pulse and existing transitions; reduced motion honoured.
- UI copy English; commits English with the session trailer.

## Review Focus

1. Empty workspace (no scans) → checklist in the headline's place, no stat strip / charts / lists, no NaN or division by zero in bars or ring. Pinned in Task 3 tests (`barGeometry` with all-zero days, `ring` with total 0).
2. Older API without `by_severity` (cached response) → bars fall back to `count` drawn neutral, no crash. Pinned in Task 3.
3. Viewer role → Home shows headline (first sentence only), stats, charts, lists; no command bar. Pinned in Task 4 Playwright.
4. Very long target/asset values in lists and command bar → truncate with ellipsis, no horizontal page scroll at 390. Pinned in Task 4 Playwright (scrollWidth == clientWidth).
5. Light themes (GitHub Light, Latte) → new card-on-panel tones and Home panels keep AA; grid motif visible but faint. Pinned in Task 2 (contrast) and Task 5 screenshots.

---

### Task 1: API — per-day counts by severity

**Files:** Modify `api/app/routes/dashboard.py`; Test `api/tests/test_assets_dashboard.py`.

- [ ] **Step 1: Failing test** `test_dashboard_per_day_by_severity`: seed findings first seen today (2 high, 1 medium) and one 3 days ago (low); assert today's item `{"count": 3, "by_severity": {"critical": 0, "high": 2, "medium": 1, "low": 0, "info": 0}}`, the 3-days-ago item has `low: 1`, and every one of the 30 items has all five keys. Extend `test_dashboard_on_an_empty_database` to assert every item's `by_severity` values are 0.
- [ ] **Step 2: Run** `cd api && pytest tests/test_assets_dashboard.py -q` — Expected: FAIL (KeyError `by_severity`). (Dev stack: `docker compose -f docker-compose.yml -f compose.dev.yml up -d postgres runner temporal api`.)
- [ ] **Step 3: Implement**: group the per-day query by `(day, Finding.severity)`; build `by_severity` per day over `SEVERITIES`; `count` = sum.
- [ ] **Step 4: Run** the same test file, then `pytest -q` — Expected: PASS. Add `by_severity: Record<Severity, number>` to `Dashboard["findings_per_day"]` items in `web/src/lib/types.ts` (optional field: `by_severity?`).
- [ ] **Step 5: Commit** `feat(api): dashboard per-day counts by severity`.

### Task 2: Design language in tokens and shared components

**Files:** Modify `web/src/lib/themes.ts`, `web/src/lib/themes.test.ts`, `web/src/app/themes.css` (regenerated), `web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/components/ui/{select,dialog,command,tooltip}.tsx`, `web/src/components/layout/user-menu.tsx`; Create `web/src/lib/style.test.ts`.

**Interfaces:** Produces token `raised` (= `surface-3`, unchanged name) and `card` = `panel` in every theme; fonts via CSS vars `--font-sans` = Inter, `--font-mono` = JetBrains Mono.

- [ ] **Step 1: Failing tests**:
  - `themes.test.ts`: `nyx speaks Dovetail` — `background #0a0a0a`, `surface-2 #141414`, `foreground #ffffff`, `muted-foreground #a7a7a7`, `brand #6798ff`, `primary #ffffff`, `primary-foreground #0a0a0a`; `cards sit on the panel tone in every theme` — `deriveTokens(t).card === t.input.panel` for all themes (replace the old `nyx keeps today's palette` test).
  - `style.test.ts`: no `shadow-(sm|md|lg|xl|2xl)` in `src/components/**/*.tsx` except `ui/dialog.tsx`; globals `--radius-lg`, `--radius-xl`, `--radius-2xl` are `8px`.
- [ ] **Step 2: Run** `cd web && pnpm test` — Expected: FAIL on the new tests.
- [ ] **Step 3: Implement**:
  - NYX input per spec §1 (bg `#0a0a0a`, side `#0f0f0f`, panel `#141414`, fg `#ffffff`, muted `#a7a7a7`, border `#1e1e1e`, accent `#6798ff`, onAccent `#0a0a0a`, primary `#ffffff`/onPrimary `#0a0a0a`, bar `#6798ff`/onBar `#0a0a0a`, barAlert `#ff5d62`/onBarAlert `#0a0a0a`, hues as today); NYX overrides only where the contrast test needs (`input`, `subtle`, `border-strong #313131`, `surface-3 #1e1e1e`).
  - `deriveTokens`: `card` = `panel`; `secondary`/`muted` keep `surface-3`.
  - `pnpm themes`; tune failing values in lightness with `adapted` notes.
  - globals: `--radius-sm 4px; --radius-md 6px; --radius-lg 8px; --radius-xl 8px; --radius-2xl 8px` (3xl/4xl 8px too), `--radius: 8px`; `@theme` fonts: `--font-sans: var(--font-inter)`, `--font-mono: var(--font-jetbrains-mono)`, `--font-heading`/`--font-display` = Inter; base tracking `-0.012em`; `h1,h2,h3` tracking `-0.02em`.
  - layout: load `Inter` (400/500/600) and `JetBrains_Mono` (400/500) via `next/font/google` as `--font-inter`/`--font-jetbrains-mono`; drop Geist, Geist Mono, Inter Tight.
  - ui popups: replace `shadow-md`/`shadow-lg` with `ring-1 ring-border-strong`.
- [ ] **Step 4: Run** `pnpm test && pnpm lint` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Dovetail language in tokens, fonts and radii`.

### Task 3: Home logic

**Files:** Create `web/src/lib/home.ts`, `web/src/lib/home.test.ts`.

**Interfaces:**
- `headline(urgent: number): { lead: string; tail: string }` — `urgent>0` → `{ lead: "${urgent} issue(s) need you.", tail: "Scan something new?" }` ("1 issue needs you."); `0` → `{ lead: "All clear.", tail: "Scan something new?" }`.
- `type StatCell = { key: "urgent" | "open" | "assets" | "new"; value: number; label: string; href: string; delta?: number }`
- `statCells(d: Dashboard): StatCell[]` — urgent (crit+high, `/app/findings?severity=critical,high`, "Critical + high"), open (`open_total`, `/app/findings`, "Open findings"), assets (`assets_total`, `/app/assets`, "Assets", delta `assets_new_7d` when > 0), new (sum of last 7 `findings_per_day.count`, `/app/findings`, "New findings this week").
- `type Bar = { date: string; segments: { severity: Severity | "unknown"; value: number }[] }`; `barSeries(days: Dashboard["findings_per_day"]): { bars: Bar[]; max: number }` — segments bottom→top: info, low, medium, high, critical; zero segments dropped, missing `by_severity` → one `unknown` segment of `count`; `max` ≥ 1.
- `ring(open: Record<Severity, number>): { severity: Severity; value: number; share: number }[]` — non-zero only, shares sum to 1, empty array when total 0.
- `metaLine(scopeCount: number, lastScanIso: string | null, now: Date): string` — `"Workspace · 2 targets · last scan 1 h ago"` using `ago()` from `format.ts`; `"Workspace · no targets yet"` when 0; omits the scan part when null.

- [ ] **Step 1: Failing tests** for each function with the values above, plus: all-zero days → every bar has no segments and `max` 1; `ring` with total 0 → `[]`; `statCells` delta absent when `assets_new_7d` 0; `headline(1).lead === "1 issue needs you."`.
- [ ] **Step 2: Run** `pnpm test` — FAIL (module missing).
- [ ] **Step 3: Implement** `home.ts` (pure, imports types only + `ago`).
- [ ] **Step 4: Run** `pnpm test` — PASS.
- [ ] **Step 5: Commit** `feat(web): home command center logic`.

### Task 4: Home view

**Files:** Create `web/src/components/home/{command-bar,stat-strip,severity-bars,severity-ring,recent-scans,riskiest-assets}.tsx`; Modify `home-view.tsx`, `next-steps.tsx` (add `compact` row variant), `web/src/app/app/dashboard/page.tsx` (no PageHeader; Home renders its own headline), `quick-scan.tsx` (becomes `CommandBar`'s logic or is replaced by it — keep `id="quick-scan"`, `data-tour="quick-scan"`, `id="quick-scan-target"`, the admin inline scope form and errors); Delete `web/src/components/dashboard/dashboard-view.tsx` once nothing imports it.

**Interfaces:** Consumes Task 3 functions; `useDashboard`, `useProfiles`, `useProgress`, `useMe`, `PluginTiles`, `StatusText` colours via `status-meta`.

- [ ] **Step 1:** Layout per spec §2: `max-w-[1200px] mx-auto`, blueprint grid absolutely behind the top (48px, 1px `--border`, radial mask), meta line (mono, muted) → headline (40px/600, tail in muted; 32px under md) → command bar (input 52px tall on `surface-3`, target icon, profile chips from `useProfiles()` available profiles with Balanced selected by default, white primary "Start scan →"; Enter submits; viewers: hidden) → stat strip (one panel, 4 cells with hairlines, icon colours red/orange/blue/green, 36px mono number, label, delta chip) → charts row `lg:grid-cols-[2fr_1fr]` (SVG stacked bars from `barSeries`, gridlines, mono date ends, legend with counts; ring from `ring` with total centred) → lists row `lg:grid-cols-2` (recent scans: status dot pulsing while running, target truncate, status word, `PluginTiles`, age; riskiest assets: severity pill, mono value truncate, proportional bar, count; "View all →" links).
- [ ] **Step 2:** Checklist states: no finished scan → full `NextSteps` replaces meta+headline and the strip/charts/lists are not rendered; path not done → `NextSteps compact` (one row: step dots + next action, `data-tour="home-steps"`) above the headline; done → nothing.
- [ ] **Step 3: Verify** (Playwright, local `pnpm dev -p 3002`): at 1400×900 the headline, command bar, stat strip and the chart panel's top are inside the first viewport; viewer (mock `/api/v1/auth/me` role viewer) sees no command bar; long target (mock a scan with a 120-char host) truncates and `document.documentElement.scrollWidth === clientWidth` at 390; tour "Scan" step spotlights `quick-scan`; empty workspace (mock dashboard/scans empty) shows only the checklist. Expected: all pass, no console errors.
- [ ] **Step 4:** `pnpm test && pnpm lint && npx tsc --noEmit -p .` PASS. **Commit** `feat(web): home command center`.

### Task 5: Rest of the admin and verification

**Files:** Modify `web/src/components/shared/page-header.tsx` (title 24px/600), table wrappers in `scans-table.tsx`, `findings-table.tsx`, `assets-view.tsx`, `plugins-table.tsx`, `profiles-view.tsx`, `scope-manager.tsx`, `finding-detail.tsx`, `scan-overview.tsx` (panels: `rounded-lg border border-border bg-card`; table header row `bg-surface-2 text-muted-foreground text-xs`; data columns `font-mono`; row hover `hover:bg-surface-3`), `ui/button.tsx` (`outline` variant = transparent + `border-border-strong`; radius 8px via tokens), pills/badges `rounded` (4px), `activity-rail.tsx`/`topbar.tsx` tones (`bg-sidebar`, top bar `bg-background`).

- [ ] **Step 1:** Apply the class changes above; no layout rewrites.
- [ ] **Step 2: Verify**: Playwright screenshots of Home, Targets, Scans, scan detail, Findings, finding detail, Assets, Profiles, Plugins, Appearance at 1400 and 390 in NYX, GitHub Light, Monokai; review as contact sheets, fix what they show in one batch; impeccable detector once over `web/src/components web/src/app`.
- [ ] **Step 3:** `pnpm test && pnpm lint && pnpm build` PASS; `cd api && pytest -q` PASS. **Commit** `feat(web): Dovetail surfaces across the admin`; write `docs/checkpoints/2026-10-29-command-center.md` and commit `docs: checkpoint for command center`.
