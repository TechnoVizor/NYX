export type Severity = "critical" | "high" | "medium" | "low" | "info";
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

export type RiskLevel = "passive" | "safe_active" | "active" | "intrusive";
export type TargetType = "domain" | "ip" | "cidr" | "url";
export type Target = { type: TargetType; value: string };

export type PluginSummary = {
  id: string; name: string; publisher: string; description: string; categories: string[];
  risk_level: RiskLevel; trust_level: "verified" | "community" | "custom";
  version: string; image: string; digest: string | null; enabled: boolean; updated_at: string;
};

export type RunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED";
export type PluginRun = {
  id: string; scan_id: string | null; plugin_id: string; plugin_version: string; target: Target; targets: Target[]; attempt: number; status: RunStatus;
  error: string | null; exit_code: number | null; event_count: number;
  created_at: string; started_at: string | null; finished_at: string | null;
};

export type PluginManifest = {
  io: { accepts: TargetType[]; produces: string[] };
  resources: { cpu: number; memory_mb: number; timeout_seconds: number };
  permissions: Record<string, string | boolean>;
  limits: { default_rate_limit: number };
};
export type PluginDetail = PluginSummary & { manifest: PluginManifest; runs: PluginRun[] };

export type PluginEvent = { seq: number; type: string; valid: boolean; payload: { data?: Record<string, unknown>; raw?: string } };

export type ScopeEntry = { id: string; kind: "domain" | "cidr"; value: string; active_allowed: boolean; authorization: string; created_at: string };
export type ScopeInput = Omit<ScopeEntry, "id" | "created_at">;

export type User = { id: string; email: string; role: "admin" | "analyst" | "viewer"; created_at: string };
export type Credentials = { email: string; password: string };

export type ScanStatus = "CREATED" | "RUNNING" | "PAUSED" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
export const scanFinal: ScanStatus[] = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"];

export type Scan = {
  id: string; root_target: Target; plugin_ids: string[]; max_depth: number; max_targets: number;
  status: ScanStatus; error: string | null; created_at: string; started_at: string | null; finished_at: string | null;
};
export type ScanDetail = Scan & {
  targets_in_scope: number; targets_out_of_scope: number; runs: Partial<Record<RunStatus, number>>;
  events: number; container_seconds: number;
};
export type ScanTarget = { type: TargetType; value: string; depth: number; in_scope: boolean; refusal: string | null; source_run_id: string | null };
export type ScanInput = { target: Target; plugin_ids: string[]; max_depth: number };
