# Checkpoint 2026-10-29 — IDE workbench, themes, less text

Branch `feat/ide-workbench-themes` (from `main` after PR #6). Product record `PRODUCT.md`, spec `docs/specs/2026-10-29-nyx-ide-workbench-themes-design.md`, plan `docs/plans/2026-10-29-nyx-ide-workbench-themes.md`. Part 1 of 2; part 2 is "Findings like a CRM".

## Done

- Themes as data (`web/src/lib/themes.ts`): NYX (default), GitHub Dark, GitHub Light, One Dark, Monokai, Dracula, Nord, Catppuccin Mocha and Latte. One derivation makes every CSS token; `pnpm themes` writes `web/src/app/themes.css` (a test fails if it is stale). IDE palettes nudged in lightness where WCAG failed, each marked `adapted`.
- Contrast test per theme: text and severity on all four surfaces, severity on its own pill, filled buttons, status bar, control borders and focus.
- Preference per browser (`nyx-theme`): Light / Dark / System with a dark slot and a light slot. Applied before first paint by an inline script (tested against the same rules), follows the OS live, crossfades on change unless motion is reduced. Sign-in and onboarding stay NYX dark.
- Settings → Appearance: mode switch with icons and two grids of preview cards drawn in each theme's own colours; also "Theme: …" and "Theme mode: …" in Ctrl+K and the mode switch in the phone More sheet.
- IDE shell: icon rail (tooltips with path numbers, Findings badge for open critical + high, Settings at the bottom), breadcrumbs with record names, avatar menu (email, role, Appearance, Sign out), status bar (running scan with tools done/total and "+N", red "Scan failed" until that scan is opened in this browser, open critical + high, theme name, Ctrl K).
- Colour and icons instead of words: scan and finding statuses with icons and theme hues, plugins as stable coloured letter tiles, asset kinds coloured, page subtitles removed (rules behind an info icon), Home stat strip instead of metric cards, one empty-state pattern.
- Fix: the guided tour closed right after "Show me" on a workspace that was already set up (steps completed from data). Each step now ends on its button; a done step shows a short card with Next.

## Verified

- `pnpm test` 98 passed; `pnpm lint`, `tsc --noEmit` and `pnpm build` clean; impeccable detector: 0 findings.
- Playwright on a local `pnpm dev -p 3002` (port 3001 is the Docker image of `main`): no-flash theme load, junk preference fallback, live system switch, Appearance clicks, Ctrl+K theme, reload persistence, rail anchors visible once at 1400 and 390, tour walk on a set-up workspace, status bar running / failed / seen with mocked scans, 60 screenshots (10 screens × 1400/390 × NYX, GitHub Light, Monokai).

## Open

- Findings still repeat one issue per URL; grouping, side peek panel, saved views, triage reasons and bulk actions are part 2.
- The Docker web image on :3001 shows the old UI until it is rebuilt.

## Next

1. User review, then PR / merge (only when the user says so).
2. Part 2: Findings like a CRM (grouping by issue, peek panel, saved views, triage with reasons, bulk actions, secondary sidebar with views and target tree).
3. VPS deploy with honeypot, Cloudflare Turnstile, strict login rate limit.
