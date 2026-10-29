import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tint = {
  brand: "bg-brand-soft text-brand",
  green: "bg-sev-low-soft text-sev-low",
  muted: "bg-surface-3 text-muted-foreground",
} as const;

/** An empty list: one icon, one line, one action. */
export function EmptyState({ icon: Icon, tone = "brand", children }: { icon: LucideIcon; tone?: keyof typeof tint; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-6 py-10 text-center text-sm text-muted-foreground">
      <span className={cn("flex size-11 items-center justify-center rounded-full", tint[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div>{children}</div>
    </div>
  );
}
