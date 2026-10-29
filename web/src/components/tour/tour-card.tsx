"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Box } from "@/components/tour/spotlight";
import type { StepCopy } from "@/components/tour/steps";
import { focusIsFree } from "@/components/tour/focus";

const W = 380; // card width on wide screens
const GAP = 14;
const PHONE = 768; // below md the card docks above the bottom bar

/** Next to the target when there is one; otherwise out of the way in the corner. */
function place(box: Box | null, cardH: number) {
  const vw = innerWidth, vh = innerHeight;
  if (vw < PHONE) return { left: 12, top: vh - cardH - 80 };
  if (!box) return { left: vw - W - 24, top: vh - cardH - 24 };
  const below = box.y + box.h + GAP + cardH < vh - 16;
  const top = below ? box.y + box.h + GAP : Math.max(16, box.y - GAP - cardH);
  return { left: Math.min(Math.max(16, box.x), vw - W - 16), top };
}

export function TourCard({
  copy,
  index,
  box,
  onPrimary,
  onSkip,
}: {
  copy: StepCopy;
  index: number;
  box: Box | null;
  onPrimary: () => void;
  onSkip: () => void;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const [cardH, setCardH] = useState(220);
  const [, setViewport] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    const onResize = () => setViewport(innerWidth * 10000 + innerHeight);
    addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      removeEventListener("resize", onResize);
    };
  }, []);

  // A new step takes the keyboard focus and Esc skips the tour, but only when the user is not busy elsewhere
  // (typing in a field, working in a dialog): a scan finishing in the background must not steal the cursor.
  const free = () => {
    const active = document.activeElement;
    return focusIsFree({ onBody: !active || active === document.body, inCard: !!active && !!ref.current?.contains(active) });
  };
  useEffect(() => {
    if (free()) first.current?.focus({ preventScroll: true });
  }, [copy.title]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && free() && onSkip();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onSkip]);

  const { left, top } = place(box, cardH);
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      initial={reduce ? false : { opacity: 0, y: top + 8, x: left }}
      animate={{ opacity: 1, x: left, y: top }}
      transition={reduce ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 z-60 flex w-[calc(100vw-24px)] gap-4 overflow-hidden rounded-xl border border-border-strong bg-surface-2 p-4 shadow-2xl md:w-[380px]"
    >
      <Image src="/brand/nyx-portrait.webp" alt="" width={72} height={96} className="h-24 w-[72px] shrink-0 rounded-lg bg-surface-3 object-cover object-top" />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex gap-1" role="img" aria-label={`Step ${index} of 5`}>
            {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i === index ? "h-1.5 w-4 rounded-full bg-brand" : i < index ? "size-1.5 rounded-full bg-muted-foreground" : "size-1.5 rounded-full bg-input"} />)}
          </span>
          {copy.name}
        </p>
        <h2 id="tour-title" className="text-base font-semibold text-balance">{copy.title}</h2>
        <p id="tour-body" className="text-sm text-muted-foreground text-pretty">{copy.body}</p>
        {copy.hint && <p className="text-sm font-medium text-brand">{copy.hint}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {copy.primary?.href ? (
            <Link ref={first} href={copy.primary.href} className={buttonVariants({ size: "sm" })}>{copy.primary.label}</Link>
          ) : copy.primary ? (
            <Button ref={first} size="sm" onClick={onPrimary}>{copy.primary.label}</Button>
          ) : null}
          <button
            ref={copy.primary ? undefined : first}
            type="button"
            onClick={onSkip}
            className="min-h-8 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Skip tour
          </button>
        </div>
      </div>
    </motion.div>
  );
}
