import { Check } from "lucide-react";
import type { Theme } from "@/lib/themes";
import { cn } from "@/lib/utils";

/** A miniature workbench drawn in the theme's own tokens: the card is the preview. */
export function ThemeCard({ theme, selected, onPick, ...rest }: { theme: Theme; selected: boolean; onPick: () => void } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className="group flex flex-col gap-2 rounded-xl text-left outline-none"
      {...rest}
    >
      <div
        data-theme={theme.id}
        className={cn(
          "relative flex aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-background transition-[box-shadow] duration-150",
          "group-hover:border-border-strong group-focus-visible:ring-2 group-focus-visible:ring-ring",
          selected && "ring-2 ring-ring",
        )}
        aria-hidden
      >
        <div className="flex w-5 flex-col items-center gap-1.5 bg-sidebar pt-2">
          <span className="size-2 rounded-sm bg-brand" />
          <span className="size-1.5 rounded-sm bg-muted-foreground/50" />
          <span className="size-1.5 rounded-sm bg-muted-foreground/50" />
        </div>
        <div className="flex flex-1 flex-col">
          <div className="flex-1 space-y-1.5 p-2.5">
            {(["high", "medium", "low"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-5 rounded-sm", { high: "bg-sev-high-soft", medium: "bg-sev-medium-soft", low: "bg-sev-low-soft" }[s])}>
                  <span className={cn("block h-full w-1.5 rounded-sm", { high: "bg-sev-high", medium: "bg-sev-medium", low: "bg-sev-low" }[s])} />
                </span>
                <span className="h-1.5 rounded-full bg-foreground/70" style={{ width: `${48 - i * 10}%` }} />
                <span className="ml-auto h-1.5 w-4 rounded-full bg-muted-foreground/50" />
              </div>
            ))}
          </div>
          <div className="h-2 bg-bar" />
        </div>
        {selected && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-sidebar-primary-foreground">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className={cn("px-0.5 text-[13px]", selected ? "font-medium text-foreground" : "text-muted-foreground")}>{theme.name}</span>
    </button>
  );
}
