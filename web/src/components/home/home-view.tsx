"use client";

import { TriangleAlert } from "lucide-react";
import { NextSteps } from "@/components/home/next-steps";
import { Overview } from "@/components/home/overview";
import { QuickScan } from "@/components/scans/quick-scan";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/lib/api/hooks";
import { headline, metaLine } from "@/lib/home";
import { useProgress } from "@/lib/tour/use-progress";

/** Faint blueprint grid behind the top of Home: structure on a dark canvas, never content. */
function Blueprint() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-8 h-[440px]"
      style={{
        backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        maskImage: "radial-gradient(ellipse 80% 90% at 50% 0%, #000 25%, transparent 75%)",
      }}
    />
  );
}

/** Home is a command center: what needs you, a place to start a scan, then the numbers. Before any scan, the steps lead. */
export function HomeView() {
  const { facts, result, error, retry } = useProgress();
  const { data: d } = useDashboard();
  if (error)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-sev-critical/40 p-4 text-sm">
        <TriangleAlert className="size-5 shrink-0 text-sev-critical" aria-hidden />
        <span className="flex-1">{error.message}</span>
        <Button variant="outline" size="sm" onClick={retry}>Try again</Button>
      </div>
    );
  if (!facts || !result) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const firstRun = facts.scans.length === 0;
  const urgent = d ? d.open_by_severity.critical + d.open_by_severity.high : 0;
  const { lead, tail } = headline(urgent);

  return (
    <div className="relative">
      <Blueprint />
      <div className="relative mx-auto flex max-w-[1200px] flex-col gap-8">
        {firstRun ? (
          <NextSteps facts={facts} {...result} />
        ) : (
          <>
            <NextSteps facts={facts} {...result} compact />
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs text-muted-foreground">{metaLine(facts.scopeCount, d?.recent_scans[0]?.created_at ?? null)}</p>
              <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.03em] text-balance md:text-[40px]">
                {lead}
                {facts.role !== "viewer" && <span className="text-muted-foreground"> {tail}</span>}
              </h1>
            </div>
          </>
        )}
        <QuickScan />
        {!firstRun && d && <Overview d={d} />}
      </div>
    </div>
  );
}
