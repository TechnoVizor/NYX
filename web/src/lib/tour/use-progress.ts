"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { scanLive, useMe, useScans, useScope } from "@/lib/api/hooks";
import { progress, type Facts } from "@/lib/tour/progress";

const REVIEWED = ["confirmed", "false_positive", "accepted_risk", "fixed"] as const;

/** The facts the Home checklist and the tour read, and where they put the workspace. */
export function useProgress() {
  const me = useMe();
  const scope = useScope();
  const scans = useScans();
  const live = (scans.data ?? []).some((s) => scanLive(s.status));
  const every = { refetchInterval: live ? 5000 : (false as const) };
  const all = useQuery({ queryKey: ["findings", "progress", "all"], queryFn: () => api.listFindings({}), ...every });
  const reviewedQ = useQuery({ queryKey: ["findings", "progress", "reviewed"], queryFn: () => api.listFindings({ status: [...REVIEWED] }), ...every });

  const ready = me.data && scope.data && scans.data && all.data && reviewedQ.data;
  const facts: Facts | undefined = ready
    ? {
        role: me.data!.role,
        scopeCount: scope.data!.length,
        scans: scans.data!.map((s) => ({ id: s.id, status: s.status, error: s.error })),
        findingsTotal: all.data!.total,
        reviewedTotal: reviewedQ.data!.total,
      }
    : undefined;
  return { facts, result: facts && progress(facts), isLoading: !ready };
}
