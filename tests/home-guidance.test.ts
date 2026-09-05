import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeGuidance, homeDayPhase } from "../src/services/homeExperience.ts";
import type { TodaySnapshot } from "../src/types.ts";

function snapshot(): TodaySnapshot {
  return {
    date: "2026-09-05",
    mood: { id: "m", record_date: "2026-09-05", mood_score: 82, factors: ["工作"], diary_content: "今天状态稳定。", ai_feedback: null },
    sleep: { id: "s", record_date: "2026-09-05", sleep_start: "23:00", sleep_end: "07:00", sleep_duration_minutes: 480, deep_sleep_minutes: 90, light_sleep_minutes: 300, rem_minutes: 90, self_rating: 4, rhythm_score: 85, ai_feedback: null },
    exercise: { id: "e", record_date: "2026-09-05", steps: 6_000, calories: 280, exercise_minutes: 35, heart_rate: null, spo2: null, self_rating: 4, ai_feedback: null },
    nutrition: { id: "n", record_date: "2026-09-05", total_calories: 1_700, ai_feedback: null },
    face: { id: "f", record_date: "2026-09-05", image_path: null, overall_score: 80, skin_age: null, annotations: [], feedback: null, model_version: null },
    focusMinutes: 50,
    focusSessions: 2,
    rhythmScore: 82,
    rhythmAnomalyCount: 0,
    nextAction: "今晚提前半小时放松。",
  };
}

test("home phase follows the device-local hour boundaries", () => {
  assert.equal(homeDayPhase(5), "dawn");
  assert.equal(homeDayPhase(9), "day");
  assert.equal(homeDayPhase(17), "evening");
  assert.equal(homeDayPhase(21), "night");
  assert.equal(homeDayPhase(2), "night");
});

test("recorded short sleep has priority and selects the sleep motion", () => {
  const current = snapshot();
  current.sleep = { ...current.sleep!, sleep_duration_minutes: 330 };
  current.exercise = { ...current.exercise!, steps: 1_000 };
  current.rhythmAnomalyCount = 2;
  const guidance = buildHomeGuidance(current, 18, "zh");
  assert.equal(guidance.reason, "sleep_low");
  assert.equal(guidance.motion, "sleep");
  assert.match(guidance.message, /5 小时 30 分/);
});

test("persisted ChronoState action outranks lower-priority activity guidance", () => {
  const current = snapshot();
  current.exercise = { ...current.exercise!, steps: 900 };
  current.rhythmAnomalyCount = 1;
  current.nextAction = "今晚减少连续屏幕刺激。";
  const guidance = buildHomeGuidance(current, 19, "zh");
  assert.equal(guidance.reason, "rhythm_signal");
  assert.equal(guidance.message, current.nextAction);
  assert.equal(guidance.motion, "tail");
});

test("low evening activity and completed focus map to distinct motions", () => {
  const lowActivity = snapshot();
  lowActivity.exercise = { ...lowActivity.exercise!, steps: 1_200 };
  lowActivity.focusMinutes = 0;
  assert.equal(buildHomeGuidance(lowActivity, 18, "zh").motion, "lift");
  assert.equal(buildHomeGuidance(snapshot(), 13, "zh").motion, "wave");
});

test("home always exposes two or three real destinations without duplicates", () => {
  const current = snapshot();
  const completeActions = buildHomeGuidance(current, 13, "zh").actions;
  assert.deepEqual(completeActions.map((action) => action.id), ["report", "ai"]);

  current.sleep = null;
  current.nutrition = null;
  current.focusMinutes = 0;
  current.focusSessions = 0;
  const missingActions = buildHomeGuidance(current, 20, "zh").actions;
  assert.equal(missingActions.length, 3);
  assert.equal(new Set(missingActions.map((action) => action.id)).size, missingActions.length);
  assert.deepEqual(missingActions.map((action) => action.id), ["sleep", "focus", "diet"]);
});
