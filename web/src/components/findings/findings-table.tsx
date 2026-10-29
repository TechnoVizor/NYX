"use client";

import { useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FindingStatusText, statusLabel } from "@/components/findings/finding-status";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { useFindings, usePlugins } from "@/lib/api/hooks";
import { findingStatuses, severities, type FindingStatus, type Severity } from "@/lib/types";
import { cn, param, syncQuery, type SearchParams } from "@/lib/utils";

export const when = (iso: string) => new Date(iso).toLocaleString();
export const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

export function LoadMore({ more, busy, onMore }: { more: boolean; busy: boolean; onMore: () => void }) {
  if (!more) return null;
  return <div><Button variant="outline" onClick={onMore} disabled={busy}>{busy ? "Loading…" : "Load more"}</Button></div>;
}

const statusChoices = ["active", "all", ...findingStatuses];

export function FindingsTable({ scanId, searchParams }: { scanId?: string; searchParams?: SearchParams }) {
  const [sev, setSev] = useState<Severity[]>(() =>
    severities.filter((s) => param(searchParams, "severity").split(",").includes(s)));
  const [status, setStatus] = useState(() =>
    statusChoices.includes(param(searchParams, "status")) ? param(searchParams, "status") : "active");
  const [plugin, setPlugin] = useState(() => param(searchParams, "plugin"));
  const [q, setQ] = useState(() => param(searchParams, "q"));
  const query = useDeferredValue(q.trim());
  const filtered = sev.length > 0 || status !== "active" || !!plugin || !!query;
  useEffect(() => {
    syncQuery({ severity: sev.join(","), status: status === "active" ? "" : status, plugin, q: query });
  }, [sev, status, plugin, query]);
  const clear = () => { setSev([]); setStatus("active"); setPlugin(""); setQ(""); };
  const { data: plugins } = usePlugins();
  const statuses: FindingStatus[] = status === "active" ? ["open", "confirmed"] : status === "all" ? [] : [status as FindingStatus];
  const { data, error, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useFindings({
    severity: sev, status: statuses, plugin_id: plugin || undefined, scan_id: scanId, q: query || undefined,
  });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];
  const toggle = (s: Severity) => setSev(sev.includes(s) ? sev.filter((x) => x !== s) : [...sev, s]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {severities.map((s) => (
          <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={sev.includes(s)}
            className={cn("rounded-lg border px-2 py-1 text-xs capitalize", sev.includes(s) ? "border-border-strong bg-surface-2" : "border-border text-muted-foreground")}>
            {s}
          </button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={selectClass}>
          <option value="active">Open and confirmed</option>
          <option value="all">Every status</option>
          {findingStatuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
        </select>
        <select value={plugin} onChange={(e) => setPlugin(e.target.value)} aria-label="Plugin" className={selectClass}>
          <option value="">Every plugin</option>
          {(plugins ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, template, URL" aria-label="Search" className="max-w-xs" />
        {data && <span className="ml-auto text-xs text-subtle">{data.pages[0].total} findings</span>}
      </div>
      {error && <p role="alert" className="text-sm text-sev-critical">{error.message}</p>}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading findings…</p> : !rows.length ? (
        filtered ? (
          <p className="text-sm text-muted-foreground">
            No findings match these filters. <button type="button" onClick={clear} className="underline">Clear filters</button>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {scanId ? "No open findings from this scan." : "No open findings. Scan a live web service with Nuclei and they show up here."}
          </p>
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-subtle">
              <tr>{["Severity", "Finding", "Where", "Plugin", "Status", "Last seen"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0 hover:bg-surface-1">
                  <td className="px-4 py-3"><SeverityBadge severity={f.severity} /></td>
                  <td className="px-4 py-3">
                    <Link href={`/app/findings/${f.id}`} className="font-medium hover:underline">{f.title}</Link>
                    <p className="font-mono text-[11px] text-subtle">{f.template_id}</p>
                  </td>
                  <td className="max-w-80 truncate px-4 py-3 font-mono text-xs" title={f.matched_at}>{f.matched_at}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{f.plugin_id}</td>
                  <td className="px-4 py-3"><FindingStatusText status={f.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{when(f.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore more={!!hasNextPage} busy={isFetchingNextPage} onMore={() => fetchNextPage()} />
    </div>
  );
}
