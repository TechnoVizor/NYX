import { Bomb, Eye, Radar, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

// What a plugin does to the target, in words a newcomer reads at a glance.
const look: Record<RiskLevel, { label: string; icon: typeof Eye; tone: string }> = {
  passive: { label: "Passive", icon: Eye, tone: "border-sev-low/40 text-sev-low" },
  safe_active: { label: "Sends requests", icon: Zap, tone: "border-sev-medium/40 text-sev-medium" },
  active: { label: "Probes", icon: Radar, tone: "border-sev-high/40 text-sev-high" },
  intrusive: { label: "Intrusive", icon: Bomb, tone: "border-sev-critical/40 text-sev-critical" },
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const { label, icon: Icon, tone } = look[risk];
  return <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs whitespace-nowrap", tone)}><Icon className="size-3" aria-hidden />{label}</span>;
}
