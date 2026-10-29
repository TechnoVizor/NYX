import { scanStatusMeta, toneText } from "@/lib/status-meta";
import type { RunStatus, ScanStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const statusName = Object.fromEntries(Object.entries(scanStatusMeta).map(([k, m]) => [k, m.label])) as Record<ScanStatus | RunStatus, string>;

export function StatusText({ status }: { status: ScanStatus | RunStatus }) {
  const { label, tone, icon: Icon, spin } = scanStatusMeta[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", toneText[tone])}>
      <Icon className={cn("size-3.5 shrink-0", spin && "animate-spin motion-reduce:animate-none")} aria-hidden />
      {label}
    </span>
  );
}
