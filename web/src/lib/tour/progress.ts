// Where a workspace is on the path (target -> scan -> review), from real data only.
// Alias-free on purpose: node --test imports it directly.

export type ScanStatus = "CREATED" | "RUNNING" | "PAUSED" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
export type Role = "admin" | "analyst" | "viewer";

/** scans: newest first. reviewedTotal: findings with a status other than open. */
export type Facts = {
  role: Role;
  scopeCount: number;
  scans: { id: string; status: ScanStatus; error: string | null }[];
  findingsTotal: number;
  reviewedTotal: number;
};

export type ItemId = "account" | "target" | "scan" | "review";

export const finished = (s: ScanStatus) => s === "COMPLETED" || s === "PARTIAL";

/** Nothing to review counts as reviewed once a scan has actually finished. */
export const reviewed = (f: Facts) => f.reviewedTotal > 0 || (f.findingsTotal === 0 && f.scans.some((s) => finished(s.status)));

export function progress(f: Facts) {
  const items: { id: ItemId; done: boolean }[] = [
    { id: "account", done: true },
    { id: "target", done: f.scopeCount > 0 },
    { id: "scan", done: f.scans.length > 0 },
    { id: "review", done: reviewed(f) },
  ];
  const current = items.find((i) => !i.done)?.id ?? null;
  return { items, current, allDone: current === null };
}

export type Action = "add-target" | "wait-admin" | "start-scan" | "watch-scan" | "run-again" | "open-findings";

/** What the checklist offers for its current item: only actions the role can take, and a way out of a failed scan. */
export function action(id: ItemId, f: Facts): Action {
  if (id === "target") return f.role === "admin" ? "add-target" : "wait-admin";
  if (id === "scan") return "start-scan";
  const newest = f.scans[0]?.status;
  if (newest && !finished(newest) && newest !== "FAILED" && newest !== "CANCELLED") return "watch-scan";
  if (!f.scans.some((s) => finished(s.status))) return "run-again";
  return "open-findings";
}
