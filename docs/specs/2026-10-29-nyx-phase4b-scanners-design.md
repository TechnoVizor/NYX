# NYX Phase 4b — Naabu, tlsx, Katana, gau

Date: 2026-10-29. Status: approved in chat (scope: "more scanners" for today's MVP).

## Goal

Second part of Phase 4 (brief §53, Balanced Scan table): four recon plugins join the chain, so a Balanced scan covers ports, TLS certificates, crawled endpoints and archived URLs, not only subdomains, DNS, HTTP and Nuclei. The platform core stays tool-agnostic: plugins declare what they accept and produce, and routing goes by data kind.

Success:

1. `docker compose --profile plugins build` builds the four images; the registry lists them with the risk levels below.
2. With the lab testbed (scope `nyx-lab.test`, active allowed), a Balanced scan of `testbed.nyx-lab.test` ends `COMPLETED` or `PARTIAL` (gau has no archive data for a `.test` name) and stores at least: a `port` asset for 80 and 443, a `certificate` asset, the certificate's second name as a new target, and `endpoint` assets from Katana. Each finding is stored once, whether a tool reported `https://host:443/x` or `https://host/x`.
3. A port Naabu finds goes on to httpx, and the web service found there goes on to Nuclei.
4. CI is green: adapter fixture tests for the four plugins, routing test for `port`, migration test for 0007.

## 1. Plugins

| Plugin | Version | Accepts | Emits | Risk | Network |
|---|---|---|---|---|---|
| `projectdiscovery.naabu` | 2.6.1 | domain, ip | asset `port` (`host:port`) | safe_active | target_scope |
| `projectdiscovery.tlsx` | 1.4.0 | domain, ip | asset `certificate`, asset `subdomain` (SANs), relations | safe_active | target_scope |
| `projectdiscovery.katana` | 1.8.0 | url | asset `endpoint` | safe_active | target_scope |
| `lc.gau` | 2.2.4 | domain | asset `endpoint` | passive | public |

Versions are the latest releases older than two weeks; naabu 2.7.0 (released 2026-10-28) is skipped for that reason. Binaries are pinned by sha256 per architecture, as for the existing plugins.

- **Naabu.** Connect scan (`-scan-type c`): no raw sockets, so the sandbox keeps `raw_socket: false`. Naabu links libpcap, so the image installs it. `-ec` scans only 80/443 on CDN addresses. Config: `top_ports` ∈ {100, 1000}, default 100. Rate from the manifest. Hosts that do not resolve are skipped first (naabu fails a whole batch otherwise). Tools that bring public resolvers get the sandbox's Docker DNS (`-r`), the only DNS a `target_scope` sandbox can reach.
- **tlsx.** Port 443. Certificate asset value = SHA-256 fingerprint; data = subject CN, SANs, issuer, validity, host. Relation `host serves_certificate fingerprint`. Each SAN that is a hostname (wildcard prefix stripped) becomes a `subdomain` asset, so it is scope-checked and scanned like any other subdomain. No findings: Nuclei's ssl templates already report expired, self-signed and mismatched certificates, and two plugins reporting one problem would make two findings.
- **Katana.** Standard crawler only (no headless). Stays on the target's host (`-fs fqdn`), skips static files, crawl time capped. Config: `depth` 1–3, default 2.
- **gau.** Asks Wayback, Common Crawl, OTX and urlscan for the domain (no subdomains: those arrive as their own targets). Static files are skipped. The adapter stops after 5000 URLs per run and logs that it did.

## 2. Routing

A new target type `service` (`host:port`) carries open ports. `ASSET_TARGET` gains `port → service`; only httpx accepts `service`, so Katana and Nuclei see a port only after httpx confirmed HTTP on it (brief: no crawler for a host without an HTTP service). Scope checks a service by its host; the runner's firewall opens the host, never the literal `host:port`. `certificate` and `endpoint` are data, not targets: they are not routed in 4b. Deciding which endpoints deserve Nuclei is the planner's job (Phase 6).

URLs lose a port their scheme implies (`https://h:443/x` → `https://h/x`) in targets, asset values and `matched_at`, so one resource is one asset and one finding. Nothing else in a URL changes.

Findings can link to `port` assets (`LINKABLE`), so a TLS finding on `host:443` sits on the port when Naabu found it.

## 3. Profiles (migration 0007)

Built-in profiles follow the brief:

- **Quick**: Subfinder, httpx, Katana (depth 1), Nuclei high and critical.
- **Balanced**: Subfinder, dnsx, Naabu (top 100), httpx, tlsx, Katana (depth 2), gau, Nuclei low and up.

User profiles are left as they are. Downgrade restores the 0006 lists.

## 4. Lab

The testbed gets its own small image: nginx plus a self-signed certificate generated at build time (no key in the repository), HTTPS on 443, and an index page with links for Katana to follow.

## 5. UI

Asset kinds `port`, `certificate`, `endpoint` get labels (Port, Certificate, Endpoint) in the Assets filter and table. Nothing else changes: findings and assets already render whatever plugins emit.

## Out of scope

Planner-driven routing of endpoints to Nuclei (Phase 6), deduplicating port scans of a name and its address, tlsx on non-443 ports, Katana headless mode, gau subdomain mode.

## Tasks

1. Lab testbed image with TLS and links.
2. Naabu plugin + fixture recorded against the testbed + adapter test.
3. tlsx plugin + fixture + adapter test.
4. Katana plugin + fixture + adapter test.
5. gau plugin + fixture recorded for `example.com` (public archives, passive) + adapter test.
6. Routing `port → url`, `LINKABLE` += port, tests.
7. Migration 0007 for built-in profiles + migration test.
8. Web: asset kind labels.
9. README (scan steps, roadmap), compose entries, end-to-end Balanced scan of the testbed.
