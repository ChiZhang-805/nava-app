import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateWeeklyModuleScores } from "../src/services/weeklyModuleScores.ts";
import { naturalWeekDateRange } from "../src/services/date.ts";
import type { TrendBundle } from "../src/types.ts";

const recordsScreen = readFileSync(new URL("../src/features/RecordsScreen.tsx", import.meta.url), "utf8");
const reportFunction = readFileSync(new URL("../supabase/functions/ai-health-report/index.ts", import.meta.url), "utf8");

test("weekly report periods follow the local Monday-to-Sunday natural week", () => {
  assert.deepEqual(naturalWeekDateRange(new Date("2026-09-02T12:00:00")), {
    startDate: "2026-08-31",
    endDate: "2026-09-06",
  });
  assert.deepEqual(naturalWeekDateRange(new Date("2026-09-06T12:00:00")), {
    startDate: "2026-08-31",
    endDate: "2026-09-06",
  });
});

test("weekly insight UI loads the authenticated cloud AI report", () => {
  assert.match(recordsScreen, /loadHealthAiReport\(\{ scope: "weekly"/);
  assert.doesNotMatch(recordsScreen, /buildWeeklyInsights/);
});

test("weekly AI report is persisted and rejects non-model providers", () => {
  assert.match(reportFunction, /from\("ai_health_reports"\)\.upsert/);
  assert.match(reportFunction, /row\.provider !== "deepseek"/);
  assert.match(reportFunction, /bullets\.length !== 4/);
});

test("weekly radar averages only recorded days and returns zero only for a wholly missing dimension", () => {
  const bundle: TrendBundle = {
    moods: [
      { id: "m1", record_date: "2026-08-24", mood_score: 80, factors: [], diary_content: null, ai_feedback: null },
      { id: "m2", record_date: "2026-08-26", mood_score: 60, factors: [], diary_content: null, ai_feedback: null },
    ],
    sleeps: [
      { id: "s1", record_date: "2026-08-24", sleep_start: null, sleep_end: null, sleep_duration_minutes: null, deep_sleep_minutes: null, light_sleep_minutes: null, rem_minutes: null, self_rating: null, rhythm_score: 80, ai_feedback: null },
      { id: "s2", record_date: "2026-08-26", sleep_start: null, sleep_end: null, sleep_duration_minutes: null, deep_sleep_minutes: null, light_sleep_minutes: null, rem_minutes: null, self_rating: null, rhythm_score: 60, ai_feedback: null },
    ],
    exercises: [
      { id: "e1", record_date: "2026-08-24", steps: 8000, calories: null, exercise_minutes: null, heart_rate: null, spo2: null, self_rating: null, ai_feedback: null },
      { id: "e2", record_date: "2026-08-26", steps: 4000, calories: null, exercise_minutes: null, heart_rate: null, spo2: null, self_rating: null, ai_feedback: null },
    ],
    nutritions: [
      { id: "n1", record_date: "2026-08-24", total_calories: 1800, health_rating: 4, ai_feedback: null },
      { id: "n2", record_date: "2026-08-26", total_calories: 1800, health_rating: 5, ai_feedback: null },
    ],
    faces: [
      { id: "f1", record_date: "2026-08-24", image_path: null, overall_score: 90, skin_age: null, annotations: [], feedback: null, model_version: null },
      { id: "f2", record_date: "2026-08-26", image_path: null, overall_score: 70, skin_age: null, annotations: [], feedback: null, model_version: null },
    ],
    focus: [], focusDistributions: [], healthMetrics: [], rhythms: [],
  };
  const scores = Object.fromEntries(calculateWeeklyModuleScores(bundle, "2026-08-24", "2026-08-30").map((item) => [item.key, item]));
  assert.deepEqual(scores.mood, { key: "mood", value: 70, recordedDays: 2 });
  assert.deepEqual(scores.sleep, { key: "sleep", value: 70, recordedDays: 2 });
  assert.deepEqual(scores.exercise, { key: "exercise", value: 75, recordedDays: 2 });
  assert.deepEqual(scores.nutrition, { key: "nutrition", value: 90, recordedDays: 2 });
  assert.deepEqual(scores.face, { key: "face", value: 80, recordedDays: 2 });
  assert.deepEqual(scores.focus, { key: "focus", value: 0, recordedDays: 0 });
});

test("weekly focus score aggregates sessions by day before averaging the week", () => {
  const bundle = {
    moods: [], sleeps: [], exercises: [], nutritions: [], faces: [], focusDistributions: [], healthMetrics: [], rhythms: [],
    focus: [
      { id: "a", task_id: "1", record_date: "2026-08-24", completed_sessions: 1, total_minutes: 60 },
      { id: "b", task_id: "2", record_date: "2026-08-24", completed_sessions: 1, total_minutes: 60 },
      { id: "c", task_id: "3", record_date: "2026-08-26", completed_sessions: 1, total_minutes: 60 },
    ],
  } satisfies TrendBundle;
  const focus = calculateWeeklyModuleScores(bundle, "2026-08-24", "2026-08-30").find((item) => item.key === "focus");
  assert.deepEqual(focus, { key: "focus", value: 75, recordedDays: 2 });
});
