import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

const tone: Record<RiskLevel, string> = {
  passive: "border-sev-low/40 text-sev-low",
  safe_active: "border-sev-medium/40 text-sev-medium",
  active: "border-sev-high/40 text-sev-high",
  intrusive: "border-sev-critical/40 text-sev-critical",
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider", tone[risk])}>{risk.replace("_", " ")}</span>;
}
