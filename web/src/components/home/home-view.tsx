"use client";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { NextSteps } from "@/components/home/next-steps";
import { QuickScan } from "@/components/scans/quick-scan";
import { useProgress } from "@/lib/tour/use-progress";

/** Before the first scan: the steps are the page. After it: the steps above the numbers until the path is done. */
export function HomeView() {
  const { facts, result } = useProgress();
  if (!facts || !result) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="flex flex-col gap-8">
      <NextSteps facts={facts} {...result} />
      <QuickScan />
      {facts.scans.length > 0 && <DashboardView />}
    </div>
  );
}
