"use client";

import { Switch } from "@/components/ui/switch";
import Link from "next/link";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { api } from "@/lib/api/client";
import { useMe, usePlugins } from "@/lib/api/hooks";

export function PluginsTable() {
  const { data, isLoading, error } = usePlugins();
  const { data: me } = useMe();
  const qc = useQueryClient();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the registry…</p>;
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No plugins registered. Check the API logs for skipped manifests.</p>;

  const toggle = async (id: string, enabled: boolean) => {
    await api.setPluginEnabled(id, enabled);
    qc.invalidateQueries({ queryKey: ["plugins"] });
  };

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {data.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-48 flex-1 flex-col">
            <span className="flex items-center gap-1.5">
              <Link href={`/app/plugins/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
              {p.trust_level === "verified" && <ShieldCheck className="size-4 text-sev-low" aria-label="Verified" />}
              <span className="text-xs text-muted-foreground">{p.version}</span>
            </span>
            <span className="text-xs text-muted-foreground">{p.publisher}</span>
          </div>
          <RiskBadge risk={p.risk_level} />
          {!p.digest && <span className="flex items-center gap-1 text-xs text-sev-critical"><TriangleAlert className="size-3.5" aria-hidden />Image missing</span>}
          <span className="ml-auto">
            {me?.role === "admin" ? (
              <Switch aria-label={`Enable ${p.name}`} checked={p.enabled} onCheckedChange={(checked) => toggle(p.id, checked)} />
            ) : <span className="text-xs text-muted-foreground">{p.enabled ? "On" : "Off"}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
