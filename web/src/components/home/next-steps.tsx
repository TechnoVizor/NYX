"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { action, type Facts, type ItemId } from "@/lib/tour/progress";
import { cn } from "@/lib/utils";

const label: Record<ItemId, string> = {
  account: "Account created",
  target: "Add a target you're allowed to test",
  scan: "Run your first scan",
  review: "Review what I found",
};

const focusQuickScan = () => {
  document.getElementById("quick-scan")?.scrollIntoView({ behavior: "smooth", block: "center" });
  document.getElementById("quick-scan-target")?.focus({ preventScroll: true });
};

/** What the current step asks for: one action the role can take, or a sentence when there is nothing to click yet. */
function Action({ id, facts }: { id: ItemId; facts: Facts }) {
  const primary = buttonVariants({ size: "sm" });
  switch (action(id, facts)) {
    case "add-target":
      return <Link href="/app/targets" className={primary}>Add a target</Link>;
    case "wait-admin":
      return <p className="text-sm text-muted-foreground">An admin adds targets; then you can scan them.</p>;
    case "start-scan":
      return <button type="button" onClick={focusQuickScan} className={primary}>Start a scan</button>;
    case "watch-scan":
      return (
        <p className="text-sm text-muted-foreground">
          Your scan is running. <Link href={`/app/scans/${facts.scans[0].id}`} className="text-foreground underline">Watch it</Link>
        </p>
      );
    case "run-again":
      return (
        <span className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          That scan didn&apos;t finish.
          <button type="button" onClick={focusQuickScan} className={primary}>Run again</button>
        </span>
      );
    default:
      return <Link href="/app/findings" className={primary}>Open findings</Link>;
  }
}

export function NextSteps({ facts, items, current, allDone }: { facts: Facts; items: { id: ItemId; done: boolean }[]; current: ItemId | null; allDone: boolean }) {
  const [open, setOpen] = useState(false);
  const canAct = facts.role !== "viewer";

  if (allDone && !open)
    return (
      <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Check className="size-4 shrink-0 text-sev-low" aria-hidden /><span className="flex-1">You&apos;re set up: a target, a scan and a review are in place.</span>
        <button type="button" onClick={() => setOpen(true)} className="text-foreground underline">Show steps</button>
      </p>
    );

  return (
    <section data-tour="home-steps" aria-labelledby="next-steps" className="rounded-lg border border-border bg-surface-1 p-5">
      <h2 id="next-steps" className="text-base font-semibold">Your next step</h2>
      <p className="mt-1 text-sm text-muted-foreground">Four steps to your first reviewed finding.</p>
      <ol className="mt-4 flex flex-col gap-1">
        {items.map(({ id, done }, i) => {
          const now = id === current;
          return (
            <li key={id} className={cn("flex flex-col gap-2 rounded-md px-3 py-2.5", now && "bg-surface-2")}>
              <span className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
                    done ? "border-sev-low text-sev-low" : now ? "border-brand text-brand" : "border-input text-subtle",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn(done ? "text-muted-foreground" : now ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {label[id]}
                </span>
                <span className="sr-only">{done ? "(done)" : now ? "(current step)" : "(to do)"}</span>
              </span>
              {now && canAct && <div className="pl-9"><Action id={id} facts={facts} /></div>}
            </li>
          );
        })}
      </ol>
      {!canAct && <p className="mt-3 text-xs text-muted-foreground">You can read everything; admins and analysts run scans.</p>}
      {allDone && <button type="button" onClick={() => setOpen(false)} className="mt-3 text-sm text-muted-foreground underline">Hide steps</button>}
    </section>
  );
}
