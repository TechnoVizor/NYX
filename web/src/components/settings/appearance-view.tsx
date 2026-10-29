"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { ThemeCard } from "@/components/settings/theme-card";
import type { Mode } from "@/lib/theme-pref";
import { THEMES } from "@/lib/themes";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

const MODES: { mode: Mode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
];

// Arrow keys move between options of a radiogroup; Enter or Space picks (buttons do that natively).
function arrows(e: React.KeyboardEvent<HTMLElement>) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  items[(i + step + items.length) % items.length]?.focus();
  e.preventDefault();
}

export function AppearanceView() {
  const { pref, systemDark, setMode, pick } = useTheme();

  return (
    <div className="max-w-4xl space-y-10">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Mode</h2>
        <div role="radiogroup" aria-label="Mode" onKeyDown={arrows} className="inline-flex rounded-lg border border-border bg-surface-1 p-1">
          {MODES.map(({ mode, label, icon: Icon }) => {
            const on = pref.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setMode(mode)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-3 text-[13px] transition-colors",
                  on ? "bg-brand-soft text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4", on && "text-brand")} />
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {(["dark", "light"] as const).map((kind) => {
        const live = pref.mode === "system" ? systemDark === (kind === "dark") : pref.mode === kind;
        const note = pref.mode !== "system" ? null : live ? "Active now" : `Used when your system is ${kind}`;
        return (
          <section key={kind} className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-sm font-medium">{kind === "dark" ? "Dark theme" : "Light theme"}</h2>
              {note && <span className={cn("text-xs", live ? "text-brand" : "text-muted-foreground")}>{note}</span>}
            </div>
            <div
              role="radiogroup"
              aria-label={kind === "dark" ? "Dark theme" : "Light theme"}
              onKeyDown={arrows}
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
            >
              {THEMES.filter((t) => t.kind === kind).map((t) => (
                <ThemeCard key={t.id} theme={t} selected={pref[kind] === t.id} onPick={() => pick(t.id)} tabIndex={pref[kind] === t.id ? 0 : -1} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
