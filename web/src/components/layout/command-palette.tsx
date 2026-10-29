"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Moon, Palette, Plus, Sun } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useMe } from "@/lib/api/hooks";
import { navGroups } from "@/lib/nav";
import { deriveTokens, THEMES } from "@/lib/themes";
import { useTheme } from "@/lib/use-theme";
import { useUiStore } from "@/stores/ui-store";

export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen } = useUiStore();
  const canScan = useMe().data?.role !== "viewer";
  const { pick, setMode } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const { paletteOpen, setPaletteOpen } = useUiStore.getState();
        setPaletteOpen(!paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setPaletteOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen} className="sm:max-w-xl">
      <Command>
      <CommandInput placeholder="Search pages, scans, findings…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {canScan && (
          <>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => go("/app/scans/new")}>
                <Plus /> New scan
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {navGroups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map(({ label, href, icon: Icon }) => (
              <CommandItem key={href} value={`${group.label} ${label}`} onSelect={() => go(href)}>
                <Icon /> {label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Theme">
          {THEMES.map((t) => {
            const k = deriveTokens(t);
            return (
              <CommandItem key={t.id} value={`Theme: ${t.name}`} onSelect={() => { pick(t.id); setPaletteOpen(false); }}>
                <Palette /> Theme: {t.name}
                <span className="ml-auto flex overflow-hidden rounded-sm" aria-hidden>
                  {[k.background, k.brand, k["sev-critical"], k["sev-low"]].map((c, i) => <span key={i} className="h-3 w-2" style={{ background: c }} />)}
                </span>
              </CommandItem>
            );
          })}
          {([["light", Sun], ["dark", Moon], ["system", Monitor]] as const).map(([m, Icon]) => (
            <CommandItem key={m} value={`Theme mode: ${m}`} onSelect={() => { setMode(m); setPaletteOpen(false); }}>
              <Icon /> Theme mode: {m[0].toUpperCase() + m.slice(1)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
