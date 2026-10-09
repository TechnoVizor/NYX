import type { Finding } from "@/lib/types";

// Seed data lifted from the design prototype. Replaced by the FastAPI backend later.
export const findings: Finding[] = [
  { id: "f-001", title: "Exposed .git directory", severity: "critical", asset: "staging.acme.io", confidence: 4, kev: false, sourcePlugin: "nuclei", firstSeen: "2026-09-30", status: "open", diff: "new" },
  { id: "f-002", title: "Outdated nginx with known exploited CVE", severity: "high", asset: "edge-2.acme.io", confidence: 3, epss: 0.62, kev: true, sourcePlugin: "httpx", firstSeen: "2026-09-30", status: "open", cve: "CVE-2021-23017", diff: "new" },
  { id: "f-003", title: "TLS certificate expires in 9 days", severity: "medium", asset: "api.acme.io", confidence: 4, kev: false, sourcePlugin: "tlsx", firstSeen: "2026-09-12", status: "open", diff: "changed" },
  { id: "f-004", title: "Missing security headers", severity: "low", asset: "www.acme.io", confidence: 4, kev: false, sourcePlugin: "httpx", firstSeen: "2026-08-21", status: "open", diff: "unchanged" },
];
