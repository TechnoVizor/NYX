"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useRun, useRunEvents, useScope } from "@/lib/api/hooks";
import type { PluginDetail, PluginEvent, TargetType } from "@/lib/types";
import { cn } from "@/lib/utils";

const live = (s?: string) => s === "PENDING" || s === "RUNNING";

export function RunPanel({ plugin }: { plugin: PluginDetail }) {
  const { data: scope } = useScope();
  const qc = useQueryClient();
  const accepts = plugin.manifest.io.accepts;
  const [type, setType] = useState<TargetType>(accepts[0]);
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const { data: run } = useRun(runId);
  const { data: events } = useRunEvents(runId, live(run?.status) || !run);
  const finished = !!run && !live(run.status);

  // Refresh the plugin's "Recent runs" once this run settles, so it does not keep saying RUNNING.
  useEffect(() => {
    if (finished) qc.invalidateQueries({ queryKey: ["plugins", plugin.id] });
  }, [finished, qc, plugin.id]);

  const suggestions = useMemo(() => (scope ?? []).filter((s) => s.kind === "domain").map((s) => s.value), [scope]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api.startRun(plugin.id, { type, value: value.trim() });
      setRunId(r.id);
      qc.invalidateQueries({ queryKey: ["plugins", plugin.id] });
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-sm font-semibold">Run against one target</h2>
      <p className="mt-1 text-xs text-muted-foreground">Only targets in scope. {plugin.risk_level !== "passive" && "This plugin touches the target, so its scope entry must allow active scanning."}</p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as TargetType)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
          {accepts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <Input list="scope-domains" value={value} onChange={(e) => setValue(e.target.value)} placeholder={suggestions[0] ?? "example.com"} className="max-w-xs" aria-label="Target" />
        <datalist id="scope-domains">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <Button type="submit" disabled={busy || !value.trim()}>{busy ? "Starting…" : "Run"}</Button>
      </form>
      {err && <p role="alert" className="mt-2 text-sm text-sev-critical">{err}</p>}
      {run && (
        <div className="mt-5">
          <p className="text-xs text-subtle">
            <span className={cn("font-mono", run.status === "SUCCEEDED" ? "text-sev-low" : live(run.status) ? "text-sev-medium" : "text-sev-critical")}>{run.status}</span>
            {" · "}{run.target.value}{" · "}{run.event_count} events{run.error && <> · <span className="text-sev-critical">{run.error}</span></>}
          </p>
          <EventList events={events ?? []} />
        </div>
      )}
    </section>
  );
}

function EventList({ events }: { events: PluginEvent[] }) {
  if (!events.length) return null;
  return (
    <ol className="mt-3 max-h-96 overflow-y-auto rounded-md border border-border font-mono text-xs">
      {events.map((e) => {
        const d = e.payload.data ?? {};
        const text = e.type === "asset" ? `${d.kind} ${d.value}` : e.type === "relation" ? `${d.from} → ${d.kind} → ${d.to}` : e.type === "log" ? String(d.message) : e.type === "progress" ? `${d.percent}%` : JSON.stringify(d).slice(0, 160);
        return (
          <li key={e.seq} className={cn("flex gap-3 border-b border-border px-3 py-1.5 last:border-0", !e.valid && "bg-sev-critical/10", (e.type === "log" || e.type === "progress") && "text-subtle")}>
            <span className="w-16 shrink-0 text-subtle">{e.valid ? e.type : "invalid"}</span>
            <span className="break-all">{e.valid ? text : (e.payload.raw ?? JSON.stringify(e.payload)).slice(0, 200)}</span>
          </li>
        );
      })}
    </ol>
  );
}
