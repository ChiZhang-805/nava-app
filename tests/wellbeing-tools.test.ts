import assert from "node:assert/strict";
import test from "node:test";
import { monthlyWellbeing, monthDates } from "../src/services/monthlyWellbeing.ts";
import { exerciseStageAt, exerciseStageDurations } from "../src/services/exerciseStages.ts";
import type { MoodRecord, SleepRecord } from "../src/types";

const mood = (date: string, score: number, factors: string[] = []): MoodRecord => ({ id: date, record_date: date, mood_score: score, factors, diary_content: null, ai_feedback: null });
test("month has actual calendar dates, including leap year, not rolling thirty days", () => {
  assert.equal(monthDates("2024-02").length, 29);
  assert.equal(monthDates("2026-02").length, 28);
  assert.equal(monthDates("2026-09").length, 30);
  assert.deepEqual(monthDates("2026-13"), []);
});
test("monthly average excludes absent/future/foreign-month days but retains zero", () => {
  const summary = monthlyWellbeing("mood", [mood("2026-09-01", 0), mood("2026-09-03", 80), mood("2026-09-20", 100), mood("2026-08-31", 90)], "2026-09", "2026-09-15");
  assert.equal(summary.count, 2);
  assert.equal(summary.average, 40);
  assert.equal(summary.points[0].missing, false);
  assert.equal(summary.points[1].missing, true);
  assert.equal(summary.points[19].missing, true);
});
test("duplicate days and duplicate factors are not counted twice", () => {
  const old = { ...mood("2026-09-01", 20), updated_at: "2026-09-01T01:00:00Z" };
  const newer = { ...mood("2026-09-01", 60, ["work", "work", "sleep"]), updated_at: "2026-09-01T02:00:00Z" };
  const summary = monthlyWellbeing("mood", [newer, old, mood("2026-09-03", 80, ["work"])], "2026-09", "2026-09-15");
  assert.equal(summary.count, 2);
  assert.equal(summary.average, 70);
  assert.deepEqual(summary.factors, [["work", 2], ["sleep", 1]]);
});
test("sleep duration unknown remains unknown; empty month has no fabricated average", () => {
  const rows = [ { id: "a", record_date: "2026-09-01", sleep_duration_minutes: null }, { id: "b", record_date: "2026-09-02", sleep_duration_minutes: 450 } ] as SleepRecord[];
  const summary = monthlyWellbeing("sleep", rows, "2026-09", "2026-09-15");
  assert.equal(summary.average, 450);
  assert.equal(summary.count, 1);
  assert.equal(monthlyWellbeing("sleep", [], "2026-09", "2026-09-15").average, null);
});
test("workout changes at actual 5/15/5-minute boundaries and completes at 25 min", () => {
  const plan = { plannedMinutes: 25, steps: ["热身 5 分钟", "步行 15 分钟", "拉伸 5 分钟"], stepSeconds: [300, 900, 300] };
  for (const [seconds, index] of [[0, 0], [299, 0], [300, 1], [1199, 1], [1200, 2], [1499, 2]]) assert.equal(exerciseStageAt(plan, seconds)?.index, index);
  assert.deepEqual(exerciseStageAt(plan, 1500), { index: 2, remaining: 0, complete: true });
  assert.equal(exerciseStageAt(plan, 2000)?.complete, true);
  assert.deepEqual(exerciseStageDurations({ ...plan, stepSeconds: undefined }), [300, 900, 300]);
});
test("legacy English plans recover, unknown or contradictory durations aren't invented", () => {
  assert.deepEqual(exerciseStageDurations({ plannedMinutes: 12, steps: ["Walk · 4 min", "Stretch · 5 min", "Reset · 3 min"] }), [240, 300, 180]);
  assert.equal(exerciseStageAt({ plannedMinutes: 12, steps: ["Walk", "Stretch"] }, 600), null);
  assert.equal(exerciseStageAt({ plannedMinutes: 25, steps: ["a", "b"], stepSeconds: [300, 300] }, 400), null);
});
