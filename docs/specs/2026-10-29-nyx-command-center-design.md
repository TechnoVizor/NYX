# NYX command center: Dovetail-style workspace and a new Home

Date: 2026-10-29. Status: agreed in chat (reference dovetail.com + its `DESIGN.md` from the owner; Home direction A "Command center" from `.superpowers/brainstorm/542-1793281749/content/home-directions.html`; the language applies to the whole admin). Pending written review.

## Why

After the IDE-workbench pass the owner says the UX is better but the admin "looks flat", "stuck in the 2000s", and Home in particular should feel modern. Reference: Dovetail — "a blueprint control room at midnight": near-black canvas, depth through tone layers instead of shadows, a faint blueprint grid, Inter with tight tracking, big numbers, monospaced instrument labels, one cornflower accent, white primary buttons, charts with coloured data bars that lead the screen.

What Home is for (owner's words): the user comes in and sees charts and information, and can start a scan straight away.

Product truth and audience: `PRODUCT.md`. The theme system, IDE shell and per-theme contrast test from `docs/specs/2026-10-29-nyx-ide-workbench-themes-design.md` stay.

Success:

1. Home, in the first viewport, answers "what needs me" (a headline with the count), offers a scan (a command bar), and shows the numbers and the 30-day chart — no scrolling at 1400×900 for those three.
2. Every screen reads as one product with Home: the same canvas, tone layers, type, radii and buttons.
3. Every theme still passes the contrast test; the NYX theme now carries the Dovetail palette.

## Goals

- NYX theme retuned to the Dovetail palette; global type, radius and surface rules from the reference applied to all themes.
- Home rebuilt as the Command center (direction A).
- The rest of the admin restyled through tokens and shared components, not page by page rewrites.

## Non-goals

- Part 2 work ("Findings like a CRM"): grouping, peek panel, saved views, triage reasons, bulk actions.
- New data on Home beyond one additive API field (per-day counts by severity).
- Changing the IDE themes' colours; they only inherit type, radii and surfaces rules.
- Marketing-site elements of Dovetail (announcement bar, logo strip, footer, display sizes 56–64px).

## Anti-goals

- Shadows, gradients or glass to fake depth: depth is tone only.
- The blue accent as a filled button background, or a second decorative colour. Severity colours appear only in data (charts, pills, dots).
- Losing what works: themes, sidebar, status bar, tour anchors, quick-scan behaviour (profile choice, inline scope add for admins), roles.
- Text creeping back: Home keeps one headline and one line of meta, not paragraphs.

## 1. Design language (all screens, all themes)

- **Type:** Inter for UI (400 body, 500 labels/buttons, 600 headings), JetBrains Mono for data (hosts, ids, numbers in tables, kbd) and the one meta line on Home. Replaces Geist / Geist Mono / Inter Tight. Tracking tightens with size: −0.012em at 13–14px, −0.02em at 20–24px, −0.03em at 32–40px. Page titles 24px/600; Home headline 40px/600 (32px on phones).
- **Radius:** 8px for cards, inputs, buttons, menus; 4px for tags/pills/tiles. No pills on buttons.
- **Surfaces:** canvas → section → card → raised edge, separated by tone and 1px hairlines; no `shadow-*` on cards, popovers keep a 1px ring instead of a drop shadow (dialogs may keep a soft overlay).
- **Buttons:** primary = `primary` token (white in NYX, theme accent in IDE themes, as today); secondary = transparent with a 1px `border-strong` outline; ghost for toolbar actions.
- **Blueprint grid:** a 48px 1px grid in the `border` colour behind the top of Home, masked to fade out; nowhere else.

**All themes:** cards and popovers sit on the `panel` tone (today cards use a 3% tint of the canvas), so every theme gets the canvas → panel → raised layering; IDE theme inputs (their colours) do not change, the contrast test re-checks the derived tones.

**NYX theme palette (starting values, tuned only as needed for the contrast test):** bg `#0a0a0a`, side `#0f0f0f`, panel (cards/popovers) `#141414`, raised `#1e1e1e`, fg `#ffffff`, muted `#a7a7a7`, border `#1e1e1e`, border-strong `#313131`, input boundary ≥3:1 (≈ `#6b6b6b`, since `#454545` fails on `#0a0a0a`), accent/brand `#6798ff`, primary `#ffffff` on `#0a0a0a`, status bar `#6798ff` with dark text. Severity hues stay as today.

## 2. Home — Command center

Top to bottom, max width 1200px, centred:

1. **Meta line** (mono, muted): `Workspace · N targets · last scan <ago>`.
2. **Headline** (40px): when open critical+high > 0 — "**N issues need you.** *Scan something new?*" (second sentence muted); when 0 — "**All clear.** *Scan something new?*". Viewers see only the first sentence.
   - **Before the first scan:** the first-run checklist (today's Next steps) takes the headline's place, and the stat strip, charts and lists stay hidden (as today).
   - **After the first scan, until the path is done:** the checklist shrinks to one compact row above the headline (step dots + the next action as a link), carrying the `home-steps` tour anchor, so the first viewport still fits.
   - **Path done:** no checklist; the tour stays available from "?".
3. **Command bar**: one wide input (target icon, placeholder "Domain, IP or URL"), profile chips (from saved profiles, the default one selected), white "Start scan →". Same behaviour as today's Quick scan, including the admin inline "add to scope" when the target is out of scope. Enter submits.
4. **Stat strip**: one panel with four cells divided by hairlines — Critical + high (red flame), Open findings (orange shield), Assets (blue boxes, delta chip `+assets_new_7d` when > 0), New findings this week (green sparkle: sum of the last 7 days of `findings_per_day`, any status — labelled as "new", not "open"). Each: icon, 36px number, label. Each cell links to its list (the first two and the last to Findings, Assets to Assets).
5. **Charts row** (2 : 1): "Findings · 30 days" stacked bars by severity per day with a light baseline grid, date ends in mono, legend with counts; "Open by severity" ring with the total in the middle and a 2×2 legend.
6. **Lists row** (1 : 1): "Recent scans" (status dot — pulsing while running —, target, status word, plugin tiles, age) and "Riskiest assets" (severity pill, mono value, a bar proportional to open findings, count), each with "View all →".

Phones: headline 32px, command bar wraps (chips under the input), stat strip 2×2, charts and lists stack.



**API (additive):** `findings_per_day` items gain `by_severity: {critical, high, medium, low, info}` (counts of findings first seen that day). `count` stays for compatibility.

## 3. Rest of the admin

Through tokens and shared components only: page header (24px title), cards/panels (tone, hairline, 8px), tables (header row on section tone, mono for data columns, row hover on raised tone), inputs/selects (8px, `input` boundary), buttons (§1), badges/pills (4px), tooltips/menus (ring, no shadow), sidebar and top bar (Dovetail canvas/section tones). Screens: Targets, Scans, scan detail, Findings, finding detail, Assets, Scan profiles, Plugins, Appearance, login stays NYX.

## 4. Constraints

- No new runtime dependencies beyond fonts via `next/font/google` (Inter, JetBrains Mono).
- Contrast test, 12px floor, nav and copy tests keep passing; every theme passes.
- Motion: only the running-scan dot pulse and existing transitions; reduced motion honoured.
- Verified with Playwright screenshots at 1400 and 390 in NYX, GitHub Light and Monokai; fresh reviewer at the end.

## 5. Left to the builder

Exact tone values within the NYX palette rules, chart drawing details, icon picks, delta chip styling, how profile chips truncate, grid mask shape.

## Calls I made (not discussed)

- Eyebrow-style mono labels: only the one meta line on Home (impeccable bans decorative kickers; the reference uses them on a marketing site).
- No delta on Critical + high (the API has no per-severity history for open counts).
- The blueprint grid only on Home.
- IDE themes keep their colours; they gain the type, radius and surface rules (cards on `panel`).
- Middle state: a compact checklist row above the headline (keeps the first viewport).
- "New this week" counts new findings (7-day sum); the asset growth shows as a delta on Assets; Open findings has no delta.
- Profile chips default to Balanced (no "default profile" exists); viewers get no command bar.
