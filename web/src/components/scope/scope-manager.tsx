"use client";

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
      <p className="text-sm text-muted-foreground">I only touch what is listed here. A domain covers itself and its subdomains. Active plugins need active scanning allowed on the entry.</p>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !scope?.length ? (
        <p className="text-sm text-muted-foreground">Nothing in scope yet, so I will refuse every run.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {scope.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <div>
                <p className="font-mono">{s.value} <span className="text-xs text-subtle">{s.kind}{s.active_allowed ? " · active allowed" : " · passive only"}</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.authorization}</p>
              </div>
              {admin && <Button variant="ghost" size="sm" onClick={() => remove(s.id)} aria-label={`Remove ${s.value}`}>Remove</Button>}
            </li>
          ))}
        </ul>
      )}
      {admin && (
        <form onSubmit={add} className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold">Add a target</h2>
          <div className="flex flex-wrap gap-2">
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ScopeInput["kind"] })} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" aria-label="Kind">
              <option value="domain">domain</option>
              <option value="cidr">IP / CIDR</option>
            </select>
            <Input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={f.kind === "domain" ? "example.com" : "203.0.113.0/24"} className="max-w-xs" aria-label="Value" />
          </div>
          <Input value={f.authorization} onChange={(e) => setF({ ...f, authorization: e.target.value })} placeholder="Who allowed this, and on what basis (e.g. 'My own domain')" aria-label="Authorization" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active_allowed} onChange={(e) => setF({ ...f, active_allowed: e.target.checked })} />
            Allow active scanning (plugins that send traffic to the target)
          </label>
          {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
          <Button type="submit" disabled={!f.value.trim() || !f.authorization.trim()}>Add to scope</Button>
        </form>
      )}
    </div>
  );
}
