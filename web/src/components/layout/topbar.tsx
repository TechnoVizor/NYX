"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CircleHelp, LogOut, Search } from "lucide-react";
import { TOUR_RESTART } from "@/components/tour/tour";
import { api, ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";

export function useSignOut() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const signOut = async () => {
    // Leaving the page while the server still holds the session would only look like signing out.
    try {
      await api.logout();
    } catch (x) {
      setError(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
      return;
    }
    qc.clear();
    router.replace("/login");
  };
  return { signOut, error };
}

export function Topbar() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const { data: me, error } = useMe();
  const router = useRouter();
  const { signOut, error: signOutErr } = useSignOut();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace("/login");
  }, [error, router]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-3 text-[13px] text-subtle transition-colors hover:border-border-strong hover:text-muted-foreground"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search or run a command…</span>
        <span className="hidden md:inline-flex"><kbd className="kbd">Ctrl K</kbd></span>
      </button>
      <div className="ml-auto flex items-center gap-3 text-xs text-subtle">
        {me && me.role !== "viewer" && (
          <button
            type="button"
            onClick={() => dispatchEvent(new Event(TOUR_RESTART))}
            aria-label="Restart the tour"
            title="Restart the tour"
            className="flex size-9 items-center justify-center rounded-lg border border-border transition-colors hover:border-border-strong hover:text-foreground"
          >
            <CircleHelp className="size-4" />
          </button>
        )}
        {signOutErr ? <span role="alert" className="text-sev-critical">{signOutErr}</span> : me && <span className="hidden sm:inline">{me.email} · {me.role}</span>}
        <button type="button" onClick={signOut} className="hidden h-8 items-center md:flex gap-1.5 rounded-lg border border-border px-2.5 transition-colors hover:border-border-strong hover:text-muted-foreground">
          <LogOut className="size-3.5" />Sign out
        </button>
      </div>
    </header>
  );
}
