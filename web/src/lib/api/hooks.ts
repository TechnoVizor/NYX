"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export const useScans = () => useQuery({ queryKey: ["scans"], queryFn: api.listScans });
export const useScan = (id: string) => useQuery({ queryKey: ["scans", id], queryFn: () => api.getScan(id) });
export const useFindings = () => useQuery({ queryKey: ["findings"], queryFn: api.listFindings });
export const useFinding = (id: string) => useQuery({ queryKey: ["findings", id], queryFn: () => api.getFinding(id) });
export const usePlugins = () => useQuery({ queryKey: ["plugins"], queryFn: api.listPlugins });
export const useMe = () => useQuery({ queryKey: ["me"], queryFn: api.me, retry: false, staleTime: Infinity });
