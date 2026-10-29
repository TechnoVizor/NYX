"use client";

import { useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FindingStatusText } from "@/components/findings/finding-status";
import { LoadMore, selectClass, when } from "@/components/findings/findings-table";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { StatusText } from "@/components/scans/scan-status";
import { useAsset, useAssets } from "@/lib/api/hooks";
import type { Asset } from "@/lib/types";
import { param, syncQuery, type SearchParams } from "@/lib/utils";

const kindName: Record<string, string> = { http_service: "Web service", subdomain: "Subdomain", domain: "Domain", ip: "IP address" };
const kindLabel = (k: string) => kindName[k] ?? k;
const list = "rounded-lg border border-border text-sm";
const item = "flex items-center gap-3 border-b border-border px-3 py-2 last:border-0";

/** The attributes worth a glance in the table; the panel shows everything. */
function summary({ data: d }: Asset) {
  const tech = Array.isArray(d.tech) ? d.tech.slice(0, 3).join(", ") : "";
  return [d.status_code, d.title, tech, d.ip].filter((v) => v != null && v !== "").map(String).join(" · ");
}

export function AssetsView({ searchParams }: { searchParams?: SearchParams }) {
  const [kind, setKind] = useState(() => (Object.hasOwn(kindName, param(searchParams, "kind")) ? param(searchParams, "kind") : ""));
  const [q, setQ] = useState(() => param(searchParams, "q"));
  const [open, setOpen] = useState<string | null>(null);
  const query = useDeferredValue(q.trim());
  useEffect(() => syncQuery({ kind, q: query }), [kind, query]);
  const { data, error, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useAssets({ kind: kind || undefined, q: query || undefined });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind" className={selectClass}>
          <option value="">Every kind</option>
          {Object.entries(kindName).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search assets" className="max-w-xs" />
        {data && <span className="ml-auto text-xs text-subtle">{data.pages[0].total} assets</span>}
      </div>
      {error && <p role="alert" className="text-sm text-sev-critical">{error.message}</p>}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading assets…</p> : !rows.length ? (
        kind || query ? (
          <p className="text-sm text-muted-foreground">
            No assets match these filters.{" "}
            <button type="button" onClick={() => { setKind(""); setQ(""); }} className="underline">Clear filters</button>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No assets yet. Every host and service a scan finds lands here.</p>
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-subtle">
              <tr>{["Asset", "Kind", "Details", "Open findings", "First seen", "Last seen"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-1">
                  <td className="max-w-80 truncate px-4 py-3">
                    <button type="button" onClick={() => setOpen(a.id)} className="font-mono text-xs hover:underline" title={a.value}>{a.value}</button>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{kindLabel(a.kind)}</td>
                  <td className="max-w-72 truncate px-4 py-3 text-xs text-muted-foreground">{summary(a)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.open_findings || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{when(a.first_seen)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{when(a.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore more={!!hasNextPage} busy={isFetchingNextPage} onMore={() => fetchNextPage()} />
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">{open && <AssetPanel id={open} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function AssetPanel({ id }: { id: string }) {
  const { data: a, error } = useAsset(id);
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!a) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader><DialogTitle className="break-all font-mono text-sm">{a.value}</DialogTitle></DialogHeader>
      <p className="text-xs text-subtle">{kindLabel(a.kind)} · first seen {when(a.first_seen)} · last seen {when(a.last_seen)}</p>
      <pre className="overflow-x-auto rounded-lg border border-border p-3 font-mono text-xs">{JSON.stringify(a.data, null, 2)}</pre>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Findings</h3>
        <ul className={list}>
          {a.findings.map((f) => (
            <li key={f.id} className={item}>
              <SeverityBadge severity={f.severity} />
              <Link href={`/app/findings/${f.id}`} className="hover:underline">{f.title}</Link>
              <span className="ml-auto"><FindingStatusText status={f.status} /></span>
            </li>
          ))}
          {!a.findings.length && <li className={`${item} text-xs text-muted-foreground`}>None.</li>}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Scans</h3>
        <ul className={`${list} text-xs`}>
          {a.scans.map((s) => (
            <li key={s.id} className={item}>
              <Link href={`/app/scans/${s.id}`} className="underline">{s.root_target.value}</Link>
              <StatusText status={s.status} />
              <span className="ml-auto text-subtle">{when(s.created_at)}</span>
            </li>
          ))}
          {!a.scans.length && <li className={`${item} text-muted-foreground`}>No scans recorded.</li>}
        </ul>
      </section>
    </div>
  );
}
