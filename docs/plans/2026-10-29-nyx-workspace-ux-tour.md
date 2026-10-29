# Workspace structure, readability and guided tour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new user finds the one real path (targets → scan → findings → review) from the screen alone, can read every text, and is walked through it once by NYX on the real screens, on desktop and phone.

**Architecture:** Navigation becomes data in `lib/nav.ts` (path-ordered, placeholders out). Two pure modules carry the logic and are unit-tested with Node's built-in runner: `lib/tour/progress.ts` (checklist facts → steps) and `lib/tour/tour.ts` (tour state + facts → current tour step). React parts (Home checklist, mobile nav, tour overlay) only render what those modules decide. The tour finds its targets through `data-tour` attributes.

**Tech Stack:** Next.js 16.3.8 (read `web/node_modules/next/dist/docs` before writing code), React 19, Tailwind 4 tokens in `web/src/app/globals.css`, `motion` 14 (installed), TanStack Query, `node --test` with built-in TypeScript type stripping (Node ≥ 22.18; CI uses 22, local 26).

**Spec:** `docs/specs/2026-10-29-nyx-workspace-ux-tour-design.md`

## Global Constraints

- Text contrast ≥ 4.5:1 on every surface it is used on; control boundaries (inputs, selects, textareas) and focus ring ≥ 3:1. Nothing below 12 px.
- No menu item, tab, link or command-palette entry leads to a page that renders `PlaceholderPage`.
- Primary nav order and labels: Home, 1 Targets, 2 Scans, 3 Findings, 4 Assets; group Setup: Scan profiles, Plugins. Settings is hidden. Scan tabs: Overview, Findings, Metrics.
- Tour: dims the screen, outlines the target with `--brand`, card with NYX portrait, mono caption `STEP n / 5 · NAME`, first-person English copy, primary button and "Skip tour"; card docks to the bottom on narrow screens; `prefers-reduced-motion` → no animation. Skip always available; "?" in the top bar restarts.
- Tour only for admin and analyst; viewers get the Home checklist read-only. Tour state in localStorage, every read/write in try/catch; Home progress comes from data only.
- Steps complete by data, not events; satisfied steps are skipped. First scan with no findings completes the review item; FAILED/CANCELLED keeps the tour on the scan step with Run again; lab tip always conditional.
- No new runtime dependency. API unchanged. UI copy in English, first person for NYX, real-action verbs, human status words (HITEXIS checklist).
- Every UI task ends with screenshots at 1400×900 and 390×844 and an `impeccable` critique of the changed screens; fix what it rates as a real problem before committing.

## Review Focus

- The tour's target is not on screen (page still loading, element only on desktop, list empty) → the card shows centred without a spotlight and the tour keeps working; it never throws. (Task 7)
- localStorage throws or is empty (private window, blocked storage) → the tour starts, runs for the session, and never breaks the page. (Task 6)
- Reload or navigate away mid-tour → the tour resumes at the step the data says, not at step 1. (Task 6)
- The first scan fails or is cancelled → the tour stays on the scan step and offers Run again; it never advances to findings. (Task 6)
- A viewer signs in → no tour, the checklist shows no action buttons. (Tasks 4–5)

---

### Task 1: Test runner and readable tokens

**Files:**
- Modify: `web/package.json` (script `"test": "node --test \"src/**/*.test.ts\""`), `.github/workflows/ci.yml` (web job: `- run: pnpm test` after lint), `web/tsconfig.json` (`"allowImportingTsExtensions": true`; tests import siblings with `.ts`)
- Modify: `web/src/app/globals.css` `:root`: `--subtle: #8e8e97` (was #71717a), `--input: #68686f` (was white/10)
- Modify: every `text-[10px]`, `text-[10.5px]`, `text-[11px]` in `web/src` → `text-xs` (11 occurrences today)
- Test: `web/src/lib/contrast.test.ts`

**Interfaces:**
- Produces: `contrast(a: string, b: string): number` and `tokens(css: string): Record<string, string>` exported from `web/src/lib/contrast.ts` (WCAG relative luminance; `tokens` reads `--name: #hex;` lines of the first `:root` block).

- [ ] **Step 1: Write the failing test** `web/src/lib/contrast.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { contrast, tokens } from "./contrast.ts";

const t = tokens(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));
const surfaces = ["--background", "--surface-1", "--surface-2", "--surface-3"];

test("text tokens reach 4.5:1 on every surface", () => {
  for (const fg of ["--foreground", "--muted-foreground", "--subtle", "--brand", "--sev-critical", "--sev-high", "--sev-medium", "--sev-low", "--sev-info"])
    for (const bg of surfaces) assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}`);
});

