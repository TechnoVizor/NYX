import { findings, plugins, scans } from "@/lib/mocks/data";
import type { Credentials, Finding, Plugin, Scan, User } from "@/lib/types";

// The only module that knows where data comes from. Auth talks to the real API through the /api rewrite;
// scans, findings and plugins are still mocks until the scan engine lands.
const delay = <T,>(value: T, ms = 120) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

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

const post = <T,>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  me: () => call<User>("/me"),
  login: (body: Credentials) => post<User>("/auth/login", body),
  signup: (body: Credentials) => post<User>("/auth/signup", body),
  logout: () => post<void>("/auth/logout"),
  listScans: (): Promise<Scan[]> => delay(scans),
  getScan: (id: string): Promise<Scan | undefined> => delay(scans.find((s) => s.id === id)),
  listFindings: (): Promise<Finding[]> => delay(findings),
  getFinding: (id: string): Promise<Finding | undefined> => delay(findings.find((f) => f.id === id)),
  listPlugins: (): Promise<Plugin[]> => delay(plugins),
};
