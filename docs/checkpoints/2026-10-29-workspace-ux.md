# Checkpoint 2026-10-29 — Workspace structure, readability and guided tour

Branch `feat/workspace-ux` (from `main` after PR #5). Spec `docs/specs/2026-10-29-nyx-workspace-ux-tour-design.md`, plan `docs/plans/2026-10-29-nyx-workspace-ux-tour.md`.

## Done

- Navigation follows the path: Home, 1 Targets, 2 Scans, 3 Findings, 4 Assets; Setup: Scan profiles, Plugins. Placeholder screens are out of the menu, the command palette and the scan tabs (a test fails if a menu item or scan tab opens a placeholder). Scope moved to Targets; `/app/settings/policies` redirects.
- Phones: bottom bar with the five path items; Setup, New scan and Sign out under More.
- Home: "Your next step" checklist from real data (target, scan, review), Quick scan, then the dashboard once there is a scan.
- Guided tour: spotlight + NYX portrait card, five steps on the real screens, completes by data, resumes after reload, skips with Esc or Skip, restarts from "?", docks above the bottom bar on phones, no motion with reduced motion. Admins and analysts only.
- Readability: text tokens ≥ 4.5:1 and control borders ≥ 3:1 (test), nothing under 12 px (test), custom dark dropdowns, checkboxes and switches, plugin names instead of ids, relative dates, short durations, sentence-case badges with icons, far less copy (icons and chips instead of paragraphs), confirm before removing a target, phone layouts for scans, findings and assets.

## Verified

- `pnpm test` 31 passed (contrast, tiny text, navigation, progress, tour model and storage, date formatting); `pnpm lint`, `tsc --noEmit` clean; the web image builds.
- Playwright on the local stack: path navigation, bottom bar and More at 390 px, Home for admin and viewer, the tour through every state with API responses mocked in the browser (fresh, running, failed, findings, review), skip/reload/restart/Esc, phone docking.
- Design audit by a fresh reviewer; P0 and most P1/P2 fixed.

## Open

- Findings repeat one issue per URL (`http`, `https`, `:80`, `:443`): grouping by issue and host is a data-model change, not done.
- Disabled primary buttons (empty form) still read as grey without a reason.
- Old local scans hold `:443` duplicates from before the canonical-URL change.

## Next

1. User review, then PR / merge (only when the user says so).
2. Settings → Appearance: dark, light, system and IDE-style themes (GitHub, Monokai, One Dark…), with the contrast test run per theme. Needs its own design: the spec for this work had "no light theme" as a non-goal.
3. Deploy to a VPS; with it: honeypot on sign-in and sign-up, Cloudflare Turnstile, strict login rate limit.
4. Audit log (including secret reveals), Phase 4c (CVE, EPSS, KEV).
