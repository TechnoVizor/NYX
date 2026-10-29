"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // clipboard blocked: the text is still selectable
    }
  };
  return (
    <button type="button" onClick={copy} aria-label={label} title={label} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-3 hover:text-foreground">
      {done ? <Check className="size-4 text-sev-low" /> : <Copy className="size-4" />}
    </button>
  );
}
