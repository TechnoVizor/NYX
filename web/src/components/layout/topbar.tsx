"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { UserMenu } from "@/components/layout/user-menu";
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

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace("/login");
  }, [error, router]);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-6">
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search or run a command"
          className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface-1 px-2.5 text-[13px] text-subtle transition-colors hover:border-border-strong hover:text-muted-foreground md:w-72"
        >
          <Search className="size-4" />
          <span className="hidden flex-1 text-left md:inline">Search or run…</span>
          <span className="hidden md:inline-flex"><kbd className="kbd">Ctrl K</kbd></span>
        </button>
        {me && me.role !== "viewer" && (
          <button
            type="button"
            onClick={() => dispatchEvent(new Event(TOUR_RESTART))}
            aria-label="Restart the tour"
            title="Restart the tour"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <CircleHelp className="size-4" />
          </button>
        )}
        <UserMenu />
      </div>
    </header>
  );
}
