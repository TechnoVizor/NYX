"use client";

import { useMarkFailedSeen } from "@/components/layout/status-bar";
import { StatusText } from "@/components/scans/scan-status";
import { CopyButton } from "@/components/shared/copy-button";
import { Time } from "@/components/shared/time";
import { useScan } from "@/lib/api/hooks";

/** The scan by what it scanned, not by its id; the id is one click away for bug reports. */
export function ScanHeader({ id }: { id: string }) {
  const { data: scan } = useScan(id);
  useMarkFailedSeen(id, scan?.status === "FAILED");
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h1 className="text-2xl font-semibold break-all">{scan?.root_target.value ?? "Scan"}</h1>
      {scan && <StatusText status={scan.status} />}
      {scan && <span className="text-xs text-muted-foreground"><Time iso={scan.created_at} /></span>}
      <CopyButton text={id} label="Copy scan id" />
    </div>
  );
}
