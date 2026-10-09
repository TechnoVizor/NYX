"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { api, ApiError } from "@/lib/api/client";
import { usePlugins, useScope } from "@/lib/api/hooks";
import type { TargetType } from "@/lib/types";

export function NewScanForm() {
  const router = useRouter();
  const { data: plugins } = usePlugins();
  const { data: scope } = useScope();
  const runnable = useMemo(() => (plugins ?? []).filter((p) => p.enabled && p.digest && p.risk_level !== "intrusive"), [plugins]);
  const [type, setType] = useState<TargetType>("domain");
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [depth, setDepth] = useState(2);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Until the user touches a checkbox, every runnable plugin is selected (the API's default set).
  const selected = picked ?? runnable.map((p) => p.id);
  const suggestions = (scope ?? []).filter((s) => s.kind === "domain").map((s) => s.value);

  const toggle = (id: string) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const scan = await api.startScan({ target: { type, value: value.trim() }, plugin_ids: selected, max_depth: depth });
      router.push(`/app/scans/${scan.id}`);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Target</legend>
        <div className="flex flex-wrap gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as TargetType)} aria-label="Target type" className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
            {(["domain", "ip", "url"] as const).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Input list="scan-scope" value={value} onChange={(e) => setValue(e.target.value)} placeholder={suggestions[0] ?? "example.com"} className="max-w-xs" aria-label="Target" />
          <datalist id="scan-scope">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <p className="text-xs text-muted-foreground">Only targets in scope. Everything I find is checked against scope again before I touch it.</p>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Plugins</legend>
        {!runnable.length && <p className="text-sm text-muted-foreground">No runnable plugins. Build the images and enable at least one.</p>}
        <ul className="flex flex-col gap-1.5">
          {runnable.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="font-medium">{p.name}</span>
                <RiskBadge risk={p.risk_level} />
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Depth</span>
        <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="h-8 max-w-xs rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value={1}>1 · only the target</option>
          <option value={2}>2 · the target and what it reveals</option>
          <option value={3}>3 · one more hop</option>
        </select>
      </label>
      {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
      <div><Button type="submit" disabled={busy || !value.trim() || !selected.length}>{busy ? "Starting…" : "Start scan"}</Button></div>
    </form>
  );
}
