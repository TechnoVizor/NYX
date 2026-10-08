"use client";

import { Search } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";

export function Topbar() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-3 text-[13px] text-subtle transition-colors hover:border-border-strong hover:text-muted-foreground"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search or run a command…</span>
        <kbd className="kbd">Ctrl K</kbd>
      </button>
      <div className="ml-auto hidden items-center gap-2 text-xs text-subtle sm:flex">
        <span className="size-1.5 animate-pulse-dot rounded-full bg-sev-low" aria-hidden />
        <span>All systems operational</span>
      </div>
    </header>
  );
}
