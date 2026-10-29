"use client";

import Link from "next/link";
import { ArrowRight, Boxes, Flame, type LucideIcon, ShieldAlert, Sparkles } from "lucide-react";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { PluginTiles } from "@/components/shared/plugin-tile";
import { Time } from "@/components/shared/time";
import { barSeries, barTotals, ring, statCells, type StatCell } from "@/lib/home";
import { scanStatusMeta, toneText } from "@/lib/status-meta";
import type { Dashboard, Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

const panel = "rounded-lg border border-border bg-card";

const fill: Record<Severity | "unknown", string> = {
  critical: "fill-sev-critical", high: "fill-sev-high", medium: "fill-sev-medium", low: "fill-sev-low", info: "fill-sev-info", unknown: "fill-muted-foreground",
};
const stroke: Record<Severity, string> = {
  critical: "stroke-sev-critical", high: "stroke-sev-high", medium: "stroke-sev-medium", low: "stroke-sev-low", info: "stroke-sev-info",
};
const dot: Record<Severity, string> = {
  critical: "bg-sev-critical", high: "bg-sev-high", medium: "bg-sev-medium", low: "bg-sev-low", info: "bg-sev-info",
};
const toneDot = { green: "bg-sev-low", orange: "bg-sev-high", red: "bg-sev-critical", blue: "bg-sev-info", yellow: "bg-sev-medium", muted: "bg-muted-foreground" } as const;

const cellLook: Record<StatCell["key"], { icon: LucideIcon; tone: string }> = {
  urgent: { icon: Flame, tone: "text-sev-critical" },
  open: { icon: ShieldAlert, tone: "text-sev-high" },
  assets: { icon: Boxes, tone: "text-sev-info" },
  new: { icon: Sparkles, tone: "text-sev-low" },
};

function StatStrip({ d }: { d: Dashboard }) {
  return (
    <section aria-label="At a glance" className={cn(panel, "grid grid-cols-2 lg:grid-cols-4")}>
      {statCells(d).map((c, i) => {
        const { icon: Icon, tone } = cellLook[c.key];
        return (
          <Link
            key={c.key}
            href={c.href}
            className={cn(
              "flex flex-col gap-2 p-5 transition-colors hover:bg-surface-3 lg:p-6",
              i % 2 === 1 && "border-l border-border",
              i >= 2 && "max-lg:border-t lg:border-l",
            )}
          >
            <Icon className={cn("size-4", tone)} aria-hidden />
            <span className="font-mono text-4xl leading-none font-medium tracking-tight">{c.value}</span>
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              {c.label}
              {c.delta !== undefined && <span className="rounded bg-sev-low-soft px-1.5 font-mono text-xs text-sev-low">+{c.delta}</span>}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

function SeverityBars({ days }: { days: Dashboard["findings_per_day"] }) {
  const { bars, max } = barSeries(days);
  const drawn = barTotals(days);
  const W = 600, H = 170, base = H - 22, top = 8, slot = W / bars.length, bw = Math.max(4, slot - 6);
  const total = days.reduce((n, p) => n + p.count, 0);
  return (
    <section className={cn(panel, "p-5 lg:p-6")}>
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold">Findings · 30 days</h2>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{total} new</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-44 w-full" role="img" aria-label={`${total} findings first seen in the last 30 days`} preserveAspectRatio="none">
        {[0, 1, 2, 3].map((g) => <line key={g} x1={0} x2={W} y1={base - (g / 3) * (base - top)} y2={base - (g / 3) * (base - top)} className="stroke-border" vectorEffect="non-scaling-stroke" />)}
        {bars.map((b, i) => {
          const x = i * slot + (slot - bw) / 2;
          if (!b.segments.length) return <rect key={b.date} x={x} y={base - 2} width={bw} height={2} rx={1} className="fill-border-strong" />;
          let y = base;
          return (
            <g key={b.date}>
              <title>{`${b.date}: ${b.segments.map((s) => `${s.value} ${s.severity}`).join(", ")}`}</title>
              {b.segments.map((s) => {
                const h = (s.value / max) * (base - top);
                y -= h;
                return <rect key={s.severity} x={x} y={y} width={bw} height={Math.max(h - 1, 1)} rx={2} className={fill[s.severity]} />;
              })}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
        <span>{days[0]?.date.slice(5)}</span>
        <span>{days.at(-1)?.date.slice(5)}</span>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
        {(["critical", "high", "medium", "low", "info"] as const).filter((s) => drawn[s]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", dot[s])} aria-hidden />
            <span className="capitalize">{s}</span>
            <span className="font-mono text-foreground">{drawn[s]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeverityRing({ open, total }: { open: Dashboard["open_by_severity"]; total: number }) {
  const parts = ring(open);
  const r = 48, c = 2 * Math.PI * r;
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((n, p) => n + p.share * c, 0));
  return (
    <section className={cn(panel, "flex flex-col p-5 lg:p-6")}>
      <h2 className="text-[15px] font-semibold">Open by severity</h2>
      <svg viewBox="0 0 120 120" className="mx-auto my-5 size-40" role="img" aria-label={`${total} open findings`}>
        <circle cx={60} cy={60} r={r} fill="none" strokeWidth={12} className="stroke-surface-3" />
        {parts.map((p, i) => (
          <circle key={p.severity} cx={60} cy={60} r={r} fill="none" strokeWidth={12} className={stroke[p.severity]}
            strokeDasharray={`${Math.max(p.share * c - (parts.length > 1 ? 3 : 0), 0.5)} ${c}`} strokeDashoffset={-starts[i]} transform="rotate(-90 60 60)" />
        ))}
        <text x={60} y={60} textAnchor="middle" className="fill-foreground font-mono text-[26px] font-medium">{total}</text>
        <text x={60} y={78} textAnchor="middle" className="fill-muted-foreground text-[12px]">open</text>
      </svg>
      <ul className="mt-auto grid grid-cols-2 gap-2 text-[13px] text-muted-foreground">
        {(["critical", "high", "medium", "low"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", dot[s])} aria-hidden />
            <span className="capitalize">{s}</span>
            <span className="font-mono text-foreground">{open[s]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListPanel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className={cn(panel, "min-w-0")}>
      <div className="flex items-center px-5 py-4">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <Link href={href} className="ml-auto flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          View all <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <ul>{children}</ul>
    </section>
  );
}

const row = "flex min-w-0 items-center gap-3 border-t border-border px-5 py-3 text-[13px]";

function RecentScans({ scans }: { scans: Dashboard["recent_scans"] }) {
  return (
    <ListPanel title="Recent scans" href="/app/scans">
      {scans.map((s) => {
        const m = scanStatusMeta[s.status];
        return (
          <li key={s.id}>
            <Link href={`/app/scans/${s.id}`} className={cn(row, "hover:bg-surface-3")}>
              <span className={cn("size-2 shrink-0 rounded-full", toneDot[m.tone], m.spin && "animate-pulse-dot")} aria-hidden />
              <span className="min-w-0 truncate font-medium">{s.root_target.value}</span>
              <span className={cn("shrink-0 text-xs", toneText[m.tone])}>{m.label}</span>
              <span className="ml-auto shrink-0 max-sm:hidden"><PluginTiles ids={s.plugin_ids} /></span>
              <span className="shrink-0 text-right font-mono text-xs whitespace-nowrap text-muted-foreground"><Time iso={s.created_at} /></span>
            </Link>
          </li>
        );
      })}
    </ListPanel>
  );
}

function RiskiestAssets({ assets }: { assets: Dashboard["top_assets"] }) {
  const most = Math.max(1, ...assets.map((a) => a.open_findings));
  return (
    <ListPanel title="Riskiest assets" href="/app/assets">
      {assets.map((a) => (
        <li key={a.id}>
          <Link href={`/app/assets?q=${encodeURIComponent(a.value)}`} className={cn(row, "hover:bg-surface-3")}>
            <SeverityBadge severity={a.worst_severity} />
            <span className="min-w-0 truncate font-mono text-xs">{a.value}</span>
            <span className="ml-auto h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <span className={cn("block h-full rounded-full", dot[a.worst_severity])} style={{ width: `${(a.open_findings / most) * 100}%` }} />
            </span>
            <span className="w-6 shrink-0 text-right font-mono text-xs">{a.open_findings}</span>
          </Link>
        </li>
      ))}
      {!assets.length && <li className={cn(row, "text-muted-foreground")}>No open findings on any asset.</li>}
    </ListPanel>
  );
}

/** Everything under the command bar: numbers, the month in bars, what ran, what is most exposed. */
export function Overview({ d }: { d: Dashboard }) {
  return (
    <div className="flex flex-col gap-4">
      <StatStrip d={d} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <SeverityBars days={d.findings_per_day} />
        <SeverityRing open={d.open_by_severity} total={d.open_total} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentScans scans={d.recent_scans} />
        <RiskiestAssets assets={d.top_assets} />
      </div>
    </div>
  );
}
