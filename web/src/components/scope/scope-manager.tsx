"use client";

import { Crosshair, Eye, Globe, Network, Zap } from "lucide-react";
import { Choice } from "@/components/shared/choice";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useMe, useScope } from "@/lib/api/hooks";
import type { ScopeInput } from "@/lib/types";

const empty: ScopeInput = { kind: "domain", value: "", active_allowed: false, authorization: "" };

export function ScopeManager() {
  const { data: scope, isLoading } = useScope();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState<ScopeInput>(empty);
  const [err, setErr] = useState("");
  const admin = me?.role === "admin";
  const refresh = () => qc.invalidateQueries({ queryKey: ["scope"] });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api.addScope(f);
      setF(empty);
      refresh();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
    }
  };
  const remove = async (id: string) => {
    await api.removeScope(id).catch((x) => setErr(x instanceof ApiError ? x.message : "Could not remove it."));
    refresh();
  };

  return (
    <div className="max-w-3xl space-y-8">
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !scope?.length ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong p-5 text-sm text-muted-foreground">
          <Crosshair className="size-5 shrink-0 text-brand" aria-hidden />
          No targets yet. Until there is one, I refuse every scan.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {scope.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <div>
                <p className="flex flex-wrap items-center gap-2">
                  {s.kind === "domain" ? <Globe className="size-4 text-muted-foreground" aria-label="Domain" /> : <Network className="size-4 text-muted-foreground" aria-label="IP range" />}
                  <span className="font-mono">{s.value}</span>
                  <span className={s.active_allowed ? "flex items-center gap-1 rounded border border-sev-medium/40 px-1.5 text-xs text-sev-medium" : "flex items-center gap-1 rounded border border-border-strong px-1.5 text-xs text-muted-foreground"}>
                    {s.active_allowed ? <Zap className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
                    {s.active_allowed ? "Active" : "Passive"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{s.authorization}</p>
              </div>
              {admin && <Button variant="ghost" size="sm" onClick={() => remove(s.id)} aria-label={`Remove ${s.value}`}>Remove</Button>}
            </li>
          ))}
        </ul>
      )}
      {admin && (
        <form onSubmit={add} data-tour="target-form" className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold">Add a target</h2>
          <div className="flex flex-wrap gap-2">
            <Choice value={f.kind} onChange={(v) => setF({ ...f, kind: v as ScopeInput["kind"] })} label="Kind" options={[{ value: "domain", label: "Domain" }, { value: "cidr", label: "IP or range" }]} />
            <Input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={f.kind === "domain" ? "example.com" : "203.0.113.0/24"} className="max-w-xs" aria-label="Value" />
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            Who allowed it
            <Input value={f.authorization} onChange={(e) => setF({ ...f, authorization: e.target.value })} placeholder="e.g. My own domain" />
          </label>
          <label className="flex items-center gap-2 text-sm" title="Lets plugins send traffic to the target, not only read public sources">
            <input type="checkbox" checked={f.active_allowed} onChange={(e) => setF({ ...f, active_allowed: e.target.checked })} />
            <Zap className="size-4 text-sev-medium" aria-hidden /> Active scanning
            <span className="text-muted-foreground">· sends traffic</span>
          </label>
          {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
          <Button type="submit" disabled={!f.value.trim() || !f.authorization.trim()}>Add to scope</Button>
        </form>
      )}
    </div>
  );
}
