import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const tone: Record<Severity, string> = {
  critical: "border-sev-critical/40 text-sev-critical",
  high: "border-sev-high/40 text-sev-high",
  medium: "border-sev-medium/40 text-sev-medium",
  low: "border-sev-low/40 text-sev-low",
  info: "border-sev-info/40 text-sev-info",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cn("rounded border px-1.5 py-0.5 font-mono text-xs uppercase tracking-wider", tone[severity])}>{severity}</span>;
}
