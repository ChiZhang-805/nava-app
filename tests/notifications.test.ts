import assert from "node:assert/strict";
import test from "node:test";
import { buildContextualNotificationDrafts } from "../src/services/notificationPlanner.ts";
import type { TodaySnapshot } from "../src/types.ts";

function emptySnapshot(): TodaySnapshot {
  return {
    date: "2026-09-05",
    mood: null,
    sleep: null,
    exercise: null,
    nutrition: null,
    face: null,
    focusMinutes: 0,
    focusSessions: 0,
    rhythmScore: null,
    nextAction: "",
  };
}

test("contextual reminders are gated by local time and real missing records", () => {
  assert.deepEqual(buildContextualNotificationDrafts(emptySnapshot(), 8).map((item) => item.category), []);
  assert.deepEqual(buildContextualNotificationDrafts(emptySnapshot(), 12).map((item) => item.category), ["nutrition", "focus", "sleep"]);
  assert.deepEqual(buildContextualNotificationDrafts(emptySnapshot(), 21).map((item) => item.category), ["face", "mood", "exercise", "nutrition"]);
});

test("recorded modules do not produce missing-record reminders", () => {
  const snapshot = emptySnapshot();
  snapshot.sleep = { id: "s", record_date: snapshot.date, sleep_start: "23:00", sleep_end: "07:00", sleep_duration_minutes: 480, deep_sleep_minutes: 90, light_sleep_minutes: 300, rem_minutes: 90, self_rating: 4, rhythm_score: 85, ai_feedback: null };
  snapshot.nutrition = { id: "n", record_date: snapshot.date, total_calories: 1_700, ai_feedback: null };
  snapshot.exercise = { id: "e", record_date: snapshot.date, steps: 6_000, calories: 280, exercise_minutes: 35, heart_rate: null, spo2: null, self_rating: 4, ai_feedback: null };
  snapshot.mood = { id: "m", record_date: snapshot.date, mood_score: 82, factors: ["工作"], diary_content: "今天状态稳定。", ai_feedback: null };
  snapshot.face = { id: "f", record_date: snapshot.date, image_path: null, overall_score: 80, skin_age: null, annotations: [], feedback: null, model_version: null };
  snapshot.focusMinutes = 50;
  assert.deepEqual(buildContextualNotificationDrafts(snapshot, 22), []);
});

test("anomaly reminder uses the persisted ChronoState action without diagnosing", () => {
  const snapshot = emptySnapshot();
  snapshot.rhythmAnomalyCount = 2;
  snapshot.nextAction = "今晚提前半小时放松。";
  const draft = buildContextualNotificationDrafts(snapshot, 11).find((item) => item.id.endsWith(":rhythm"));
  assert.equal(draft?.body, snapshot.nextAction);
  assert.equal(draft?.title, "今天有一项状态值得留意");
});
