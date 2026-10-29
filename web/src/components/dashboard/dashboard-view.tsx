"use client";

import Link from "next/link";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { StatusText } from "@/components/scans/scan-status";
import { useDashboard } from "@/lib/api/hooks";
import { severities, type Dashboard, type Severity } from "@/lib/types";

const fill: Record<Severity, string> = {
  critical: "bg-sev-critical", high: "bg-sev-high", medium: "bg-sev-medium", low: "bg-sev-low", info: "bg-sev-info",
};
const card = "rounded-lg border border-border p-4";
const list = "rounded-lg border border-border text-sm";
const item = "flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0";

function Tile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className={`${card} hover:bg-surface-1`}>
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}</p>
    </Link>
  );
}

function SeverityBar({ open }: { open: Dashboard["open_by_severity"] }) {
  const total = severities.reduce((n, s) => n + open[s], 0);
  return (
    <div className={card}>
      <h2 className="mb-3 text-sm font-semibold">Open by severity</h2>
      {total ? (
        <div className="flex h-2.5 gap-0.5">
          {severities.filter((s) => open[s]).map((s) => (
            <span key={s} title={`${s}: ${open[s]}`} className={`${fill[s]} rounded-sm`} style={{ width: `${(open[s] / total) * 100}%` }} />
          ))}
        </div>
      ) : <p className="text-xs text-muted-foreground">Nothing open.</p>}
      <ul className="mt-3 flex flex-wrap gap-3">
        {severities.map((s) => <li key={s} className="flex items-center gap-1.5"><SeverityBadge severity={s} /><span className="font-mono text-xs">{open[s]}</span></li>)}
      </ul>
    </div>
  );
}

function Sparkline({ points }: { points: Dashboard["findings_per_day"] }) {
  const w = 300, h = 60, max = Math.max(1, ...points.map((p) => p.count)), step = w / (points.length - 1);
  const xy = points.map((p, i) => [i * step, h - 2 - (p.count / max) * (h - 4)] as const);
  const total = points.reduce((n, p) => n + p.count, 0);
  return (
    <div className={card}>
      <h2 className="mb-3 text-sm font-semibold">New findings per day</h2>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full overflow-visible" role="img" aria-label={`${total} new findings in the last 30 days`} preserveAspectRatio="none">
        <path d={xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--color-brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {/* Hover targets wider than the line: one column per day. */}
        {points.map((p, i) => <rect key={p.date} x={xy[i][0] - step / 2} y={0} width={step} height={h} fill="transparent"><title>{`${p.date}: ${p.count}`}</title></rect>)}
      </svg>
      <p className="mt-2 flex justify-between text-xs text-subtle"><span>{points[0]?.date}</span><span>{total} new in 30 days</span><span>{points.at(-1)?.date}</span></p>
    </div>
  );
}

export function DashboardView() {
  const { data: d, error } = useDashboard();
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Open critical + high" value={d.open_by_severity.critical + d.open_by_severity.high} href="/app/findings" />
        <Tile label="Open findings" value={d.open_total} href="/app/findings" />
        <Tile label="Assets" value={d.assets_total} href="/app/assets" />
        <Tile label="New assets, 7 days" value={d.assets_new_7d} href="/app/assets" />
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <SeverityBar open={d.open_by_severity} />
        <Sparkline points={d.findings_per_day} />
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold">Recent scans</h2>
          <ul className={list}>
            {d.recent_scans.map((s) => (
              <li key={s.id} className={item}>
                <Link href={`/app/scans/${s.id}`} className="font-medium hover:underline">{s.root_target.value}</Link>
                <StatusText status={s.status} />
                <span className="ml-auto text-xs text-subtle">{new Date(s.created_at).toLocaleString()}</span>
              </li>
            ))}
            {!d.recent_scans.length && <li className={`${item} text-xs text-muted-foreground`}>No scans yet.&nbsp;<Link href="/app/scans/new" className="underline">Start one.</Link></li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Assets with the most open findings</h2>
          <ul className={list}>
            {d.top_assets.map((a) => (
              <li key={a.id} className={item}>
                <SeverityBadge severity={a.worst_severity} />
                <Link href={`/app/assets?q=${encodeURIComponent(a.value)}`} className="truncate font-mono text-xs hover:underline">{a.value}</Link>
                <span className="ml-auto font-mono text-xs">{a.open_findings}</span>
              </li>
            ))}
            {!d.top_assets.length && <li className={`${item} text-xs text-muted-foreground`}>No open findings on any asset.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
