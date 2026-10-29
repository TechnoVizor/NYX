# Checkpoint 2026-10-29 — Command center (Dovetail language + new Home)

Branch `feat/command-center` (from `main` after PR #7). Spec `docs/specs/2026-10-29-nyx-command-center-design.md`, plan `docs/plans/2026-10-29-nyx-command-center.md`. Reference: dovetail.com and its `DESIGN.md` from the owner; Home direction A from the brainstorm mockups.

## Done

- NYX theme in the Dovetail palette: `#0a0a0a` canvas, `#141414` panels, `#1e1e1e` raised, `#313131` strong borders, white text and primary, `#6798ff` accent and status bar. Every theme puts cards on its `panel` tone.
- Inter for the interface, JetBrains Mono for data; tracking tightens with size; corners stop at 8px (4px tags); no drop shadows on cards, popovers, menus or the tour card (tests pin both).
- Home rebuilt as a command center: meta line, "N issues need you. Scan something new?", a command bar (profile chips, white Start scan), a stat strip (critical + high, open, assets with weekly delta, new findings this week), 30-day bars stacked by severity, an open-by-severity ring, recent scans and riskiest assets; a faint blueprint grid behind the top. First run shows the checklist only; until the path is done a one-line progress row sits above the headline.
- API: `findings_per_day[].by_severity`.
- Rest of the admin on the same surfaces: tables on the card tone with a section-tone header, panels on `card`, outline buttons transparent with a strong border, 24px titles.
- Sidebar without step numbers (owner request).

## Verified

- `pnpm test` 111/111, `pnpm lint`, `pnpm build`; API `pytest` 262/262; impeccable detector 0 findings.
- Playwright on local dev (:3002, API container rebuilt): first viewport at 1400×900 holds headline, command bar, stat strip and the chart's top; viewer has no command bar; a 120-character target causes no horizontal scroll at 390; empty workspace shows only the checklist; tour still finds `quick-scan`; 60 screenshots (10 screens × 1400/390 × NYX, GitHub Light, Monokai).

## Open

- The Docker web image on :3001 shows the previous UI until rebuilt (the API image was rebuilt for `by_severity`).
- Part 2, "Findings like a CRM", is next.
