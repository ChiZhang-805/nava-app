import assert from "node:assert/strict";
import test from "node:test";
import { INTEGRATED_SHELL_PAGES, integratedShellPage } from "../src/services/integratedShell.ts";

test("the continuous canvas covers exactly the approved 25 pages", () => {
  assert.equal(INTEGRATED_SHELL_PAGES.length, 25);
  assert.equal(new Set(INTEGRATED_SHELL_PAGES).size, 25);
});

test("root, profile, home-function and shop routes resolve to their page templates", () => {
  assert.equal(integratedShellPage("today", null, null), "home");
  assert.equal(integratedShellPage("record", null, null), "records");
  assert.equal(integratedShellPage("ai", null, null), "chat");
  assert.equal(integratedShellPage("trends", null, null), "growth");
  assert.equal(integratedShellPage("profile", null, null), "profile");
  assert.equal(integratedShellPage("profile", null, "skin"), "profile-skin");
  assert.equal(integratedShellPage("today", null, "day-2026-10-09"), "daily-record");
  assert.equal(integratedShellPage("today", null, "points-shop-category-study"), "points-shop-category");
  assert.equal(integratedShellPage("today", null, "points-shop-product-notebook"), "points-shop-product");
});

test("immersive routes do not inherit the 25-page shell", () => {
  assert.equal(integratedShellPage("record", "focus", "immersive"), null);
  assert.equal(integratedShellPage("record", "sleep", "guide"), null);
  assert.equal(integratedShellPage("today", null, "getting-started"), null);
});
