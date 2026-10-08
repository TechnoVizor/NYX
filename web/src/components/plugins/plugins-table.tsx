"use client";

import Link from "next/link";
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
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-subtle">
          <tr>{["Plugin", "Risk", "Trust", "Version", "Image", "Enabled"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-1">
              <td className="px-4 py-3">
                <Link href={`/app/plugins/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                <p className="text-xs text-subtle">{p.publisher} · {p.categories.join(", ")}</p>
              </td>
              <td className="px-4 py-3"><RiskBadge risk={p.risk_level} /></td>
              <td className="px-4 py-3 text-muted-foreground">{p.trust_level}</td>
              <td className="px-4 py-3 font-mono text-xs">{p.version}</td>
              <td className="px-4 py-3 font-mono text-xs">{p.digest ? p.digest.slice(7, 19) : <span className="text-sev-critical">image missing</span>}</td>
              <td className="px-4 py-3">
                {me?.role === "admin" ? (
                  <input type="checkbox" aria-label={`Enable ${p.name}`} checked={p.enabled} onChange={(e) => toggle(p.id, e.target.checked)} />
                ) : (p.enabled ? "Yes" : "No")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
