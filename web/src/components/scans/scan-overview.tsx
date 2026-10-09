"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EventList } from "@/components/plugins/run-panel";
import { StatusText } from "@/components/scans/scan-status";
import { api, ApiError } from "@/lib/api/client";
import { scanLive, useMe, useRunEvents, useScan, useScanRuns, useScanTargets } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

export function ScanOverview({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: scan, error } = useScan(id);
  const live = scanLive(scan?.status);
  const { data: runs } = useScanRuns(id, live);
  const { data: targets } = useScanTargets(id, live);
  const { data: me } = useMe();
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!scan) return <p className="text-sm text-muted-foreground">Loading the scan…</p>;
  const canControl = live && (me?.role === "admin" || me?.role === "analyst");

  const act = async (fn: (id: string) => Promise<unknown>) => {
    setErr("");
    try { await fn(id); } catch (x) { setErr(x instanceof ApiError ? x.message : "Something went wrong."); }
    qc.invalidateQueries({ queryKey: ["scans", id] });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-center gap-4">
        <StatusText status={scan.status} />
        <span className="text-sm">{scan.root_target.value}</span>
        <span className="text-xs text-subtle">{scan.plugin_ids.join(", ")} · depth {scan.max_depth}</span>
        {scan.error && <span className="text-xs text-sev-critical">{scan.error}</span>}
        {canControl && (
          <span className="ml-auto flex gap-2">
            {scan.status === "PAUSED"
              ? <Button variant="outline" onClick={() => act(api.resumeScan)}>Resume</Button>
              : <Button variant="outline" onClick={() => act(api.pauseScan)}>Pause</Button>}
            <Button variant="outline" onClick={() => act(api.cancelScan)}>Cancel</Button>
          </span>
        )}
      </section>
      {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Targets followed", scan.targets_in_scope], ["Out of scope", scan.targets_out_of_scope],
          ["Runs", Object.values(scan.runs).reduce((a, b) => a + (b ?? 0), 0)], ["Events", scan.events]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border p-4">
            <p className="text-xs text-subtle">{k}</p>
            <p className="mt-1 font-mono text-lg">{v}</p>
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Runs</h2>
        <ul className="rounded-lg border border-border text-sm">
          {(runs ?? []).map((r) => (
            <li key={r.id} className="border-b border-border last:border-0">
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-1">
                <span className="font-medium">{r.plugin_id}</span>
                <StatusText status={r.status} />
                <span className="text-xs text-subtle">{r.targets.length === 1 ? r.targets[0].value : `${r.targets.length} targets`} · {r.event_count} events{r.attempt > 1 && ` · attempt ${r.attempt}`}</span>
                {r.error && <span className="text-xs text-sev-critical">{r.error.slice(0, 120)}</span>}
              </button>
              {open === r.id && <RunEvents id={r.id} polling={r.status === "PENDING" || r.status === "RUNNING"} />}
            </li>
          ))}
          {!runs?.length && <li className="px-4 py-2.5 text-xs text-subtle">No runs yet.</li>}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Targets</h2>
        <ul className="rounded-lg border border-border font-mono text-xs">
          {(targets ?? []).map((t) => (
            <li key={`${t.type}:${t.value}`} className={cn("flex gap-3 border-b border-border px-4 py-1.5 last:border-0", !t.in_scope && "text-subtle")}>
              <span className="w-14 shrink-0">{t.type}</span>
              <span className="break-all">{t.value}</span>
              <span className="ml-auto shrink-0">{t.in_scope ? `depth ${t.depth}` : t.refusal}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RunEvents({ id, polling }: { id: string; polling: boolean }) {
  const { data } = useRunEvents(id, polling);
  return <div className="px-4 pb-3"><EventList events={data ?? []} /></div>;
}
