import { test } from "node:test";
import assert from "node:assert/strict";
import type { Facts } from "./progress.ts";
import { ack, currentStep, restart, skip, type TourState } from "./tour.ts";
import { loadTour, saveTour } from "./storage.ts";

const facts = (f: Partial<Facts> = {}): Facts => ({ role: "admin", scopeCount: 0, scans: [], findingsTotal: 0, reviewedTotal: 0, ...f });
const scan = (status: Facts["scans"][number]["status"]) => ({ id: "s1", status, error: status === "FAILED" ? "Runner down." : null });
const fresh: TourState = restart();
const afterWelcome = ack(fresh, "welcome");
const view = (s: TourState, f: Facts) => {
  const v = currentStep(s, f);
  return v && `${v.step}/${v.variant}`;
};

test("a fresh admin starts at welcome", () => assert.equal(view(fresh, facts()), "welcome/default"));
test("after welcome, an empty workspace asks for a target", () => assert.equal(view(afterWelcome, facts()), "target/default"));
test("an analyst with no targets waits for an admin", () =>
  assert.equal(view(afterWelcome, facts({ role: "analyst" })), "target/waiting-admin"));
test("a running scan keeps the tour on the scan step", () =>
  assert.equal(view(afterWelcome, facts({ scopeCount: 1, scans: [scan("RUNNING")] })), "scan/scan-running"));
test("a failed first scan stays on the scan step", () =>
  assert.equal(view(afterWelcome, facts({ scopeCount: 1, scans: [scan("FAILED")] })), "scan/scan-failed"));
test("a finished scan with findings moves to findings", () =>
  assert.equal(view(afterWelcome, facts({ scopeCount: 1, scans: [scan("COMPLETED")], findingsTotal: 3 })), "findings/default"));
test("after findings, the tour asks for a review", () =>
  assert.equal(view(ack(afterWelcome, "findings"), facts({ scopeCount: 1, scans: [scan("COMPLETED")], findingsTotal: 3 })), "review/default"));
test("a saved review ends the tour", () =>
  assert.equal(view(ack(afterWelcome, "findings"), facts({ scopeCount: 1, scans: [scan("COMPLETED")], findingsTotal: 3, reviewedTotal: 1 })), null));
test("a clean first scan ends on good news", () => {
  const f = facts({ scopeCount: 1, scans: [scan("COMPLETED")] });
  assert.equal(view(afterWelcome, f), "findings/no-findings");
  assert.equal(view(ack(afterWelcome, "findings"), f), null);
});
test("viewers never get the tour", () => assert.equal(view(fresh, facts({ role: "viewer" })), null));
test("a skipped tour stays hidden", () => assert.equal(view(skip(fresh), facts()), null));
test("a workspace that is already done ends right after welcome", () =>
  assert.equal(view(afterWelcome, facts({ scopeCount: 2, scans: [scan("COMPLETED")], findingsTotal: 5, reviewedTotal: 2 })), null));
test("step index counts from 1 to 5", () => assert.equal(currentStep(afterWelcome, facts())?.index, 2));

test("storage that throws gives a first visit and never breaks", () => {
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  Object.defineProperty(globalThis, "localStorage", { value: throwing, configurable: true });
  assert.deepEqual(loadTour(), restart());
  assert.doesNotThrow(() => saveTour(skip(restart())));
});

test("garbage in storage gives a first visit", () => {
  const store = { getItem: () => "{not json", setItem: () => {} };
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  assert.deepEqual(loadTour(), restart());
});

test("a saved state comes back", () => {
  let saved = "";
  const store = { getItem: () => saved, setItem: (_: string, v: string) => { saved = v; } };
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  saveTour(afterWelcome);
  assert.deepEqual(loadTour(), afterWelcome);
});
