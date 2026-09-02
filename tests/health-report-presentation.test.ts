import assert from "node:assert/strict";
import test from "node:test";
import { allHealthModulesRecorded, buildHealthModulePresentations, compareRecordedPeriodAverages } from "../src/services/healthReportPresentation.ts";
import type { TodaySnapshot } from "../src/types.ts";

const completeSnapshot: TodaySnapshot = {
  date: "2026-09-02",
  mood: { id: "m", record_date: "2026-09-02", mood_score: 82, factors: ["睡眠", "工作"], diary_content: "状态不错", ai_feedback: "继续保持" },
  sleep: { id: "s", record_date: "2026-09-02", sleep_start: "23:30", sleep_end: "07:10", sleep_duration_minutes: 460, deep_sleep_minutes: 80, light_sleep_minutes: 280, rem_minutes: 100, self_rating: 4, rhythm_score: 86, ai_feedback: null },
  exercise: { id: "e", record_date: "2026-09-02", steps: 7800, calories: 420, exercise_minutes: 38, heart_rate: "78", spo2: "98", self_rating: 4, ai_feedback: null },
  nutrition: { id: "n", record_date: "2026-09-02", total_calories: 1680, breakfast_items: [{ name: "燕麦" }], lunch_items: [{ name: "鸡胸肉" }], protein_grams: 96, hydration_ml: 1500, ai_feedback: null },
  face: { id: "f", record_date: "2026-09-02", image_path: null, overall_score: 84, skin_age: 27, annotations: [], feedback: "平稳", model_version: "v1", capture_mode: "bare_face", analysis_confidence: 0.91 },
  focusMinutes: 95,
  focusSessions: 4,
  rhythmScore: 83,
  nextAction: "继续记录",
};

test("health report cards are generated from the selected date snapshot", () => {
  const cards = buildHealthModulePresentations(completeSnapshot, "zh");
  assert.deepEqual(cards.sleep.points, ["7小时40分", "23:30 — 07:10", "自评 4/5", "节律 86/100"]);
  assert.deepEqual(cards.focus.points.slice(0, 3), ["95 分钟", "4 次完成", "平均 24 分钟/次"]);
  assert.deepEqual(cards.diet.points.slice(0, 3), ["1680 kcal", "已记 2 餐", "蛋白质 96 g"]);
  assert.equal(allHealthModulesRecorded(cards), true);
});

test("a missing module stays explicitly missing and blocks the six-module AI prompt", () => {
  const cards = buildHealthModulePresentations({ ...completeSnapshot, face: null }, "zh");
  assert.equal(cards.face.recorded, false);
  assert.match(cards.face.points[0], /暂无记录/);
  assert.equal(allHealthModulesRecorded(cards), false);
});

test("zero focus duration is missing rather than presented as a completed record", () => {
  const cards = buildHealthModulePresentations({ ...completeSnapshot, focusMinutes: 0, focusSessions: 0 }, "en");
  assert.equal(cards.focus.recorded, false);
  assert.equal(cards.focus.points[0], "No record yet");
});

test("period comparison averages recorded days and preserves a missing previous period", () => {
  assert.deepEqual(compareRecordedPeriodAverages([80, 90], [70, 80]), { currentAverage: 85, previousAverage: 75, change: 10 });
  assert.deepEqual(compareRecordedPeriodAverages([80, 90], []), { currentAverage: 85, previousAverage: null, change: null });
});
