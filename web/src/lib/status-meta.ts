// How each status looks: a word, an icon and a theme hue. Colour never stands alone: the icon and word go with it.

import { CircleCheck, CircleDashed, CircleDot, CircleSlash, Contrast, CircleX, Clock, Loader2, type LucideIcon, Pause, ShieldOff, Zap } from "lucide-react";
import type { FindingStatus, RunStatus, ScanStatus } from "./types.ts";

export type Tone = "green" | "orange" | "red" | "blue" | "yellow" | "muted";
export type StatusMeta = { label: string; tone: Tone; icon: LucideIcon; spin?: boolean };

export const toneText: Record<Tone, string> = {
  green: "text-sev-low", orange: "text-sev-high", red: "text-sev-critical", blue: "text-sev-info", yellow: "text-sev-medium", muted: "text-muted-foreground",
};

export const scanStatusMeta: Record<ScanStatus | RunStatus, StatusMeta> = {
  CREATED: { label: "Queued", tone: "muted", icon: Clock },
  PENDING: { label: "Queued", tone: "muted", icon: Clock },
  RUNNING: { label: "Running", tone: "blue", icon: Loader2, spin: true },
  PAUSED: { label: "Paused", tone: "muted", icon: Pause },
  COMPLETED: { label: "Completed", tone: "green", icon: CircleCheck },
  SUCCEEDED: { label: "Succeeded", tone: "green", icon: CircleCheck },
  PARTIAL: { label: "Partial", tone: "orange", icon: Contrast },
  FAILED: { label: "Failed", tone: "red", icon: CircleX },
  TIMED_OUT: { label: "Timed out", tone: "red", icon: CircleDashed },
  CANCELLED: { label: "Cancelled", tone: "muted", icon: CircleSlash },
};

export const findingStatusMeta: Record<FindingStatus, StatusMeta> = {
  open: { label: "Open", tone: "blue", icon: CircleDot },
  confirmed: { label: "Confirmed", tone: "yellow", icon: Zap },
  false_positive: { label: "False positive", tone: "muted", icon: CircleSlash },
  accepted_risk: { label: "Accepted risk", tone: "muted", icon: ShieldOff },
  fixed: { label: "Fixed", tone: "green", icon: CircleCheck },
};
