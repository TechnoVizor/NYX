// Which tour step to show, from what the user confirmed and what the workspace already holds.
// A step is done when its fact holds, so a reload, another tab or an older workspace resumes in the right place.

import { finished, reviewed, type Facts } from "./progress.ts";

export type TourStepId = "welcome" | "target" | "scan" | "findings" | "review";
export const STEPS: TourStepId[] = ["welcome", "target", "scan", "findings", "review"];

/** acked: steps that only explain, done when the user presses the primary button. */
export type TourState = { status: "active" | "skipped" | "done"; acked: TourStepId[] };
export type Variant = "default" | "waiting-admin" | "scan-running" | "scan-failed" | "no-findings";
export type TourView = { step: TourStepId; index: number; variant: Variant } | null;

const at = (step: TourStepId, variant: Variant = "default"): TourView => ({ step, index: STEPS.indexOf(step) + 1, variant });

export function currentStep(s: TourState, f: Facts): TourView {
  if (s.status !== "active" || f.role === "viewer") return null;
  if (!s.acked.includes("welcome")) return at("welcome");
  if (f.scopeCount === 0) return at("target", f.role === "analyst" ? "waiting-admin" : "default");
  if (!f.scans.some((x) => finished(x.status))) {
    const newest = f.scans[0]?.status;
    if (!newest) return at("scan");
    return at("scan", newest === "FAILED" || newest === "CANCELLED" ? "scan-failed" : "scan-running");
  }
  if (!s.acked.includes("findings") && f.reviewedTotal === 0) return at("findings", f.findingsTotal === 0 ? "no-findings" : "default");
  return reviewed(f) ? null : at("review");
}

export const ack = (s: TourState, step: TourStepId): TourState => ({ ...s, acked: s.acked.includes(step) ? s.acked : [...s.acked, step] });
export const skip = (s: TourState): TourState => ({ ...s, status: "skipped" });
export const restart = (): TourState => ({ status: "active", acked: [] });
