import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Same shapes as public/brand/nyx-logo.svg, split per letter so hover can write them one by one.
export const letters = [
  "M5 7 L1 15 L1 278 L79 360 L80 132 L200 227 L353 353 L468 353 L300 213 L35 5 L18 0Z",
  "M258 0 L483 182 L483 321 L522 355 L562 320 L562 182 L789 1 L668 1 L523 112 L381 1Z",
  "M573 353 L673 353 L801 249 L928 353 L1036 353 L906 247 L708 93 L658 133 L738 197 L750 209Z M1069 1 L957 1 L783 139 L837 181Z",
];

export function Logo({ href = "/", compact = false, className }: { href?: string; compact?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("nyx-logo flex items-center gap-2.5 rounded-md", className)} aria-label="NYX home">
      <span className={cn("block overflow-hidden", compact && "w-[31px]")}>
        <svg viewBox="0 0 1071 362" fill="#fff" aria-hidden className="block h-6 w-auto max-w-none">
          {letters.map((d, i) => (
            <path key={i} d={d} className="nyx-letter" style={{ "--i": i } as CSSProperties} />
          ))}
        </svg>
      </span>
    </Link>
  );
}
