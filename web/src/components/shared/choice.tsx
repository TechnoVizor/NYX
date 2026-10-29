"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Option = { value: string; label: string };

// "" means "no filter" in our forms; the select primitive wants a non-empty key for it.
const ANY = "__any";
const key = (v: string) => (v === "" ? ANY : v);
const back = (v: string) => (v === ANY ? "" : v);

/** A dark, keyboard-friendly dropdown for picking one of a few named options. */
export function Choice({ value, onChange, options, label, className }: { value: string; onChange: (v: string) => void; options: Option[]; label: string; className?: string }) {
  const items = options.map((o) => ({ value: key(o.value), label: o.label }));
  return (
    <Select items={items} value={key(value)} onValueChange={(v) => v != null && onChange(back(String(v)))}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
