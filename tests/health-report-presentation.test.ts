import assert from "node:assert/strict";
import test from "node:test";
import {
  allHealthModulesComplete,
  allHealthModulesRecorded,
  buildHealthModulePresentations,
  buildHealthModuleProgress,
  compareRecordedPeriodAverages,
  healthModuleDictionaryPoints,
  healthModuleEntryView,
} from "../src/services/healthReportPresentation.ts";
import type { TodaySnapshot } from "../src/types.ts";

const completeSnapshot: TodaySnapshot = {
  date: "2026-09-02",
  mood: { id: "m", record_date: "2026-09-02", mood_score: 82, factors: ["睡眠", "工作"], diary_content: "状态不错", ai_feedback: "继续保持" },
  sleep: { id: "s", record_date: "2026-09-02", sleep_start: "23:30", sleep_end: "07:10", sleep_duration_minutes: 460, deep_sleep_minutes: 80, light_sleep_minutes: 280, rem_minutes: 100, self_rating: 4, rhythm_score: 86, ai_feedback: null },
  exercise: { id: "e", record_date: "2026-09-02", steps: 7800, calories: 420, exercise_minutes: 38, heart_rate: "78", spo2: "98", self_rating: 4, ai_feedback: null },
  nutrition: { id: "n", record_date: "2026-09-02", total_calories: 1680, breakfast_items: [{ name: "燕麦" }], lunch_items: [{ name: "鸡胸肉" }], dinner_items: [{ name: "三文鱼" }], pantry_items: [{ name: "坚果" }], protein_grams: 96, hydration_ml: 1500, ai_feedback: null },
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
  assert.deepEqual(cards.diet.points.slice(0, 3), ["1680 kcal", "已记 4 餐", "蛋白质 96 g"]);
  assert.equal(allHealthModulesRecorded(cards), true);
  assert.equal(allHealthModulesComplete(cards), true);
});

test("a missing module stays explicitly missing and blocks the six-module AI prompt", () => {
  const cards = buildHealthModulePresentations({ ...completeSnapshot, face: null }, "zh");
  assert.equal(cards.face.recorded, false);
  assert.deepEqual(cards.face.points, ["今日面部拍照项", "眼周疲态变化值", "肤色水肿情况项", "面部状态备注项"]);
  assert.equal(allHealthModulesRecorded(cards), false);
  assert.equal(allHealthModulesComplete(cards), false);
});

test("diet progress uses four persisted meal slots and routes partial records back to entry", () => {
  const snapshot = {
    ...completeSnapshot,
    nutrition: {
      ...completeSnapshot.nutrition!,
      dinner_items: [],
      pantry_items: [],
    },
  };
  const progress = buildHealthModuleProgress(snapshot);
  const cards = buildHealthModulePresentations(snapshot, "zh");

  assert.deepEqual(progress.diet, {
    recorded: true,
    completed: false,
    completedUnits: 2,
    requiredUnits: 4,
    progress: 0.5,
  });
  assert.equal(cards.diet.recorded, true);
  assert.equal(cards.diet.completed, false);
  assert.equal(allHealthModulesRecorded(cards), true);
  assert.equal(allHealthModulesComplete(cards), false);
  assert.equal(healthModuleEntryView(progress.diet), "editor");
  assert.equal(healthModuleEntryView(progress.exercise), null);
});

test("mood completion requires both a cause and diary while focus requires a completed timed session", () => {
  const progress = buildHealthModuleProgress({
    ...completeSnapshot,
    mood: { ...completeSnapshot.mood!, factors: [], diary_content: "" },
    focusMinutes: 25,
    focusSessions: 0,
  });

  assert.equal(progress.mood.recorded, true);
  assert.equal(progress.mood.completed, false);
  assert.equal(progress.mood.progress, 0);
  assert.equal(progress.focus.recorded, true);
  assert.equal(progress.focus.completed, false);
  assert.equal(healthModuleEntryView(progress.focus), "editor");
});

test("an empty snapshot keeps the diet denominator at four without inventing progress", () => {
  const progress = buildHealthModuleProgress(null);
  const cards = buildHealthModulePresentations(null, "zh");

  assert.deepEqual(progress.diet, {
    recorded: false,
    completed: false,
    completedUnits: 0,
    requiredUnits: 4,
    progress: 0,
  });
  assert.equal(cards.diet.requiredUnits, 4);
  assert.equal(cards.diet.progress, 0);
  assert.equal(healthModuleEntryView(cards.diet), "editor");
  assert.deepEqual(cards.diet.points, ["今日三餐完成度", "饮水咖啡摄入量", "胃肠反应饱腹感", "酒精补剂记录项"]);
});

test("all empty Chinese cards restore their module dictionary and keep every line at seven characters", () => {
  for (const module of ["mood", "sleep", "exercise", "diet", "focus", "face"] as const) {
    const points = healthModuleDictionaryPoints(module, "zh");
    assert.equal(points.length, 4);
    points.forEach((point) => {
      assert.equal(Array.from(point).length, 7, `${module}: ${point}`);
      assert.match(point, /^\p{Script=Han}{7}$/u);
    });
  }
});

test("zero focus duration is missing rather than presented as a completed record", () => {
  const cards = buildHealthModulePresentations({ ...completeSnapshot, focusMinutes: 0, focusSessions: 0 }, "en");
  assert.equal(cards.focus.recorded, false);
  assert.equal(cards.focus.points[0], "Focus time");
});

test("period comparison averages recorded days and preserves a missing previous period", () => {
  assert.deepEqual(compareRecordedPeriodAverages([80, 90], [70, 80]), { currentAverage: 85, previousAverage: 75, change: 10 });
  assert.deepEqual(compareRecordedPeriodAverages([80, 90], []), { currentAverage: 85, previousAverage: null, change: null });
});
