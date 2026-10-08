import type { Finding, Scan } from "@/lib/types";

// Seed data lifted from the design prototype. Replaced by the FastAPI backend later.
export const findings: Finding[] = [
  { id: "f-001", title: "Exposed .git directory", severity: "critical", asset: "staging.acme.io", confidence: 4, kev: false, sourcePlugin: "nuclei", firstSeen: "2026-09-30", status: "open", diff: "new" },
  { id: "f-002", title: "Outdated nginx with known exploited CVE", severity: "high", asset: "edge-2.acme.io", confidence: 3, epss: 0.62, kev: true, sourcePlugin: "httpx", firstSeen: "2026-09-30", status: "open", cve: "CVE-2021-23017", diff: "new" },
  { id: "f-003", title: "TLS certificate expires in 9 days", severity: "medium", asset: "api.acme.io", confidence: 4, kev: false, sourcePlugin: "tlsx", firstSeen: "2026-09-12", status: "open", diff: "changed" },
  { id: "f-004", title: "Missing security headers", severity: "low", asset: "www.acme.io", confidence: 4, kev: false, sourcePlugin: "httpx", firstSeen: "2026-08-21", status: "open", diff: "unchanged" },
];

export const scans: Scan[] = [
  { id: "scan-0010", target: "acme.io", profile: "Balanced", status: "running", startedAt: "2026-10-03T08:12:00Z", durationSec: 412, pluginsRun: 6, pluginsTotal: 10, assets: 143, findings: 14 },
  { id: "scan-0009", target: "acme.io", profile: "Balanced", status: "completed", startedAt: "2026-09-30T08:00:00Z", durationSec: 1180, pluginsRun: 8, pluginsTotal: 10, assets: 116, findings: 11 },
];
