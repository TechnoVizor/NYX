import { ago } from "@/lib/format";

/** "3 h ago" in the cell, the exact moment on hover. */
export function Time({ iso }: { iso: string }) {
  return <time dateTime={iso} title={new Date(iso).toLocaleString()}>{ago(iso)}</time>;
}
