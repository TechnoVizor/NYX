"use client";

import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";

export type Box = { x: number; y: number; w: number; h: number; vw: number; vh: number };

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** Where the target is on screen; null while it is missing (page loading, list empty, not on this layout). */
export function useTargetBox(id?: string): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    let scrolled = false;
    const measure = () => {
      const el = id ? [...document.querySelectorAll(`[data-tour="${id}"]`)].find(visible) : undefined;
      if (!el) return setBox((b) => (b ? null : b));
      if (!scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: "nearest" });
      }
      const r = el.getBoundingClientRect();
      const next = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight };
      setBox((b) => (b && Object.entries(next).every(([k, v]) => b[k as keyof Box] === v) ? b : next));
    };
    // ponytail: polls every 300 ms besides resize/scroll, so targets that mount late or move with data are found;
    // a MutationObserver is the upgrade if this ever shows in a profile.
    const timer = setInterval(measure, 300);
    const frame = requestAnimationFrame(measure);
    addEventListener("resize", measure);
    addEventListener("scroll", measure, true);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
      removeEventListener("resize", measure);
      removeEventListener("scroll", measure, true);
    };
  }, [id]);
  return box;
}

const PAD = 6;
const R = 10;

function hole(x: number, y: number, w: number, h: number) {
  return `M${x + R},${y} H${x + w - R} A${R},${R} 0 0 1 ${x + w},${y + R} V${y + h - R} A${R},${R} 0 0 1 ${x + w - R},${y + h} H${x + R} A${R},${R} 0 0 1 ${x},${y + h - R} V${y + R} A${R},${R} 0 0 1 ${x + R},${y} Z`;
}

/**
 * Dims everything but the target. The dim layer takes clicks (so the user acts on the target, or skips);
 * the cut-out lets clicks through to the target itself.
 */
export function Spotlight({ box }: { box: Box }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(box.x - PAD);
  const y = useMotionValue(box.y - PAD);
  const w = useMotionValue(box.w + PAD * 2);
  const h = useMotionValue(box.h + PAD * 2);
  const d = useTransform([x, y, w, h], ([a, b, c, e]: number[]) => `M0,0 H${box.vw} V${box.vh} H0 Z ${hole(a, b, c, e)}`);
  const outline = useTransform([x, y, w, h], ([a, b, c, e]: number[]) => hole(a, b, c, e));

  useEffect(() => {
    const opts = reduce ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const };
    const runs = [
      animate(x, box.x - PAD, opts),
      animate(y, box.y - PAD, opts),
      animate(w, box.w + PAD * 2, opts),
      animate(h, box.h + PAD * 2, opts),
    ];
    return () => runs.forEach((r) => r.stop());
  }, [box, reduce, x, y, w, h]);

  return (
    // z-60: above dialogs (z-50) and the bottom bar (z-40).
    <svg className="pointer-events-none fixed inset-0 z-60 h-dvh w-dvw" aria-hidden>
      <motion.path d={d} fill="rgb(0 0 0 / 0.62)" fillRule="evenodd" className="pointer-events-auto" />
      <motion.path d={outline} fill="none" stroke="var(--brand)" strokeWidth={2} />
    </svg>
  );
}
