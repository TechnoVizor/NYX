export type Severity = "critical" | "high" | "medium" | "low" | "info";
export const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
export type FindingStatus = "open" | "confirmed" | "false_positive" | "accepted_risk" | "fixed";
export const findingStatuses: FindingStatus[] = ["open", "confirmed", "false_positive", "accepted_risk", "fixed"];

export type RiskLevel = "passive" | "safe_active" | "active" | "intrusive";
export type TargetType = "domain" | "ip" | "cidr" | "url" | "service";
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
  config_schema?: JsonSchema;
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
  id: string; root_target: Target; plugin_ids: string[]; plugin_config: PluginConfig; profile_id: string | null; max_depth: number; max_targets: number;
  status: ScanStatus; error: string | null; created_at: string; started_at: string | null; finished_at: string | null;
};
export type ScanDetail = Scan & {
  targets_in_scope: number; targets_out_of_scope: number; runs: Partial<Record<RunStatus, number>>;
  events: number; container_seconds: number; findings_by_severity: Partial<Record<Severity, number>>;
};
export type ScanTarget = { type: TargetType; value: string; depth: number; in_scope: boolean; refusal: string | null; source_run_id: string | null };
export type ScanInput = { target: Target; plugin_ids?: string[]; max_depth?: number; profile_id?: string; plugin_config?: PluginConfig };

export type Page<T> = { items: T[]; total: number };
export type AssetRef = { id: string; kind: string; value: string };
export type FindingRow = {
  id: string; title: string; severity: Severity; status: FindingStatus; plugin_id: string; template_id: string;
  matched_at: string; asset: AssetRef | null; first_seen: string; last_seen: string; occurrences: number;
};
export type FindingDetail = FindingRow & {
  data: Record<string, unknown>; status_note: string | null; status_by: string | null; status_at: string | null;
  occurrences_list: { scan_id: string; root_target: Target; run_id: string | null; event_seq: number | null; seen_at: string }[];
  raw: Record<string, unknown> | null;
};
export type FindingFilters = { severity?: Severity[]; status?: FindingStatus[]; plugin_id?: string; scan_id?: string; q?: string };

export type Asset = AssetRef & { data: Record<string, unknown>; first_seen: string; last_seen: string; open_findings: number };
export type AssetDetail = Asset & { findings: FindingRow[]; scans: Scan[] };

export type Dashboard = {
  open_by_severity: Record<Severity, number>; open_total: number; assets_total: number; assets_new_7d: number;
  findings_per_day: { date: string; count: number }[]; recent_scans: Scan[];
  top_assets: (AssetRef & { open_findings: number; worst_severity: Severity })[];
};

export type JsonSchema = { type?: string; enum?: unknown[]; items?: JsonSchema; properties?: Record<string, JsonSchema>; default?: unknown; [k: string]: unknown };
export type PluginConfig = Record<string, Record<string, unknown>>;
export type ProfileInput = { name: string; description: string; plugin_ids: string[]; plugin_config: PluginConfig; max_depth: number };
export type Profile = ProfileInput & { id: string; builtin: boolean; created_at: string; updated_at: string; available: boolean; unavailable: string[] };
