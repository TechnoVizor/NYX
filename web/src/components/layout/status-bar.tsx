"use client";

import { useEffect } from "react";
import Link from "next/link";
import { create } from "zustand";
import { CircleCheck, CircleX, Loader2, Palette, ShieldAlert } from "lucide-react";
import { useDashboard, useScan, useScans } from "@/lib/api/hooks";
import { barState, loadSeenFailed, saveSeenFailed } from "@/lib/status-bar";
import type { RunStatus } from "@/lib/types";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const useSeen = create<{ id: string | null; set: (id: string) => void }>((set) => ({
  id: null,
  set: (id) => {
    saveSeenFailed(id);
    set({ id });
  },
}));

/** Called by the scan page: opening a failed scan quiets the red bar in this browser. */
export function useMarkFailedSeen(id: string, failed: boolean) {
  const set = useSeen((s) => s.set);
  useEffect(() => {
    if (failed) set(id);
  }, [id, failed, set]);
}

const DONE: RunStatus[] = ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"];

function Progress({ id, total }: { id: string; total: number }) {
  const runs = useScan(id).data?.runs ?? {};
  const done = DONE.reduce((n, s) => n + (runs[s] ?? 0), 0);
  return <span className="font-mono">{done}/{total} tools</span>;
}

const seg = "flex h-full items-center gap-1.5 px-2 hover:bg-black/10";

/** VS Code-style status bar: the live state of the workspace. Turns red while the newest scan's failure is unseen. */
export function StatusBar() {
  const scans = useScans().data ?? [];
  const seen = useSeen((s) => s.id);
  useEffect(() => useSeen.setState({ id: loadSeenFailed() }), []);
  const state = barState(scans, seen);
  const open = useDashboard().data?.open_by_severity;
  const urgent = open ? open.critical + open.high : 0;
  const { theme } = useTheme();
  const openPalette = useUiStore((s) => s.setPaletteOpen);

  return (
    <footer
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 hidden h-6 items-stretch text-xs md:flex",
        state.kind === "failed" ? "bg-bar-alert text-on-bar-alert" : "bg-bar text-on-bar",
      )}
    >
      {state.kind === "running" && (
        <Link href={`/app/scans/${state.scan.id}`} className={seg}>
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="font-mono">{state.scan.root_target.value}</span>
          <Progress id={state.scan.id} total={state.scan.plugin_ids.length} />
          {state.more > 0 && <span>+{state.more}</span>}
        </Link>
      )}
      {state.kind === "failed" && (
        <Link href={`/app/scans/${state.scan.id}`} className={seg}>
          <CircleX className="size-3.5" aria-hidden />
          Scan failed · <span className="font-mono">{state.scan.root_target.value}</span>
        </Link>
      )}
      {state.kind === "idle" && (
        <span className={cn(seg, "hover:bg-transparent")}>
          <CircleCheck className="size-3.5" aria-hidden /> Idle
        </span>
      )}
      <Link href="/app/findings?severity=critical,high" className={seg} aria-label={`${urgent} open critical or high findings`}>
        <ShieldAlert className="size-3.5" aria-hidden />
        <span className="font-mono">{urgent}</span>
      </Link>
      <Link href="/app/settings/appearance" className={cn(seg, "ml-auto")}>
        <Palette className="size-3.5" aria-hidden /> {theme.name}
      </Link>
      <button type="button" onClick={() => openPalette(true)} className={cn(seg, "font-mono")}>
        Ctrl K
      </button>
    </footer>
  );
}
