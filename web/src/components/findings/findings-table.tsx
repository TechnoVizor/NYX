"use client";

import { Time } from "@/components/shared/time";
import { Choice } from "@/components/shared/choice";
import { useDeferredValue, useEffect, useState } from "react";
import { SearchX, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FindingStatusText, statusLabel } from "@/components/findings/finding-status";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { PluginTile } from "@/components/shared/plugin-tile";
import { useFindings, usePlugins } from "@/lib/api/hooks";
import { findingStatuses, severities, type FindingStatus, type Severity } from "@/lib/types";
import { cn, param, syncQuery, type SearchParams } from "@/lib/utils";


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
  const onePlugin = new Set(rows.map((r) => r.plugin_id)).size <= 1; // a column with one value says nothing
  const toggle = (s: Severity) => setSev(sev.includes(s) ? sev.filter((x) => x !== s) : [...sev, s]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {severities.map((s) => (
          <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={sev.includes(s)}
            className={cn("rounded-lg border px-2 py-1 text-xs capitalize", sev.includes(s) ? "border-brand bg-brand-soft text-foreground" : "border-input text-muted-foreground")}>
            {s}
          </button>
        ))}
        <Choice value={status} onChange={setStatus} label="Status" options={[{ value: "active", label: "Open and confirmed" }, { value: "all", label: "Every status" }, ...findingStatuses.map((s) => ({ value: s, label: statusLabel[s] }))]} />
        <Choice value={plugin} onChange={setPlugin} label="Plugin" options={[{ value: "", label: "Every plugin" }, ...(plugins ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, template, URL" aria-label="Search" className="max-w-xs" />
        {data && <span className="ml-auto text-xs text-subtle">{data.pages[0].total} findings</span>}
      </div>
      {error && <p role="alert" className="text-sm text-sev-critical">{error.message}</p>}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading findings…</p> : !rows.length ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong p-5 text-sm text-muted-foreground">
          {filtered ? <SearchX className="size-5 shrink-0" aria-hidden /> : <ShieldCheck className="size-5 shrink-0 text-sev-low" aria-hidden />}
          {filtered ? (
            <span>No findings match these filters. <button type="button" onClick={clear} className="text-foreground underline">Clear filters</button></span>
          ) : (
            <span>{scanId ? "No open findings from this scan." : "No open findings."}</span>
          )}
        </div>
      ) : (
        <>
        {/* Phones: one card per finding; the table needs more width than a phone has. */}
        <ul className="flex flex-col gap-2 md:hidden">
          {rows.map((f, i) => (
            <li key={f.id} data-tour={i === 0 ? "finding-row" : undefined}>
              <Link href={`/app/findings/${f.id}`} className="flex flex-col gap-1.5 rounded-lg border border-border p-3 hover:bg-surface-1">
                <span className="flex items-center gap-2"><SeverityBadge severity={f.severity} /><FindingStatusText status={f.status} /></span>
                <span className="font-medium">{f.title}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{f.matched_at}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-subtle">
              <tr>{["Severity", "Finding", "Where", ...(onePlugin ? [] : ["Plugin"]), "Status", "Last seen"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((f, i) => (
                <tr key={f.id} data-tour={i === 0 ? "finding-row" : undefined} className="border-b border-border last:border-0 hover:bg-surface-1">
                  <td className="px-4 py-3"><SeverityBadge severity={f.severity} /></td>
                  <td className="px-4 py-3">
                    <Link href={`/app/findings/${f.id}`} className="font-medium hover:underline">{f.title}</Link>
                  </td>
                  <td className="max-w-80 truncate px-4 py-3 font-mono text-xs" title={f.matched_at}>{f.matched_at}</td>
                  {!onePlugin && <td className="px-4 py-3"><PluginTile id={f.plugin_id} withName /></td>}
                  <td className="px-4 py-3"><FindingStatusText status={f.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground"><Time iso={f.last_seen} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <LoadMore more={!!hasNextPage} busy={isFetchingNextPage} onMore={() => fetchNextPage()} />
    </div>
  );
}
