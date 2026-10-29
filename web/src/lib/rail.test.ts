import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRailOpen, saveRailOpen } from "./rail.ts";

const store = (v: string | null) => {
  let saved = v;
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: () => saved, setItem: (_: string, x: string) => { saved = x; } },
    configurable: true,
  });
};

test("the sidebar starts open", () => {
  store(null);
  assert.equal(loadRailOpen(), true);
});
test("a closed sidebar stays closed", () => {
  store(null);
  saveRailOpen(false);
  assert.equal(loadRailOpen(), false);
});
test("junk or blocked storage means open", () => {
  store("maybe");
  assert.equal(loadRailOpen(), true);
  Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => { throw new Error("blocked"); } }, configurable: true });
  assert.equal(loadRailOpen(), true);
});
