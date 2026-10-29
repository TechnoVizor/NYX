"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Choice } from "@/components/shared/choice";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { api, ApiError } from "@/lib/api/client";
import { usePlugins, useProfiles, useScope } from "@/lib/api/hooks";
import { targetTypeName, type TargetType } from "@/lib/types";


export function DepthSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-semibold">Depth</span>
      <Choice value={String(value)} onChange={(v) => onChange(Number(v))} label="Depth" className="max-w-xs" options={[{ value: "1", label: "1 · only the target" }, { value: "2", label: "2 · the target and what it reveals" }, { value: "3", label: "3 · one more hop" }]} />
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
          <Choice value={type} onChange={(v) => setType(v as TargetType)} label="Target type" options={(["domain", "ip", "url"] as const).map((t) => ({ value: t, label: targetTypeName[t] }))} />
          <Input list="scan-scope" value={value} onChange={(e) => setValue(e.target.value)} placeholder={suggestions[0] ?? "example.com"} className="max-w-xs" aria-label="Target" />
          <datalist id="scan-scope">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </div>

      </fieldset>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Profile</span>
        <Choice value={chosen} onChange={(v) => { setProfileId(v); setPicked(null); setDepth(null); }} label="Profile" className="max-w-xs" options={[...usable.map((p) => ({ value: p.id, label: p.name })), { value: "", label: "Choose plugins by hand" }]} />

      </label>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Plugins</legend>
        {!runnable.length && <p className="text-sm text-muted-foreground">No runnable plugins. Build the images and enable at least one.</p>}
        <ul className="flex flex-col gap-1.5">
          {runnable.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-3 text-sm">
                <Checkbox checked={selected.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
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
