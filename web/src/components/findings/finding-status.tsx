import { findingStatusMeta, toneText } from "@/lib/status-meta";
import type { FindingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const statusLabel = Object.fromEntries(Object.entries(findingStatusMeta).map(([k, m]) => [k, m.label])) as Record<FindingStatus, string>;

export function FindingStatusText({ status }: { status: FindingStatus }) {
  const { label, tone, icon: Icon } = findingStatusMeta[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", toneText[tone])}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}
