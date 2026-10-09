"use client";

import Link from "next/link";
import { StatusText } from "@/components/scans/scan-status";
import { useScans } from "@/lib/api/hooks";

const duration = (a: string | null, b: string | null) => (a ? `${Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000)}s` : "—");

export function ScansTable() {
  const { data, isLoading, error } = useScans();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading scans…</p>;
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No scans yet. <Link href="/app/scans/new" className="underline">Start one.</Link></p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-subtle">
          <tr>{["Target", "Status", "Plugins", "Depth", "Started", "Duration"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-1">
              <td className="px-4 py-3"><Link href={`/app/scans/${s.id}`} className="font-medium hover:underline">{s.root_target.value}</Link></td>
              <td className="px-4 py-3"><StatusText status={s.status} /></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{s.plugin_ids.join(", ")}</td>
              <td className="px-4 py-3 font-mono text-xs">{s.max_depth}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{s.started_at ? new Date(s.started_at).toLocaleString() : "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">{duration(s.started_at, s.finished_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
