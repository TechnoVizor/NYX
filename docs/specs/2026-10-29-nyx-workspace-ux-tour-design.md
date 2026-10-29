# NYX workspace — clearer structure, readable UI, guided tour

Date: 2026-10-29. Status: agreed in chat (structure A, tour style A, mobile navigation in scope); pending written review.

## Why

A user who has never seen NYX logs in and does not know what to do: thirteen menu items (five of them "Not built yet"), a dashboard of numbers before there is any data, and grey text that is hard to read. The product has one real path — say what you may scan, scan it, read what NYX found, review it — and the interface should make that path obvious, then teach it once, in NYX's own voice.

Audience: an ordinary user, new to the product and to recon tools.

Success:

1. A new admin, without the README, goes from first sign-in to a reviewed finding by following the screen alone.
2. The guided tour walks that path on the real screens, with NYX's portrait and first-person lines, and each step completes when the user actually does the thing.
3. Every text and control on the workspace meets WCAG 2.2 AA contrast: 4.5:1 for text, 3:1 for control boundaries and focus; nothing below 12 px.
4. No menu item, tab or link leads to a "Not built yet" page.

## Goals

- Navigation that follows the path and shows only what works.
- A Home screen that says what to do next.
- Readable, consistent UI: contrast, sizes, human labels.
- A guided tour in NYX's style, animated, skippable, restartable.

## Non-goals

- New product capabilities (graph, reports, audit log, settings content). They return to the menu when their phase ships.
- A light theme.
- Translating the UI: it stays in English, like the README and the brand.
- A full visual redesign of every page; pages get the token, size and label fixes, not new layouts, unless listed below.

## Anti-goals (a failure even if it "works")

- A tour that blocks: it must never trap the user, make them wait for a scan, or hide the Skip.
- A tour that runs fake steps or fake data: steps act on the user's real workspace.
- Motion that ignores `prefers-reduced-motion`, or that makes the UI slower to use after the tour.
- Hiding a placeholder from the menu but leaving it reachable from another button or the command palette.

## 1. Navigation (decided: option A)

Sidebar, top to bottom:

- **Home**
- **1 Targets** — today's Settings → Scope (`/app/settings/policies`), promoted to the top level.
- **2 Scans**
- **3 Findings**
- **4 Assets**
- group **Setup**: Scan profiles, Plugins.
- the existing **New scan** button stays above the list.

The numbers are part of the label: they teach the order.

Hidden until their phase ships: Graph, Experiments, Reports, Audit log, and Settings (every Settings tab but Scope is a placeholder; Scope moves to Targets). Their routes may stay reachable by direct URL; nothing in the UI links to them (menu, command palette, buttons, scan tabs).

Scan detail tabs: Overview, Findings, Metrics. Live (a redirect today), Graph, Evidence, Changes and Report are hidden.

**Mobile (decided: in scope).** Below the `md` breakpoint the sidebar is hidden today and there is no other navigation. Narrow screens get a bottom bar with the five primary items (Home, Targets, Scans, Findings, Assets), icon plus short label, the current item marked by more than colour; Setup items and New scan are reachable from a "More" sheet or the top bar. Touch targets at least 44 px. The tour's targets must exist on small screens (the bottom bar items, not the hidden sidebar).

## 2. Home (decided)

Home replaces Dashboard as the first screen after sign-in.

- Top: NYX greets in first person and shows **Your next step**, a four-item checklist:
  1. Account created
  2. Add a target you're allowed to test
  3. Run your first scan
  4. Review what I found
  Each item is checked from real data (a scope entry exists; a scan exists; any finding has a review status other than open). The current item has one primary button that goes to the right place.
- Quick scan lives on Home (it exists on the dashboard today).
- When all four are done, the checklist collapses to a single line (with a way to reopen it), and the existing dashboard content (numbers, severity bar, findings per day, recent scans, top assets) is the body of Home.
- Before any scan, the dashboard blocks are not shown as rows of zeros: the next-step block is the page. Between the first scan and the first review, Home shows the checklist above the dashboard body.

## 3. Readability (decided)