test("control boundaries and focus reach 3:1", () => {
  for (const fg of ["--input", "--ring"]) for (const bg of ["--background", "--surface-1"]) assert.ok(contrast(t[fg], t[bg]) >= 3, `${fg} on ${bg}`);
});

test("no text smaller than 12px", () => {
  const files = readdirSync(new URL("..", import.meta.url), { recursive: true }).filter((f) => String(f).endsWith(".tsx"));
  const tiny = files.filter((f) => /text-\[(9|10|11)(\.5)?px\]/.test(readFileSync(new URL(`../${String(f).replaceAll("\\", "/")}`, import.meta.url), "utf8")));
  assert.deepEqual(tiny, []);
});
```

- [ ] **Step 2: Run** `cd web && pnpm test` — Expected: FAIL (`contrast.ts` missing; after it exists: `--subtle on --surface-3: 3.73`, `--input` fails, tiny-text list non-empty).
- [ ] **Step 3: Implement** `web/src/lib/contrast.ts`, change the two tokens, replace the tiny text sizes.
- [ ] **Step 4: Run** `pnpm test && pnpm lint && pnpm exec tsc --noEmit` — Expected: 3 tests pass, lint and tsc clean.
- [ ] **Step 5: Commit** `fix(web): text and control contrast meet WCAG AA, nothing below 12px`

### Task 2: Path-ordered navigation, Targets page, placeholders unreachable

**Files:**
- Modify: `web/src/lib/nav.ts` — `NavItem` gains `step?: number` and `tour: string`; `navGroups` = `[{label: "Path", items: Home(/app/dashboard, tour "nav-home"), Targets(/app/targets, step 1, "nav-targets"), Scans(/app/scans, 2, "nav-scans"), Findings(/app/findings, 3, "nav-findings"), Assets(/app/assets, 4, "nav-assets")]}, {label: "Setup", items: Scan profiles(/app/profiles, "nav-profiles"), Plugins(/app/plugins, "nav-plugins")}]`; `scanTabs` = Overview, Findings, Metrics.
- Modify: `web/src/components/layout/sidebar.tsx` (render `step` as a mono number before the label; `data-tour={tour}` on each link; no label for the "Path" group), `web/src/components/layout/command-palette.tsx` (unchanged logic; follows `navGroups`)
- Create: `web/src/app/app/targets/page.tsx` (PageHeader "Targets", description in NYX voice about scope + `<ScopeManager />`)
- Modify: `web/src/app/app/settings/policies/page.tsx` → `redirect("/app/targets")`; `web/src/components/scans/quick-scan.tsx` link → `/app/targets` with text "Targets"
- Test: `web/src/lib/nav.test.ts`

**Interfaces:**
- Produces: `navGroups: NavGroup[]`, `primaryNav: NavItem[]` (the "Path" group's items, used by mobile nav), `NavItem = { label: string; href: string; icon: LucideIcon; tour: string; step?: number }`.

- [ ] **Step 1: Write the failing test** `web/src/lib/nav.test.ts`: import `navGroups`, `scanTabs`, `primaryNav` from `./nav.ts`; for each nav `href` resolve `src/app<href>/page.tsx` and for each scan tab `src/app/app/scans/[scanId]<path>/page.tsx`; assert each file exists and does not contain `PlaceholderPage`; assert `primaryNav.map(i => i.label)` equals `["Home", "Targets", "Scans", "Findings", "Assets"]` and steps `[undefined, 1, 2, 3, 4]`.
- [ ] **Step 2: Run** `pnpm test` — Expected: FAIL (Graph, Reports, Audit Log, Settings/workspace, scan Graph/Evidence/Changes/Report are placeholders; `/app/targets` missing).
- [ ] **Step 3: Implement** the nav data, Targets page, redirect, sidebar rendering, Quick scan link.
- [ ] **Step 4: Run** `pnpm test && pnpm lint && pnpm exec tsc --noEmit`; grep `web/src` for links to `/app/graph`, `/app/reports`, `/app/audit`, `/app/experiments`, `/app/settings` outside their own route folders — Expected: tests pass, grep empty.
- [ ] **Step 5: Screenshots + impeccable critique** of the sidebar and Targets at both widths (see Global Constraints); fix real problems.
- [ ] **Step 6: Commit** `feat(web): navigation follows the path, Targets at the top, unfinished screens out of reach`

### Task 3: Mobile navigation

**Files:**
- Create: `web/src/components/layout/mobile-nav.tsx` — fixed bottom bar, `md:hidden`, the five `primaryNav` items (icon + short label, `aria-current="page"` + a non-colour marker such as a top bar line), plus "More" opening a sheet (existing `Dialog`) with Setup items and New scan; every target ≥ 44 px; `data-tour={tour}` on items; respects the iOS safe area (`pb-[env(safe-area-inset-bottom)]`).
- Modify: `web/src/components/layout/app-shell.tsx` (render `<MobileNav />`; `main` gets bottom padding below `md` so content clears the bar)

**Interfaces:**
- Consumes: `primaryNav`, `navGroups` (Task 2).

- [ ] **Step 1: Implement** the component and shell change.
- [ ] **Step 2: Verify** `pnpm lint && pnpm exec tsc --noEmit`; Playwright at 390×844: every primary item navigates, "More" opens and closes with Esc and returns focus, keyboard Tab reaches every item, nothing is hidden under the bar on Findings and Assets. At 1400×900 the bar is not rendered.
- [ ] **Step 3: Screenshots + impeccable critique**; fix real problems.
- [ ] **Step 4: Commit** `feat(web): bottom navigation on phones`

### Task 4: Progress model (pure) and its data hook

**Files:**
- Create: `web/src/lib/tour/progress.ts`, `web/src/lib/tour/use-progress.ts`
- Test: `web/src/lib/tour/progress.test.ts`

**Interfaces:**
- Produces (pure, `progress.ts`, no imports from `@/`):
  - `type Facts = { role: "admin" | "analyst" | "viewer"; scopeCount: number; scans: { id: string; status: ScanStatus; error: string | null }[]; findingsTotal: number; reviewedTotal: number }` (scans newest first; `ScanStatus` string union copied locally to stay alias-free).
  - `type ItemId = "account" | "target" | "scan" | "review"`
  - `progress(f: Facts): { items: { id: ItemId; done: boolean }[]; current: ItemId | null; allDone: boolean }`
  - Rules: account always done; target ⇐ `scopeCount > 0`; scan ⇐ `scans.length > 0`; review ⇐ `reviewedTotal > 0` or (a scan in COMPLETED/PARTIAL exists and `findingsTotal === 0`); `current` = first not-done item.
- Produces (`use-progress.ts`): `useProgress(): { facts: Facts | undefined; result: ReturnType<typeof progress> | undefined; isLoading: boolean }` built from `useMe`, `useScope`, `useScans`, and two `useQuery` calls to `api.listFindings` (all statuses → `total`; statuses confirmed,false_positive,accepted_risk,fixed → `total`), query keys under `["progress", …]`, refetch every 5 s while any scan is live.

- [ ] **Step 1: Write the failing tests** in `progress.test.ts`: fresh workspace → current "target", only account done; scope only → current "scan"; scan RUNNING, nothing reviewed → current "review", allDone false; COMPLETED with 0 findings → allDone true; reviewedTotal 1 → allDone true; FAILED only and 0 findings → review not done.
- [ ] **Step 2: Run** `pnpm test` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `progress` and `useProgress`.
- [ ] **Step 4: Run** `pnpm test && pnpm exec tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): workspace progress from real data`

### Task 5: Home

**Files:**
- Create: `web/src/components/home/next-steps.tsx` — NYX greeting + "Your next step" checklist from `useProgress()`; current item has one primary button (target → `/app/targets`, scan → scrolls to/focuses Quick scan, review → `/app/findings`); viewers see the list without buttons; when `allDone`, a single collapsed line "You're set up" with a Show steps toggle.
- Modify: `web/src/app/app/dashboard/page.tsx` (title "Home"; layout: no scans → NextSteps + QuickScan; scans but not allDone → NextSteps + QuickScan + DashboardView; allDone → collapsed line + QuickScan + DashboardView), `web/src/components/scans/quick-scan.tsx` (`data-tour="quick-scan"` on the card, `data-tour="quick-scan-start"` on the button; `id="quick-scan"` for the scroll target)
- Modify: `web/src/components/dashboard/dashboard-view.tsx` only if empty rows show zeros before the first scan (they must not render then).

**Interfaces:**
- Consumes: `useProgress` (Task 4), `QuickScan`, `DashboardView`.
- Produces: `data-tour` ids `home-steps`, `quick-scan`, `quick-scan-start`.

- [ ] **Step 1: Implement** NextSteps and the Home layout rules.
- [ ] **Step 2: Verify** `pnpm lint && tsc`; Playwright on the local stack: as admin with existing data the layout matches the rule for its state; with role switched to viewer in the test DB, no action buttons and no Quick scan.
- [ ] **Step 3: Screenshots + impeccable critique** of Home at both widths; fix real problems.
- [ ] **Step 4: Commit** `feat(web): Home says what to do next`

### Task 6: Tour model (pure) and storage

**Files:**
- Create: `web/src/lib/tour/tour.ts`, `web/src/lib/tour/storage.ts`
- Test: `web/src/lib/tour/tour.test.ts`

**Interfaces:**
- Consumes: `Facts` (Task 4).
- Produces (`tour.ts`, pure):
  - `type TourStepId = "welcome" | "target" | "scan" | "findings" | "review"`; `STEPS: TourStepId[]` in that order.
  - `type TourState = { status: "active" | "skipped" | "done"; acked: TourStepId[] }` (steps the user confirmed with the primary button: welcome, findings).
  - `type TourView = { step: TourStepId; index: number; variant: "default" | "waiting-admin" | "scan-running" | "scan-failed" | "no-findings" } | null`
  - `currentStep(s: TourState, f: Facts): TourView` — null when `status !== "active"` or role is viewer; otherwise the first step not satisfied: welcome ⇐ acked; target ⇐ `scopeCount > 0` (analyst with empty scope → variant `waiting-admin`); scan ⇐ a COMPLETED/PARTIAL scan exists (newest scan live → `scan-running`; newest FAILED/CANCELLED and none finished → `scan-failed`); findings ⇐ acked (when a finished scan exists and `findingsTotal === 0`, this step shows variant `no-findings`: good news + the conditional lab tip, primary button "Finish"); review ⇐ `reviewedTotal > 0`, or a finished scan exists and `findingsTotal === 0`. All satisfied → null.
  - `ack(s: TourState, step: TourStepId): TourState`, `skip(s): TourState`, `restart(): TourState`.
- Produces (`storage.ts`): `loadTour(): TourState` (missing/invalid/throwing storage → `{ status: "active", acked: [] }` for a first visit), `saveTour(s: TourState): void` (swallows errors), key `"nyx-tour"`.

- [ ] **Step 1: Write the failing tests** in `tour.test.ts`: fresh admin → welcome; welcome acked + fresh → target; analyst + empty scope → target/waiting-admin; scope + newest scan RUNNING → scan/scan-running; newest FAILED, none finished → scan/scan-failed; COMPLETED with findings, not acked → findings; acked findings, reviewed 0 → review; reviewed 1 → null; COMPLETED with 0 findings, findings not acked → findings/no-findings, and after `ack(…, "findings")` → null; viewer → null; skipped → null; a workspace that already satisfies everything after welcome → null right after ack (resume-from-data). Storage: with `globalThis.localStorage` stubbed to throw on get and set, `loadTour()` returns the first-visit state and `saveTour` does not throw; with garbage JSON → first-visit state.
- [ ] **Step 2: Run** `pnpm test` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `tour.ts` and `storage.ts`.
- [ ] **Step 4: Run** `pnpm test && pnpm exec tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): guided tour model that resumes from real data`

### Task 7: Tour overlay

**Files:**
- Create: `web/src/components/tour/tour.tsx` (state from storage, view from `currentStep`, mounts nothing for null; restarts on a `nyx:tour-restart` window event), `web/src/components/tour/spotlight.tsx` (full-screen SVG mask with a rounded cut-out around the target rect + brand outline; animates rect changes with `motion`; no cut-out when no target), `web/src/components/tour/tour-card.tsx` (portrait, `STEP n / 5 · NAME`, copy, primary button, Skip tour; `role="dialog"` `aria-modal="false"` `aria-labelledby`; focuses the primary button on step change; Esc = Skip), `web/src/components/tour/steps.ts` (per step and variant: title, copy, primary label/action, `target` data-tour id per route, `href` the step lives on; the target step and the no-findings variant carry the lab tip, always phrased as "if you started the lab testbed…")
- Create: `web/public/brand/nyx-portrait.webp` (from `.github/assets/nyx.png`, ≤ 60 KB, 2× the rendered size)
- Modify: `web/src/components/layout/app-shell.tsx` (mount `<Tour />`), `web/src/components/layout/topbar.tsx` ("?" button, `aria-label="Restart the tour"`, dispatches `nyx:tour-restart`), `web/src/components/scope/scope-manager.tsx` (`data-tour="target-form"`), `web/src/components/findings/findings-table.tsx` (`data-tour="finding-row"` on the first row), `web/src/components/findings/finding-detail.tsx` (`data-tour="review"` on the review section)

**Interfaces:**
- Consumes: `currentStep`, `ack`, `skip`, `restart`, `loadTour`, `saveTour` (Task 6), `useProgress` (Task 4), `data-tour` ids from Tasks 2, 3, 5 and this task.
- Target lookup: first element matching `[data-tour="<id>"]` whose rect has width and height; re-measured on resize, scroll, route change and every 500 ms while missing. When the user is not on the step's `href`, the target is the step's nav item (`nav-<section>`) and the copy asks them to open it. Missing target → card centred, no cut-out.
- Motion: spotlight rect and card position animate (`motion`, ~0.35 s ease-out); `useReducedMotion()` → no animation. Overlay never blocks the target itself (pointer events pass through the cut-out); the rest of the screen is dimmed but clickable only via Skip.

- [ ] **Step 1: Implement** the overlay, copy and data-tour hooks.
- [ ] **Step 2: Verify** `pnpm lint && tsc && pnpm test`; Playwright on the local stack with `localStorage` cleared: the tour starts on Home, Start moves to the step the data says, Skip hides it and survives reload, "?" restarts it, Esc skips, at 390×844 the card docks to the bottom and the target is a bottom-bar item, with reduced motion emulated nothing animates, and removing the target element from the page leaves a centred card (Review Focus 1).
- [ ] **Step 3: Screenshots + impeccable critique** of each step at both widths; fix real problems.
- [ ] **Step 4: Commit** `feat(web): NYX walks a new user through the real screens`

### Task 8: Copy and polish pass, docs

**Files:**
- Modify: page headers, empty/error/loading states and button labels on Home, Targets, Scans (list, new, detail), Findings (list, detail), Assets, Profiles, Plugins — only where the `impeccable` audit or the HITEXIS checklist finds a real problem (term drift, vague verbs, missing state, colour-only meaning).
- Modify: `README.md` (where to start: Home → Targets → Scans; the tour), `docs/checkpoints/2026-10-29-phase4b.md` → new checkpoint `docs/checkpoints/2026-10-30-workspace-ux.md` (done, verified, open; drop the resolved GitGuardian item).

- [ ] **Step 1: Run** `impeccable` audit (and `senior-frontend` review) across the listed screens at both widths; list findings P0–P3.
- [ ] **Step 2: Fix** P0–P2; list P3 in the checkpoint.
- [ ] **Step 3: Verify** `pnpm test && pnpm lint && pnpm build`; API untouched (`git diff --stat main -- api` empty); end-to-end Playwright walk: clear storage, follow the tour on the lab target from Home to a saved review.
- [ ] **Step 4: Commit** `docs: workspace UX checkpoint` (and the fixes as `fix(web): …` commits before it)
