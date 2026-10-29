// Home "command center": the words and numbers it shows, kept pure so they are tested without a browser.

import { ago } from "./format.ts";
import type { Dashboard, Severity } from "./types.ts";

export function headline(urgent: number): { lead: string; tail: string } {
  const tail = "Scan something new?";
  if (!urgent) return { lead: "All clear.", tail };
  return { lead: urgent === 1 ? "1 issue needs you." : `${urgent} issues need you.`, tail };
}

export type StatCell = { key: "urgent" | "open" | "assets" | "new"; value: number; label: string; href: string; delta?: number };

export function statCells(d: Dashboard): StatCell[] {
  const week = d.findings_per_day.slice(-7).reduce((n, p) => n + p.count, 0);
  return [
    { key: "urgent", value: d.open_by_severity.critical + d.open_by_severity.high, label: "Critical + high", href: "/app/findings?severity=critical,high" },
    { key: "open", value: d.open_total, label: "Open findings", href: "/app/findings" },
    { key: "assets", value: d.assets_total, label: "Assets", href: "/app/assets", ...(d.assets_new_7d ? { delta: d.assets_new_7d } : {}) },
    // First seen this week, any status: "new", not "open".
    { key: "new", value: week, label: "New findings this week", href: "/app/findings" },
  ];
}

export type Bar = { date: string; segments: { severity: Severity | "unknown"; value: number }[] };
const STACK: Severity[] = ["info", "low", "medium", "high", "critical"]; // bottom to top

export function barSeries(days: Dashboard["findings_per_day"]): { bars: Bar[]; max: number } {
  const bars = days.map(({ date, count, by_severity }) => ({
    date,
    segments: by_severity
      ? STACK.filter((s) => by_severity[s]).map((s) => ({ severity: s, value: by_severity[s] }))
      : count ? [{ severity: "unknown" as const, value: count }] : [],
  }));
  return { bars, max: Math.max(1, ...days.map((d) => d.count)) };
}

export function ring(open: Record<Severity, number>): { severity: Severity; value: number; share: number }[] {
  const total = Object.values(open).reduce((a, n) => a + n, 0);
  if (!total) return [];
  return (["critical", "high", "medium", "low", "info"] as const).filter((s) => open[s]).map((s) => ({ severity: s, value: open[s], share: open[s] / total }));
}

export function metaLine(scopeCount: number, lastScanIso: string | null, now = new Date()): string {
  const targets = scopeCount === 0 ? "no targets yet" : scopeCount === 1 ? "1 target" : `${scopeCount} targets`;
  return ["Workspace", targets, ...(lastScanIso ? [`last scan ${ago(lastScanIso, now)}`] : [])].join(" · ");
}
