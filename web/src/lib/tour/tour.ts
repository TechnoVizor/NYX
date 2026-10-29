// Which tour step to show, from what the user confirmed and what the workspace already holds.
// A step ends only when the user presses its button; the workspace decides what the step says. When its fact
// already holds (a target exists, a scan finished) the step shows "done" with Next, so a set-up workspace still
// gets the whole walk instead of a tour that vanishes after the welcome.

import { finished, reviewed, type Facts } from "./progress.ts";

export type TourStepId = "welcome" | "target" | "scan" | "findings" | "review";
export const STEPS: TourStepId[] = ["welcome", "target", "scan", "findings", "review"];

/** acked: steps the user moved past with the card's button. */
export type TourState = { status: "active" | "skipped" | "done"; acked: TourStepId[] };
export type Variant = "default" | "done" | "waiting-admin" | "scan-running" | "scan-failed" | "no-findings";
export type TourView = { step: TourStepId; index: number; variant: Variant } | null;

const at = (step: TourStepId, variant: Variant = "default"): TourView => ({ step, index: STEPS.indexOf(step) + 1, variant });

export function currentStep(s: TourState, f: Facts): TourView {
  if (s.status !== "active" || f.role === "viewer") return null;
  const todo = (step: TourStepId) => !s.acked.includes(step);
  if (todo("welcome")) return at("welcome");
  if (todo("target")) return at("target", f.scopeCount > 0 ? "done" : f.role === "analyst" ? "waiting-admin" : "default");
  if (todo("scan")) {
    if (f.scans.some((x) => finished(x.status))) return at("scan", "done");
    const newest = f.scans[0]?.status;
    if (!newest) return at("scan");
    return at("scan", newest === "FAILED" || newest === "CANCELLED" ? "scan-failed" : "scan-running");
  }
  if (todo("findings")) return at("findings", f.findingsTotal === 0 ? "no-findings" : "default");
  // Nothing found: nothing to review, the findings card already said goodbye.
  if (todo("review") && f.findingsTotal > 0) return at("review", reviewed(f) ? "done" : "default");
  return null;
}

export const ack = (s: TourState, step: TourStepId): TourState => ({ ...s, acked: s.acked.includes(step) ? s.acked : [...s.acked, step] });
export const skip = (s: TourState): TourState => ({ ...s, status: "skipped" });
export const restart = (): TourState => ({ status: "active", acked: [] });
