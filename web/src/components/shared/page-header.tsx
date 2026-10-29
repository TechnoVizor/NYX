import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A title and its actions. A rule the user needs goes in `info`, behind an icon, not in a sentence under the title. */
export function PageHeader({ title, info, actions }: { title: string; info?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {info && (
          <Tooltip>
            <TooltipTrigger render={<button type="button" aria-label={info} className="text-muted-foreground transition-colors hover:text-foreground" />}>
              <Info className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{info}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {actions}
    </div>
  );
}
