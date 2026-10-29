"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { skipToken, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { crumbs } from "@/lib/crumbs";
import type { AssetDetail, FindingDetail, ScanDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

// Names come from queries the page already ran; nothing is fetched just for the breadcrumb.
const useCached = <T,>(queryKey: unknown[]) => useQuery<T>({ queryKey, queryFn: skipToken }).data;

export function Breadcrumbs() {
  const pathname = usePathname();
  const [, , section, id] = pathname.split("/");
  const scan = useCached<ScanDetail>(["scans", id]);
  const finding = useCached<FindingDetail>(["findings", "one", id]);
  const asset = useCached<AssetDetail>(["assets", "one", id]);
  const name = (section === "scans" && scan?.root_target.value) || (section === "findings" && finding?.title) || (section === "assets" && asset?.value) || undefined;
  const items = crumbs(pathname, id && name ? { [id]: name } : {});

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {items.map((c, i) => (
          <li key={i} className={cn("flex min-w-0 items-center gap-1.5", i < items.length - 1 && "max-md:hidden")}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle max-md:hidden" aria-hidden />}
            {c.href ? (
              <Link href={c.href} className={cn("truncate text-muted-foreground transition-colors hover:text-foreground", c.mono && "font-mono")}>
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className={cn("truncate font-medium text-foreground", c.mono && "font-mono")}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
