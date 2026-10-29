"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboard, useMe } from "@/lib/api/hooks";
import { navGroups, settingsNav, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`) || (href.startsWith("/app/settings") && pathname.startsWith("/app/settings"));

function RailItem({ item, badge }: { item: NavItem; badge?: number }) {
  const pathname = usePathname();
  const { label, href, icon: Icon, tour, step } = item;
  const active = isActive(pathname, href);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            data-tour={tour}
            aria-current={active ? "page" : undefined}
            aria-label={badge ? `${label}, ${badge} open critical or high` : label}
            className={cn(
              "relative flex size-9 items-center justify-center rounded-lg transition-colors",
              active ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )}
          />
        }
      >
        <Icon className="size-5" strokeWidth={1.75} />
        {!!badge && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-bar-alert px-1 text-center font-mono text-xs leading-4 text-on-bar-alert" aria-hidden>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{step ? `${step} · ${label}` : label}</TooltipContent>
    </Tooltip>
  );
}

/** VS Code-style activity bar: icons only, names in tooltips, the path first and settings at the bottom. */
export function ActivityRail() {
  const canScan = useMe().data?.role !== "viewer";
  const open = useDashboard().data?.open_by_severity;
  const urgent = open ? open.critical + open.high : 0;

  return (
    <aside className="sticky top-0 hidden h-dvh w-12 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3 md:flex">
      <Logo href="/app/dashboard" compact className="mb-2 text-foreground" />
      {canScan && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                href="/app/scans/new"
                aria-label="New scan"
                className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform active:scale-[0.97]"
              />
            }
          >
            <Plus className="size-5" />
          </TooltipTrigger>
          <TooltipContent side="right">New scan</TooltipContent>
        </Tooltip>
      )}
      <nav aria-label="Primary" className="flex flex-1 flex-col items-center gap-1">
        {navGroups.map((group, i) => (
          <div key={group.label} className={cn("flex flex-col items-center gap-1", i > 0 && "mt-2 border-t border-sidebar-border pt-3")}>
            {group.items.map((item) => (
              <RailItem key={item.href} item={item} badge={item.href === "/app/findings" ? urgent : undefined} />
            ))}
          </div>
        ))}
        <div className="mt-auto">
          <RailItem item={settingsNav} />
        </div>
      </nav>
    </aside>
  );
}
