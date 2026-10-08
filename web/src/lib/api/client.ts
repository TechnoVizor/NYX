import { findings, plugins, scans } from "@/lib/mocks/data";
import type { Finding, Plugin, Scan } from "@/lib/types";

// The only module that knows where data comes from. Swap the mock bodies for
// fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/...`) when the backend lands.
const delay = <T,>(value: T, ms = 120) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const api = {
  listScans: (): Promise<Scan[]> => delay(scans),
  getScan: (id: string): Promise<Scan | undefined> => delay(scans.find((s) => s.id === id)),
  listFindings: (): Promise<Finding[]> => delay(findings),
  getFinding: (id: string): Promise<Finding | undefined> => delay(findings.find((f) => f.id === id)),
  listPlugins: (): Promise<Plugin[]> => delay(plugins),
};
