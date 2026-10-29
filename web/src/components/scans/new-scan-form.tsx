"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { api, ApiError } from "@/lib/api/client";
import { usePlugins, useProfiles, useScope } from "@/lib/api/hooks";
import type { TargetType } from "@/lib/types";

const select = "h-8 max-w-xs rounded-lg border border-input bg-transparent px-2 text-sm";

export function DepthSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-semibold">Depth</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={select}>
        <option value={1}>1 · only the target</option>
        <option value={2}>2 · the target and what it reveals</option>
        <option value={3}>3 · one more hop</option>
      </select>
    </label>
  );
}

export function NewScanForm({ initialProfile }: { initialProfile?: string }) {
  const router = useRouter();
  const { data: plugins } = usePlugins();
  const { data: scope } = useScope();
  const { data: profiles } = useProfiles();
  const runnable = useMemo(() => (plugins ?? []).filter((p) => p.enabled && p.digest && p.risk_level !== "intrusive"), [plugins]);
  const usable = (profiles ?? []).filter((p) => p.available);
  const [type, setType] = useState<TargetType>("domain");
  const [value, setValue] = useState("");
  // null = untouched: the profile (Balanced by default) decides plugins and depth until the user edits them.
  const [profileId, setProfileId] = useState<string | null>(initialProfile ?? null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [depth, setDepth] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = profileId ?? usable.find((p) => p.name === "Balanced")?.id ?? "";
  const profile = usable.find((p) => p.id === chosen);
  const selected = picked ?? profile?.plugin_ids.filter((id) => runnable.some((p) => p.id === id)) ?? runnable.map((p) => p.id);
  const maxDepth = depth ?? profile?.max_depth ?? 2;
  const suggestions = (scope ?? []).filter((s) => s.kind === "domain").map((s) => s.value);

  const toggle = (id: string) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      // The API keeps the profile's settings for the plugins still selected.
      const scan = await api.startScan({
        target: { type, value: value.trim() }, plugin_ids: selected, max_depth: maxDepth, profile_id: profile?.id,
      });
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
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Profile</span>
        <select value={chosen} onChange={(e) => { setProfileId(e.target.value); setPicked(null); setDepth(null); }} className={select}>
          {usable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">Choose plugins by hand</option>
        </select>
        {profile?.description && <span className="text-xs text-muted-foreground">{profile.description}</span>}
      </label>
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
      <DepthSelect value={maxDepth} onChange={setDepth} />
      {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
      <div><Button type="submit" disabled={busy || !value.trim() || !selected.length}>{busy ? "Starting…" : "Start scan"}</Button></div>
    </form>
  );
}
