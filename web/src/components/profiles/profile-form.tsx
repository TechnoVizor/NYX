"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { ConfigFields } from "@/components/profiles/config-fields";
import { DepthSelect } from "@/components/scans/new-scan-form";
import { api, ApiError } from "@/lib/api/client";
import { usePlugins } from "@/lib/api/hooks";
import type { Profile, ProfileInput } from "@/lib/types";

const without = <T,>(o: Record<string, T>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

export function ProfileForm({ initial, mode, onDone }: { initial?: Profile; mode: "create" | "edit" | "duplicate"; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: plugins } = usePlugins();
  const [form, setForm] = useState<ProfileInput>({
    name: mode === "duplicate" && initial ? `${initial.name} copy` : initial?.name ?? "",
    description: initial?.description ?? "",
    plugin_ids: initial?.plugin_ids ?? [],
    plugin_config: initial?.plugin_config ?? {},
    max_depth: initial?.max_depth ?? 3,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<ProfileInput>) => setForm({ ...form, ...p });

  const toggle = (id: string) => {
    const on = form.plugin_ids.includes(id);
    patch({ plugin_ids: on ? form.plugin_ids.filter((x) => x !== id) : [...form.plugin_ids, id], plugin_config: on ? without(form.plugin_config, id) : form.plugin_config });
  };
  const setConfig = (id: string, v: Record<string, unknown>) => {
    const rest = without(form.plugin_config, id);
    patch({ plugin_config: Object.keys(v).length ? { ...rest, [id]: v } : rest });
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await (mode === "edit" && initial ? api.updateProfile(initial.id, form) : api.createProfile(form));
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      onDone();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm"><span className="font-semibold">Name</span>
        <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} maxLength={80} required /></label>
      <label className="flex flex-col gap-1.5 text-sm"><span className="font-semibold">Description</span>
        <Textarea value={form.description} onChange={(e) => patch({ description: e.target.value })} maxLength={2000} /></label>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Plugins</legend>
        <ul className="flex flex-col gap-1.5">
          {(plugins ?? []).filter((p) => p.risk_level !== "intrusive").map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-3 text-sm">
                <Checkbox checked={form.plugin_ids.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                <span className="font-medium">{p.name}</span><RiskBadge risk={p.risk_level} />
                {(!p.enabled || !p.digest) && <span className="text-xs text-subtle">not runnable now</span>}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {form.plugin_ids.map((id) => <ConfigFields key={id} pluginId={id} value={form.plugin_config[id] ?? {}} onChange={(v) => setConfig(id, v)} />)}
      <DepthSelect value={form.max_depth} onChange={(max_depth) => patch({ max_depth })} />
      {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !form.name.trim() || !form.plugin_ids.length}>{busy ? "Saving…" : "Save profile"}</Button>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