- Text tokens: secondary and tertiary text reach at least 4.5:1 on every surface they are used on (today `--subtle` #71717a gives 4.2:1 on the background and 3.7:1 on surface-3; `--muted-foreground` at 7.9:1 is fine). This brings back the landing's rule ("mono captions no paler than white/55").
- Control boundaries: input, select and textarea borders, and the focus ring, reach 3:1 against their background (today input borders are about 1.2:1).
- Minimum text size 12 px; today's 10–11 px labels (severity badges, nav group labels) go up.
- Severity and statuses keep a word next to the colour (already true); statuses and buttons use human words.
- Check every page against these rules with a contrast tool, not by eye.

## 4. Guided tour (decided: option A, "spotlight + NYX portrait")

Look: the screen dims; the element the step is about gets a brand-coloured outline (`--brand`); next to it a card with NYX's portrait (`.github/assets/nyx.png` or the landing's photos), a mono caption `STEP n / 5 · NAME`, one or two first-person sentences, a primary button and "Skip tour". On narrow screens the card docks to the bottom.

Motion: the spotlight and card glide from one element to the next; the card enters with a short fade/slide. With `prefers-reduced-motion` they jump without animation.

Steps:

1. **Home** — NYX introduces herself and the path (four steps, a few minutes). Start / Skip.
2. **Targets** — spotlight on the add form; explains scope and the authorization note. Completes when a target is actually added. NYX always mentions the lab as a conditional tip ("if you started the lab testbed, `nyx-lab.test` is a safe target"); NYX does not detect whether the lab runs. Analysts cannot add targets (`POST /scope` is admin-only): for them the step is done when scope already has an entry, and otherwise NYX says an admin adds targets and the tour waits on this step.
3. **Scans** — spotlight on Quick scan, then on Start scan. Completes when a scan is started. While it runs, NYX explains the scan page briefly (what each scanner does) and says she will come back when it is done; the user is free to leave. The tour continues when the scan finishes, on whatever screen the user is on (a small prompt, not a forced jump).
4. **Findings** — spotlight on the first finding; explains severity, where the evidence comes from, why secrets are masked.
5. **Review** — spotlight on the review control; completes when the user saves a review with a status other than open. NYX closes the tour; the Home checklist is complete.

End states:

- Steps complete by **data, not events**: a step is done when its fact holds (a scope entry exists; a scan exists; a finished scan exists; a finding has a status other than open). Starting the tour on a workspace where some steps are already true skips them.
- The first scan finishes with **no findings**: NYX says so as good news, checklist item 4 counts as done, and the tour ends with the lab tip as a way to see findings.
- The first scan ends **FAILED** or **CANCELLED**: NYX explains in plain words (the scan's error) and offers Run again; the tour stays on step 3. **PARTIAL** with findings continues to step 4.

Rules:

- Skip is always available; a "?" in the top bar restarts the tour.
- Tour state (seen / current step / skipped) lives in the browser (localStorage, read and written defensively). Progress on Home does not depend on it: the checklist comes from real data.
- The tour shows once per browser after the first sign-in, and only to admins and analysts (viewers cannot add targets or start scans; they get the Home checklist read-only, without the tour).
- Copy: short, English, first person, same voice as the README and landing.

## Constraints

- Next.js 16 as installed (read `node_modules/next/dist/docs` before writing code), React, Tailwind tokens in `src/app/globals.css`, the `motion` package already installed. No new dependency without a reason.
- Dark-only theme; tokens on `:root`.
- The API stays as it is unless a step needs data it does not expose; prefer existing endpoints (`/scope`, `/scans`, `/findings`, `/dashboard`, `/me`).
- Quality bar: the HITEXIS checklist (one term per concept, real-action verbs, empty/error/loading states, no colour-only meaning, keyboard path, honest copy).
- Design and build with the `impeccable` and `senior-frontend` skills (the user asked for them): critique, audit and polish passes on the real screens, checked with screenshots at desktop and phone widths.

## Left to the builder

Exact token values and type scale; component structure of the tour; spotlight technique (overlay with cut-out vs. outline only); exact copy within the voice above; route names (keeping old URLs working via redirect is enough); how the tour finds its target elements (data attributes are fine); whether Home keeps `/app/dashboard` or becomes `/app`.

## Calls I made (not discussed)

- Analysts: tour step 2 is satisfied by an existing scope entry, otherwise NYX tells them an admin adds targets; the API stays admin-only for scope.
- Tour steps complete by data, not by events; satisfied steps are skipped.
- A first scan with no findings completes checklist item 4; FAILED/CANCELLED keeps the tour on step 3 with Run again.
- The lab tip is always conditional; no testbed detection.
- The "Settings → Scope" link in Quick scan points to Targets.

- Settings leaves the menu until it has a working tab; Scope lives at Targets.
- Scan detail keeps Overview, Findings, Metrics only.
- Animation with the `motion` package already in the web app, not GSAP (the landing's GSAP is not installed here).
- Tour only for admins and analysts; viewers get a read-only checklist.
