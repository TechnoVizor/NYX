# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who have to answer "what do we actually expose?": a small security team, a solo pentester, a student learning recon. The owner's working assumption (2026-10-29): many of them open NYX for the first time without knowing recon tools, and many are developers who live in an IDE. They come back to check a scan, triage what it found, and move on.

## Product Purpose

NYX maps an organisation's attack surface: give it a target you own, it runs open-source scanners (Subfinder, httpx, Naabu, tlsx, Katana, gau, Nuclei, …) in locked-down containers and turns their output into assets and findings with the raw evidence kept behind each one. Success: a user goes from a target to a reviewed finding without reading docs, and trusts each finding because the proof is one click away.

It is also a bachelor's thesis: can a scanner that decides the next tool from the last result do the same job with less noise and waste?

## Positioning

Open-source, self-hosted, scope-safe by construction (no packet leaves without a scope check; plugins run in sandboxes with an egress firewall), evidence behind every finding, secrets masked by default.

## Operating Context

Self-hosted web workspace (Next.js) on a FastAPI + Temporal backend. Used in long sessions next to an editor and a terminal. Roles: admin, operator, viewer. Scans take minutes; users glance at progress, then triage.

## Capabilities and Constraints

- Screens: Home, Targets (scope), Scans (list, detail with runs/findings/metrics), Findings (list, detail with reveal), Assets, Scan profiles, Plugins; Settings returns with Appearance.
- UI copy is English; product chat with the owner is Russian.
- Only scan targets in scope; never show secrets unmasked without an explicit reveal by an operator.
- Undecided: audit log, CVE/EPSS/KEV enrichment, reports.

## Brand Commitments

- Name NYX, first-person voice in the README and the guided tour; the NYX portrait (`web/public/brand/nyx-portrait.webp`) is the tour's face.
- Owner direction (2026-10-29): the workspace should feel like the most convenient CRM with a VS Code / IDE vibe, with switchable IDE themes (GitHub, One Dark, Monokai, Dracula, Nord, Catppuccin) plus light, dark and system modes.
- Owner direction: as little text as possible; colour, icons and graphics carry meaning; custom controls, never native dropdowns.

## Evidence on Hand

Lab testbed (`lab/`) with real scan results; no customers, testimonials or benchmarks exist and none may be invented.

## Product Principles

1. Proof over claims: every finding links to its evidence.
2. Show state, don't describe it: colour, icon and position before a sentence.
3. Keyboard-first and fast for repeat use; teach once for first use.
4. Safe by default: scope checks and masking are visible, not hidden.

## Accessibility & Inclusion

WCAG 2.2 AA in every theme: text 4.5:1, control boundaries and focus 3:1, nothing below 12px; colour is never the only signal; `prefers-reduced-motion` respected. Enforced by `web/src/lib/contrast.test.ts`.
