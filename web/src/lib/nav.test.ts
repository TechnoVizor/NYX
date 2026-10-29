import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { navGroups, primaryNav, scanTabs, settingsTabs } from "./nav.ts";

const app = new URL("../app/", import.meta.url);
const page = (route: string) => new URL(`.${route}/page.tsx`, app);

function assertBuilt(route: string) {
  const file = page(route);
  assert.ok(existsSync(file), `${route} has no page`);
  assert.ok(!readFileSync(file, "utf8").includes("PlaceholderPage"), `${route} is a placeholder`);
}

test("every menu item opens a built page", () => {
  for (const item of navGroups.flatMap((g) => g.items)) assertBuilt(item.href);
});

test("every settings tab opens a built page", () => {
  for (const tab of settingsTabs) assertBuilt(tab.href);
});

test("every scan tab opens a built page", () => {
  for (const tab of scanTabs) assertBuilt(`/app/scans/[scanId]${tab.path}`);
});

test("the main menu follows the path", () => {
  assert.deepEqual(primaryNav.map((i) => i.label), ["Home", "Targets", "Scans", "Findings", "Assets"]);
  assert.deepEqual(primaryNav.map((i) => i.step), [undefined, 1, 2, 3, 4]);
  assert.ok(navGroups.flatMap((g) => g.items).every((i) => i.tour.startsWith("nav-")));
});
