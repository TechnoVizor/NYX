"use client";

import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { Activity } from "lucide-react";
import { StatusText } from "@/components/scans/scan-status";
import { Time } from "@/components/shared/time";
import { PluginTiles } from "@/components/shared/plugin-tile";
import { useScans } from "@/lib/api/hooks";
import { duration } from "@/lib/format";
import type { Scan } from "@/lib/types";

const took = (s: Scan) => (s.started_at ? duration(((s.finished_at ? Date.parse(s.finished_at) : Date.now()) - Date.parse(s.started_at)) / 1000) : "—");

const Tools = ({ ids }: { ids: string[] }) => <PluginTiles ids={ids} />;

export function ScansTable() {
  const { data, isLoading, error } = useScans();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading scans…</p>;
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!data?.length)
    return (
      <EmptyState icon={Activity}>
        No scans yet. <Link href="/app/scans/new" className="text-foreground underline">Start one</Link>
      </EmptyState>
    );
  return (
    <>
      {/* Phones: one card per scan. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {data.map((s) => (
          <li key={s.id}>
            <Link href={`/app/scans/${s.id}`} className="flex flex-col gap-1.5 rounded-lg border border-border p-3 hover:bg-surface-3">
              <span className="font-medium break-all">{s.root_target.value}</span>
              <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <StatusText status={s.status} />
                {s.started_at && <Time iso={s.started_at} />}
                <span>{took(s)}</span>
                <Tools ids={s.plugin_ids} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs text-muted-foreground">
            <tr>{["Target", "Status", "Tools", "Started", "Took"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-3">
                <td className="px-4 py-3"><Link href={`/app/scans/${s.id}`} className="font-medium hover:underline">{s.root_target.value}</Link></td>
                <td className="px-4 py-3"><StatusText status={s.status} /></td>
                <td className="px-4 py-3"><Tools ids={s.plugin_ids} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{s.started_at ? <Time iso={s.started_at} /> : "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{took(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
