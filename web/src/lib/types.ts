export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type ScanStatus = "queued" | "running" | "completed" | "failed";
export type DiffState = "new" | "changed" | "resolved" | "unchanged";

export type Finding = {
  id: string;
  title: string;
  severity: Severity;
  asset: string;
  confidence: 1 | 2 | 3 | 4;
  epss?: number;
  kev: boolean;
  sourcePlugin: string;
  firstSeen: string;
  status: "open" | "confirmed" | "false_positive" | "resolved";
  cve?: string;
  diff: DiffState;
};

export type Scan = {
  id: string;
  target: string;
  profile: string;
  status: ScanStatus;
  startedAt: string;
  durationSec: number;
  pluginsRun: number;
  pluginsTotal: number;
  assets: number;
  findings: number;
};

export type Plugin = {
  slug: string;
  name: string;
  publisher: string;
  description: string;
  category: string;
  tier: "verified" | "community";
  risk: "passive" | "active";
  state: "installed" | "update" | "available";
  version: string;
};
