"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { RunStatus } from "@/lib/types";

export const useScans = () => useQuery({ queryKey: ["scans"], queryFn: api.listScans });
export const useScan = (id: string) => useQuery({ queryKey: ["scans", id], queryFn: () => api.getScan(id) });
export const useFindings = () => useQuery({ queryKey: ["findings"], queryFn: api.listFindings });
export const useFinding = (id: string) => useQuery({ queryKey: ["findings", id], queryFn: () => api.getFinding(id) });
export const useMe = () => useQuery({ queryKey: ["me"], queryFn: api.me, retry: false, staleTime: Infinity });

const live = (s?: RunStatus) => s === "PENDING" || s === "RUNNING";

export const usePlugins = () => useQuery({ queryKey: ["plugins"], queryFn: api.listPlugins });
export const usePlugin = (id: string) => useQuery({ queryKey: ["plugins", id], queryFn: () => api.getPlugin(id) });
export const useRun = (id: string | null) =>
  useQuery({ queryKey: ["runs", id], queryFn: () => api.getRun(id!), enabled: !!id, refetchInterval: (q) => (live(q.state.data?.status) ? 1000 : false) });
// ponytail: refetches the whole event list (≤500) each second; switch to ?after=<seq> paging if runs grow past that.
export const useRunEvents = (id: string | null, polling: boolean) =>
  useQuery({ queryKey: ["runs", id, "events"], queryFn: () => api.runEvents(id!), enabled: !!id, refetchInterval: polling ? 1000 : false });
export const useScope = () => useQuery({ queryKey: ["scope"], queryFn: api.listScope });
