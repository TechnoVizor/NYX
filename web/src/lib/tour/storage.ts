// Tour state per browser. Storage can be missing or throw (private window, blocked site data): the tour then
// simply starts fresh for the session.

import { restart, STEPS, type TourState } from "./tour.ts";

const KEY = "nyx-tour";

export function loadTour(): TourState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "");
    if (["active", "skipped", "done"].includes(s?.status) && Array.isArray(s.acked) && s.acked.every((a: unknown) => STEPS.includes(a as never)))
      return { status: s.status, acked: s.acked };
  } catch {
    // fall through to a first visit
  }
  return restart();
}

export function saveTour(s: TourState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // the tour still works for this session
  }
}
