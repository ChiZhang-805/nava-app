import assert from "node:assert/strict";
import test from "node:test";
import { chartBarMotion, chartSequenceEnd, clampChartPercent } from "../src/services/chartMotion.ts";

test("clamps chart percentages to a safe visual range", () => {
  assert.equal(clampChartPercent(-12), 0);
  assert.equal(clampChartPercent(74), 74);
  assert.equal(clampChartPercent(140), 100);
});

test("assigns deterministic but different bar durations", () => {
  const first = chartBarMotion(0, 365, 480);
  const second = chartBarMotion(1, 470, 480);
  const third = chartBarMotion(2, 420, 480);
  assert.notEqual(first.durationMs, second.durationMs);
  assert.notEqual(second.durationMs, third.durationMs);
  assert.ok(first.delayMs < second.delayMs && second.delayMs < third.delayMs);
});

test("starts the line only after the final bar has finished", () => {
  const points = [{ value: 365 }, { value: 470 }, { value: 420 }, { value: 440 }];
  const end = chartSequenceEnd(points);
  points.forEach((point, index) => {
    const motion = chartBarMotion(index, point.value, 470);
    assert.ok(end >= motion.delayMs + motion.durationMs);
  });
});
