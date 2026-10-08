"use client";

import { PageHeader } from "@/components/shared/page-header";
import { RiskBadge } from "@/components/plugins/risk-badge";
import { RunPanel } from "@/components/plugins/run-panel";
import { useMe, usePlugin } from "@/lib/api/hooks";

export function PluginDetailView({ id }: { id: string }) {
  const { data: p, error, isLoading } = usePlugin(id);
  const { data: me } = useMe();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !p) return <p role="alert" className="text-sm text-sev-critical">{error?.message ?? "No such plugin."}</p>;
  const m = p.manifest;
  const facts: [string, string][] = [
    ["Accepts", m.io.accepts.join(", ")],
    ["Produces", m.io.produces.join(", ")],
    ["Limits", `${m.resources.cpu} CPU · ${m.resources.memory_mb} MB · ${m.resources.timeout_seconds}s · ${m.limits.default_rate_limit} req/s`],
    ["Network", String(m.permissions.network)],
    ["Image", `${p.image} ${p.digest ? `(${p.digest.slice(0, 19)}…)` : "— missing"}`],
  ];
  return (
    <>
      <PageHeader title={p.name} description={p.description} actions={<RiskBadge risk={p.risk_level} />} />
      <dl className="mb-8 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        {facts.map(([k, v]) => <div key={k} className="contents"><dt className="text-subtle">{k}</dt><dd className="font-mono text-xs leading-6">{v}</dd></div>)}
      </dl>
      {me && me.role !== "viewer" && p.enabled && p.digest && <RunPanel plugin={p} />}
      {!p.enabled && <p className="text-sm text-muted-foreground">This plugin is disabled.</p>}
      {p.runs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Recent runs</h2>
          <ul className="text-xs text-muted-foreground">
            {p.runs.map((r) => <li key={r.id} className="border-b border-border py-1.5 font-mono">{r.created_at.slice(0, 19).replace("T", " ")} · {r.target.value} · {r.status} · {r.event_count} events</li>)}
          </ul>
        </section>
      )}
    </>
  );
}
