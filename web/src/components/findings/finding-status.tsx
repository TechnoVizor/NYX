import { cn } from "@/lib/utils";
import type { FindingStatus } from "@/lib/types";

export const statusLabel: Record<FindingStatus, string> = {
  open: "Open", confirmed: "Confirmed", false_positive: "False positive", accepted_risk: "Accepted risk", fixed: "Fixed",
};
const tone: Record<FindingStatus, string> = {
  open: "text-sev-high", confirmed: "text-sev-critical", false_positive: "text-subtle", accepted_risk: "text-muted-foreground", fixed: "text-sev-low",
};

export function FindingStatusText({ status }: { status: FindingStatus }) {
  return <span className={cn("text-xs", tone[status])}>{statusLabel[status]}</span>;
}
