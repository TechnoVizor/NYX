"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { copyFor } from "@/components/tour/steps";
import { Spotlight, useTargetBox } from "@/components/tour/spotlight";
import { TourCard } from "@/components/tour/tour-card";
import { loadTour, saveTour } from "@/lib/tour/storage";
import { ack, currentStep, restart, skip, type TourState } from "@/lib/tour/tour";
import { useProgress } from "@/lib/tour/use-progress";

export const TOUR_RESTART = "nyx:tour-restart";

/** NYX walks a new user through the real screens. Renders nothing for viewers, after Skip, or once the path is done. */
export function Tour() {
  const pathname = usePathname();
  const { facts } = useProgress();
  const [state, setState] = useState<TourState | null>(() => (typeof window === "undefined" ? null : loadTour()));
  const update = useCallback((s: TourState) => {
    saveTour(s);
    setState(s);
  }, []);

  useEffect(() => {
    const onRestart = () => update(restart());
    addEventListener(TOUR_RESTART, onRestart);
    return () => removeEventListener(TOUR_RESTART, onRestart);
  }, [update]);

  const view = state && facts ? currentStep(state, facts) : null;
  const copy = view && facts ? copyFor(view, facts, pathname) : null;
  const box = useTargetBox(copy?.target);
  const onSkip = useCallback(() => state && update(skip(state)), [state, update]);

  // The path is walked: remember it for the next visit, so the tour does not come back if the data later changes.
  const finished = state?.status === "active" && facts && facts.role !== "viewer" && !view;
  useEffect(() => {
    if (finished && state) saveTour({ ...state, status: "done" });
  }, [finished, state]);

  if (!view || !copy || !state) return null;
  return (
    <>
      {box && <Spotlight box={box} />}
      <TourCard
        copy={copy}
        index={view.index}
        box={box}
        onPrimary={() => update(ack(state, view.step))}
        onSkip={onSkip}
      />
    </>
  );
}
