import { test } from "node:test";
import assert from "node:assert/strict";
import { focusIsFree } from "./focus.ts";

test("focus is free on the page body or inside the card", () => {
  assert.equal(focusIsFree({ onBody: true, inCard: false }), true);
  assert.equal(focusIsFree({ onBody: false, inCard: true }), true);
});

test("focus is busy in a field or another dialog", () => {
  assert.equal(focusIsFree({ onBody: false, inCard: false }), false);
});
