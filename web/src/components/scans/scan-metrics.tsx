"use client";

import { useScan } from "@/lib/api/hooks";

export function ScanMetrics({ id }: { id: string }) {
  const { data: s } = useScan(id);
  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const runs = Object.values(s.runs).reduce((a, b) => a + (b ?? 0), 0);
  const rows: [string, string | number][] = [
    ["Plugin runs", runs],
    ...Object.entries(s.runs).map(([k, v]) => [`  ${k}`, v ?? 0] as [string, number]),
    ["Container seconds", s.container_seconds.toFixed(1)],
    ["Targets followed", s.targets_in_scope],
    ["Targets refused (out of scope)", s.targets_out_of_scope],
    ["Events", s.events],
  ];
  return (
    <table className="text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-border last:border-0">
            <td className="whitespace-pre py-2 pr-8 text-muted-foreground">{k}</td>
            <td className="py-2 font-mono">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
