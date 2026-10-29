// What the status bar says: the newest running scan, else an unseen failure of the newest scan, else idle.

import { scanFinal, type Scan } from "./types.ts";

export type BarState = { kind: "running"; scan: Scan; more: number } | { kind: "failed"; scan: Scan } | { kind: "idle" };

export function barState(scans: Scan[], seenFailed: string | null): BarState {
  const byNewest = [...scans].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const running = byNewest.filter((s) => !scanFinal.includes(s.status));
  if (running.length) return { kind: "running", scan: running[0], more: running.length - 1 };
  const newest = byNewest[0];
  if (newest?.status === "FAILED" && newest.id !== seenFailed) return { kind: "failed", scan: newest };
  return { kind: "idle" };
}

const SEEN_KEY = "nyx-seen-failed";

export function loadSeenFailed(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function saveSeenFailed(id: string): void {
  try {
    localStorage.setItem(SEEN_KEY, id);
  } catch {
    // the alert then stays until storage works again
  }
}
