import { cn } from "@/lib/utils";
import type { RunStatus, ScanStatus } from "@/lib/types";

const tone: Record<string, string> = {
  COMPLETED: "text-sev-low", SUCCEEDED: "text-sev-low",
  RUNNING: "text-sev-medium", PENDING: "text-sev-medium", CREATED: "text-sev-medium", PAUSED: "text-subtle",
  PARTIAL: "text-sev-high",
  FAILED: "text-sev-critical", TIMED_OUT: "text-sev-critical", CANCELLED: "text-subtle",
};

export function StatusText({ status }: { status: ScanStatus | RunStatus }) {
  return <span className={cn("font-mono text-xs", tone[status])}>{status}</span>;
}
