import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePluginName } from "@/lib/api/hooks";
import { hueOf } from "@/lib/themes";
import { cn } from "@/lib/utils";

const tint = {
  orange: "bg-sev-high-soft text-sev-high",
  yellow: "bg-sev-medium-soft text-sev-medium",
  green: "bg-sev-low-soft text-sev-low",
  blue: "bg-sev-info-soft text-sev-info",
  purple: "bg-purple-soft text-purple",
} as const;

/** A tool as a coloured letter tile; the colour is stable per tool, the name is in the tooltip (or beside it). */
export function PluginTile({ id, withName = false }: { id: string; withName?: boolean }) {
  const name = usePluginName()(id);
  const tile = (
    <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded font-mono text-xs font-semibold", tint[hueOf(id)])} aria-hidden={withName}>
      {name[0]?.toUpperCase()}
    </span>
  );
  if (withName)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {tile}
        {name}
      </span>
    );
  return (
    <Tooltip>
      <TooltipTrigger render={<span role="img" aria-label={name} className="inline-flex" />}>{tile}</TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}

/** Up to five tiles, then "+N". */
export function PluginTiles({ ids }: { ids: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ids.slice(0, 5).map((id) => <PluginTile key={id} id={id} />)}
      {ids.length > 5 && <span className="font-mono text-xs text-muted-foreground">+{ids.length - 5}</span>}
    </span>
  );
}
