import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

/** Stand-in for screens that are routed but not built yet. */
export function PlaceholderPage({ title, description, route }: { title: string; description?: string; route: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="panel flex min-h-72 flex-col items-center justify-center gap-3 border-dashed p-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg border border-border-strong bg-surface-2">
          <Hammer className="size-4 text-muted-foreground" />
        </span>
        <p className="text-sm font-medium">Not built yet</p>
        <p className="font-mono text-xs text-subtle">{route}</p>
      </div>
    </>
  );
}
