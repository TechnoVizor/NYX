"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Monitor, Moon, Plus, Sun } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSignOut } from "@/components/layout/topbar";
import { useMe } from "@/lib/api/hooks";
import { navGroups, primaryNav, settingsNav } from "@/lib/nav";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Phones: the path in a bottom bar; Setup, New scan and Sign out behind More. */
export function MobileNav() {
  const pathname = usePathname();
  const { signOut, error } = useSignOut();
  const [more, setMore] = useState(false);
  const canScan = useMe().data?.role !== "viewer";
  const setup = [...navGroups.filter((g) => g.items !== primaryNav).flatMap((g) => g.items), settingsNav];
  const { pref, setMode } = useTheme();

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-1 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-6">
          {primaryNav.map(({ label, href, icon: Icon, tour }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  data-tour={tour}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-1 text-xs",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {active && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand" aria-hidden />}
                  <Icon className={cn("size-5", active && "text-brand")} />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMore(true)}
              className="flex min-h-14 w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
            >
              <Menu className="size-5" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>More</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-1 text-sm">
            {canScan && (
              <li>
                <Link href="/app/scans/new" onClick={() => setMore(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-2 font-medium hover:bg-surface-2">
                  <Plus className="size-4" /> New scan
                </Link>
              </li>
            )}
            {setup.map(({ label, href, icon: Icon, tour }) => (
              <li key={href}>
                <Link
                  href={href}
                  data-tour={tour}
                  onClick={() => setMore(false)}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  <Icon className="size-4" /> {label}
                </Link>
              </li>
            ))}
            <li className="mt-2 border-t border-border pt-3">
              <div role="radiogroup" aria-label="Theme mode" className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
                {([["light", Sun], ["dark", Moon], ["system", Monitor]] as const).map(([m, Icon]) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={pref.mode === m}
                    onClick={() => setMode(m)}
                    className={cn("flex min-h-11 items-center justify-center gap-2 rounded-md text-xs capitalize", pref.mode === m ? "bg-brand-soft text-brand" : "text-muted-foreground")}
                  >
                    <Icon className="size-4" aria-hidden /> {m}
                  </button>
                ))}
              </div>
            </li>
            <li className="mt-1 border-t border-border pt-2">
              <button
                type="button"
                onClick={signOut}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <LogOut className="size-4" /> Sign out
              </button>
              {error && <p role="alert" className="px-2 text-xs text-sev-critical">{error}</p>}
            </li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
