"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboard, useMe } from "@/lib/api/hooks";
import { navGroups, settingsNav, type NavItem } from "@/lib/nav";
import { loadRailOpen } from "@/lib/rail";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`) || (href.startsWith("/app/settings") && pathname.startsWith("/app/settings"));

/** Names in a tooltip only while the sidebar is collapsed; open, the label is right there. */
function Tip({ open, label, children }: { open: boolean; label: string; children: React.ReactElement }) {
  if (open) return children;
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailItem({ item, open, badge }: { item: NavItem; open: boolean; badge?: number }) {
  const pathname = usePathname();
  const { label, href, icon: Icon, tour, step } = item;
  const active = isActive(pathname, href);
  return (
    <Tip open={open} label={step ? `${step} · ${label}` : label}>
      <Link
        href={href}
        data-tour={tour}
        aria-current={active ? "page" : undefined}
        aria-label={badge ? `${label}, ${badge} open critical or high` : label}
        className={cn(
          "relative flex h-9 items-center gap-2.5 rounded-lg transition-colors",
          open ? "w-full px-2.5" : "w-9 justify-center",
          active ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        )}
      >
        <Icon className="size-5 shrink-0" strokeWidth={1.75} />
        {open && <span className={cn("flex-1 truncate text-[13px]", active && "text-foreground")}>{label}</span>}
        {open && step && <span className="font-mono text-xs text-subtle" aria-hidden>{step}</span>}
        {!!badge && (
          <span
            className={cn(
              "min-w-4 rounded-full bg-bar-alert px-1 text-center font-mono text-xs leading-4 text-on-bar-alert",
              !open && "absolute -right-1 -top-1",
            )}
            aria-hidden
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    </Tip>
  );
}

/** VS Code-style sidebar: open with names by default, collapses to icons (button or Ctrl+B); the choice is remembered. */
export function ActivityRail() {
  const canScan = useMe().data?.role !== "viewer";
  const open_ = useDashboard().data?.open_by_severity;
  const urgent = open_ ? open_.critical + open_.high : 0;
  const { railOpen: open, setRailOpen } = useUiStore();

  useEffect(() => {
    useUiStore.setState({ railOpen: loadRailOpen() });
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b" && !(e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]"))) {
        e.preventDefault();
        const s = useUiStore.getState();
        s.setRailOpen(!s.railOpen);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar pb-9 pt-3 md:flex",
        open ? "w-56 px-3" : "w-12 items-center",
      )}
    >
      <Logo href="/app/dashboard" compact={!open} className={cn("mb-2 text-foreground", open && "px-1")} />
      {canScan && (
        <Tip open={open} label="New scan">
          <Link
            href="/app/scans/new"
            aria-label="New scan"
            className={cn(
              "mb-2 flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground transition-transform active:scale-[0.97]",
              open ? "w-full" : "w-9",
            )}
          >
            <Plus className="size-5" />
            {open && "New scan"}
          </Link>
        </Tip>
      )}
      <nav aria-label="Primary" className={cn("flex flex-1 flex-col gap-1", !open && "items-center")}>
        {navGroups.map((group, i) => (
          <div key={group.label} className={cn("flex flex-col gap-1", !open && "items-center", i > 0 && "mt-2 border-t border-sidebar-border pt-3")}>
            {open && group.label !== "Path" && <p className="px-2.5 pb-1 text-xs font-medium text-subtle">{group.label}</p>}
            {group.items.map((item) => (
              <RailItem key={item.href} item={item} open={open} badge={item.href === "/app/findings" ? urgent : undefined} />
            ))}
          </div>
        ))}
        <div className={cn("mt-auto flex flex-col gap-1", !open && "items-center")}>
          <RailItem item={settingsNav} open={open} />
          <Tip open={open} label="Expand sidebar · Ctrl B">
            <button
              type="button"
              onClick={() => setRailOpen(!open)}
              aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
              aria-expanded={open}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                open ? "w-full px-2.5" : "w-9 justify-center",
              )}
            >
              {open ? <PanelLeftClose className="size-5" strokeWidth={1.75} /> : <PanelLeftOpen className="size-5" strokeWidth={1.75} />}
              {open && <span className="flex-1 text-left text-[13px]">Collapse</span>}
              {open && <kbd className="kbd">Ctrl B</kbd>}
            </button>
          </Tip>
        </div>
      </nav>
    </aside>
  );
}
