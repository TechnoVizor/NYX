import type {
  Asset, AssetDetail, Credentials, Dashboard, FindingDetail, FindingFilters, FindingRow, FindingStatus, Page, PluginDetail,
  PluginEvent, PluginRun, PluginSummary, Profile, ProfileInput, Scan, ScanDetail, ScanInput, ScanTarget, ScopeEntry,
  ScopeInput, Target, User,
} from "@/lib/types";

// The only module that knows where data comes from: the real API through the /api rewrite.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const unreachable = "I can't reach the server. Try again.";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { ...init, headers: { "content-type": "application/json" } });
  } catch {
    throw new ApiError(0, unreachable);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (res.ok) return body as T;
  const detail = body?.detail;
  const message =
    typeof detail === "string" ? detail
    : Array.isArray(detail) ? String(detail[0]?.msg ?? "Check the form.")
    : res.status >= 500 ? unreachable
    : "Request failed.";
  throw new ApiError(res.status, message);
}

const send = <T,>(method: string, path: string, body?: unknown) =>
  call<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const post = <T,>(path: string, body?: unknown) => send<T>("POST", path, body);
const qs = (params: Record<string, string | number | string[] | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) s.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return s.size ? `?${s}` : "";
};

export const api = {
  me: () => call<User>("/me"),
  login: (body: Credentials) => post<User>("/auth/login", body),
  signup: (body: Credentials) => post<User>("/auth/signup", body),
  logout: () => post<void>("/auth/logout"),
  listScans: () => call<Scan[]>("/scans"),
  getScan: (id: string) => call<ScanDetail>(`/scans/${id}`),
  startScan: (body: ScanInput) => post<Scan>("/scans", body),
  scanRuns: (id: string) => call<PluginRun[]>(`/scans/${id}/runs`),
  scanTargets: (id: string) => call<ScanTarget[]>(`/scans/${id}/targets`),
  pauseScan: (id: string) => post<Scan>(`/scans/${id}/pause`),
  resumeScan: (id: string) => post<Scan>(`/scans/${id}/resume`),
  cancelScan: (id: string) => post<Scan>(`/scans/${id}/cancel`),
  listFindings: (f: FindingFilters, after = 0) => call<Page<FindingRow>>(`/findings${qs({ ...f, after })}`),
  getFinding: (id: string) => call<FindingDetail>(`/findings/${id}`),
  revealFinding: (id: string) => call<{ extracted?: string[] }>(`/findings/${id}/reveal`),
  reviewFinding: (id: string, body: { status: FindingStatus; note?: string }) => send<FindingDetail>("PATCH", `/findings/${id}`, body),
  listAssets: (f: { kind?: string; q?: string }, after = 0) => call<Page<Asset>>(`/assets${qs({ ...f, after })}`),
  getAsset: (id: string) => call<AssetDetail>(`/assets/${id}`),
  dashboard: () => call<Dashboard>("/dashboard"),
  listProfiles: () => call<Profile[]>("/profiles"),
  createProfile: (body: ProfileInput) => post<Profile>("/profiles", body),
  updateProfile: (id: string, body: Partial<ProfileInput>) => send<Profile>("PATCH", `/profiles/${id}`, body),
  deleteProfile: (id: string) => send<void>("DELETE", `/profiles/${id}`),
  listPlugins: () => call<PluginSummary[]>("/plugins"),
  getPlugin: (id: string) => call<PluginDetail>(`/plugins/${encodeURIComponent(id)}`),
  setPluginEnabled: (id: string, enabled: boolean) => send<PluginSummary>("PATCH", `/plugins/${encodeURIComponent(id)}`, { enabled }),
  startRun: (id: string, target: Target) => post<PluginRun>(`/plugins/${encodeURIComponent(id)}/runs`, { target }),
  getRun: (id: string) => call<PluginRun>(`/runs/${id}`),
  runEvents: (id: string) => call<PluginEvent[]>(`/runs/${id}/events`),
  listScope: () => call<ScopeEntry[]>("/scope"),
  addScope: (body: ScopeInput) => post<ScopeEntry>("/scope", body),
  removeScope: (id: string) => send<void>("DELETE", `/scope/${id}`),
};
