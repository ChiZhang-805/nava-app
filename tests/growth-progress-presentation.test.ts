import assert from "node:assert/strict";
import test from "node:test";
import { growthCounterValue, growthNewTaskIds, shouldAnimateGrowthVisit, type GrowthProgressVisit } from "../src/services/growthProgressPresentation.ts";

const visit = (overrides: Partial<GrowthProgressVisit> = {}): GrowthProgressVisit => ({
  isFirstVisit: false,
  previousPoints: 20,
  currentPoints: 50,
  delta: 30,
  currentTaskKeys: ["profile-foundation", "2026-08-28:sleep-window"],
  newTaskKeys: ["2026-08-28:sleep-window"],
  ...overrides,
});

test("first visit and unchanged visits do not animate", () => {
  assert.equal(shouldAnimateGrowthVisit(visit({ isFirstVisit: true })), false);
  assert.equal(shouldAnimateGrowthVisit(visit({ currentPoints: 20, delta: 0 })), false);
  assert.equal(shouldAnimateGrowthVisit(visit()), true);
});

test("dated task keys map back to the visible task card", () => {
  assert.deepEqual(growthNewTaskIds(visit({
    newTaskKeys: ["2026-08-28:sleep-window", "profile-foundation", "2026-08-28:sleep-window"],
  })), ["sleep-window", "profile-foundation"]);
});

test("counter rolls forward quickly and lands on the exact total", () => {
  const values = [0, 0.2, 0.45, 0.7, 1].map((progress) => growthCounterValue(20, 50, progress));
  assert.equal(values[0], 20);
  assert.equal(values.at(-1), 50);
  assert.ok(values.every((value, index) => index === 0 || value >= values[index - 1]));
  assert.ok(values.some((value, index) => index > 0 && value - values[index - 1] > 1));
});

