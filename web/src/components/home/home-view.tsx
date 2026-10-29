"use client";

import { TriangleAlert } from "lucide-react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Button } from "@/components/ui/button";
import { NextSteps } from "@/components/home/next-steps";
import { QuickScan } from "@/components/scans/quick-scan";
import { useProgress } from "@/lib/tour/use-progress";

/** Before the first scan: the steps are the page. After it: the steps above the numbers until the path is done. */
export function HomeView() {
  const { facts, result, error, retry } = useProgress();
  if (error)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-sev-critical/40 p-4 text-sm">
        <TriangleAlert className="size-5 shrink-0 text-sev-critical" aria-hidden />
        <span className="flex-1">{error.message}</span>
        <Button variant="outline" size="sm" onClick={retry}>Try again</Button>
      </div>
    );
  if (!facts || !result) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="flex flex-col gap-8">
      <NextSteps facts={facts} {...result} />
      <QuickScan />
      {facts.scans.length > 0 && <DashboardView />}
    </div>
  );
}
