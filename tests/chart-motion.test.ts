import assert from "node:assert/strict";
import test from "node:test";
import { chartBarMotion, chartSequenceEnd, clampChartPercent } from "../src/services/chartMotion.ts";
import {
  activityHeatmap,
  activityPeriodDistribution,
  clockAlignmentScore,
  sleepStageHeights,
  sleepTimelineGeometry,
} from "../src/services/visualMetrics.ts";

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

test("maps sleep timing and stages from actual record values", () => {
  const geometry = sleepTimelineGeometry("00:15", "07:20", 425);
  assert.equal(geometry.durationMinutes, 425);
  assert.ok(geometry.widthPercent > 60 && geometry.widthPercent < 80);
  assert.ok(Math.abs(geometry.leftPercent - (100 - geometry.widthPercent) / 2) < 0.02);
  const heights = sleepStageHeights([85, 247, 77]);
  assert.equal(heights[1], 96);
  assert.ok(heights[0] > heights[2]);
  assert.deepEqual(sleepStageHeights([0, 0, 0]), [0, 0, 0]);
});

test("derives the four activity periods and the heatmap from activity bins", () => {
  const health = [{
    id: "health-1",
    record_date: "2026-08-27",
    latest_heart_rate: 76,
    resting_heart_rate: 62,
    heart_rate_variability_sdnn: 47,
    blood_oxygen: 98,
    activity_bins: Array.from({ length: 24 }, (_, hour) => ({ hour, steps: hour >= 18 && hour < 20 ? 900 : 20, exerciseMinutes: hour === 18 ? 20 : 0 })),
    source: "manual_health",
  }];
  const periods = activityPeriodDistribution(health, []);
  assert.equal(periods.length, 4);
  assert.equal(periods[3].active, true);
  assert.equal(Math.max(...periods.map((item) => item.heightPercent)), periods[3].heightPercent);
  const heatmap = activityHeatmap(health, []);
  assert.equal(heatmap.cells.length, 12);
  assert.equal(heatmap.peakStartHour, 18);
  assert.ok(heatmap.cells.every((cell) => cell.intensity >= 0.12 && cell.intensity <= 1));
});

test("does not invent hourly activity from daily totals", () => {
  const exercise = [{ id: "exercise-1", record_date: "2026-08-29", steps: 8420, calories: 486, exercise_minutes: 42, heart_rate: null, spo2: null, self_rating: null, ai_feedback: null }];
  assert.ok(activityPeriodDistribution([], exercise).every((period) => period.heightPercent === 0));
  assert.deepEqual(activityHeatmap([], exercise).cells, []);
});

test("clock alignment responds to real bedtime variance", () => {
  const stable = ["23:30", "23:35", "23:25", "23:32"].map((sleep_start, index) => ({ id: `${index}`, record_date: `2026-08-${20 + index}`, sleep_start, sleep_end: "07:00", sleep_duration_minutes: 450, deep_sleep_minutes: 90, light_sleep_minutes: 260, rem_minutes: 85, self_rating: 4, rhythm_score: 82, ai_feedback: null }));
  const irregular = ["22:10", "01:40", "23:00", "02:20"].map((sleep_start, index) => ({ ...stable[index], sleep_start, sleep_duration_minutes: [360, 510, 390, 480][index] }));
  assert.ok(clockAlignmentScore(stable, []) > clockAlignmentScore(irregular, []));
  assert.equal(clockAlignmentScore([], []), null);
});
