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
  assert.deepEqual(buildContextualNotificationDrafts(emptySnapshot(), 12).map((item) => item.category), ["sleep", "focus", "nutrition"]);
  assert.deepEqual(buildContextualNotificationDrafts(emptySnapshot(), 21).map((item) => item.category), ["sleep", "focus", "nutrition", "mood", "exercise", "face"]);
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

test("trend reminders require persisted repeated evidence", () => {
  const snapshot = emptySnapshot();
  const trends = {
    moods: [
      { id: "m1", record_date: "2026-09-03", mood_score: 30, factors: ["压力"], diary_content: "有点累", ai_feedback: null },
      { id: "m2", record_date: "2026-09-04", mood_score: 35, factors: ["工作"], diary_content: "任务很多", ai_feedback: null },
      { id: "m3", record_date: "2026-09-05", mood_score: 40, factors: ["睡眠"], diary_content: "还没恢复", ai_feedback: null },
    ],
    sleeps: [
      { id: "s1", record_date: "2026-09-03", sleep_start: "01:10", sleep_end: "07:10", sleep_duration_minutes: 360, deep_sleep_minutes: null, light_sleep_minutes: null, rem_minutes: null, self_rating: null, rhythm_score: null, ai_feedback: null },
      { id: "s2", record_date: "2026-09-04", sleep_start: "01:25", sleep_end: "07:25", sleep_duration_minutes: 360, deep_sleep_minutes: null, light_sleep_minutes: null, rem_minutes: null, self_rating: null, rhythm_score: null, ai_feedback: null },
      { id: "s3", record_date: "2026-09-05", sleep_start: "01:35", sleep_end: "07:35", sleep_duration_minutes: 360, deep_sleep_minutes: null, light_sleep_minutes: null, rem_minutes: null, self_rating: null, rhythm_score: null, ai_feedback: null },
    ],
    exercises: [],
    nutritions: [],
    faces: [],
  };
  const ids = buildContextualNotificationDrafts(snapshot, 21, "zh", trends).map((item) => item.id);
  assert.ok(ids.includes(`context:${snapshot.date}:mood-trend`));
  assert.ok(ids.includes(`context:${snapshot.date}:sleep-late-trend`));
});

test("activity recommendation adapts to recorded recovery signals and personal load", () => {
  const snapshot = emptySnapshot();
  snapshot.sleep = { id: "s", record_date: snapshot.date, sleep_start: "01:00", sleep_end: "06:00", sleep_duration_minutes: 300, deep_sleep_minutes: null, light_sleep_minutes: null, rem_minutes: null, self_rating: null, rhythm_score: null, ai_feedback: null };
  const gentle = buildContextualNotificationDrafts(snapshot, 18).find((item) => item.id.endsWith(":exercise"));
  assert.equal(gentle?.title, "今天更适合轻量活动");

  snapshot.exercise = { id: "e4", record_date: snapshot.date, steps: 20_000, calories: 900, exercise_minutes: 120, heart_rate: null, spo2: null, self_rating: 3, ai_feedback: null };
  const trends = {
    moods: [], sleeps: [], nutritions: [], faces: [],
    exercises: [
      { ...snapshot.exercise, id: "e1", record_date: "2026-09-02", steps: 6_000, exercise_minutes: 30 },
      { ...snapshot.exercise, id: "e2", record_date: "2026-09-03", steps: 6_500, exercise_minutes: 32 },
      { ...snapshot.exercise, id: "e3", record_date: "2026-09-04", steps: 5_800, exercise_minutes: 28 },
      snapshot.exercise,
    ],
  };
  const overload = buildContextualNotificationDrafts(snapshot, 19, "zh", trends).find((item) => item.id.endsWith(":exercise-load"));
  assert.match(overload?.title ?? "", /个人近期水平/);
});

test("hydration, recovery, and cross-module reminders require saved evidence", () => {
  const snapshot = emptySnapshot();
  snapshot.nutrition = { id: "n", record_date: snapshot.date, total_calories: 600, lunch_time: "12:10", hydration_ml: 200, ai_feedback: null };
  snapshot.exercise = { id: "e", record_date: snapshot.date, steps: 7_000, calories: 260, exercise_minutes: 40, heart_rate: null, spo2: null, self_rating: 2, recovery_status: "not_recovered", ai_feedback: null };
  snapshot.sleep = { id: "s", record_date: snapshot.date, sleep_start: "01:00", sleep_end: "06:00", sleep_duration_minutes: 300, deep_sleep_minutes: null, light_sleep_minutes: null, rem_minutes: null, self_rating: null, rhythm_score: null, ai_feedback: null };
  snapshot.mood = { id: "m", record_date: snapshot.date, mood_score: 35, factors: ["疲劳"], diary_content: "还没恢复", ai_feedback: null };
  const trends = { moods: [snapshot.mood], sleeps: [snapshot.sleep], exercises: [snapshot.exercise], nutritions: [snapshot.nutrition], faces: [{ id: "f", record_date: "2026-09-02", image_path: null, overall_score: 45, skin_age: null, annotations: [], feedback: null, model_version: null }] };
  const drafts = buildContextualNotificationDrafts(snapshot, 21, "zh", trends);
  const ids = drafts.map((item) => item.id);
  assert.ok(ids.includes(`context:${snapshot.date}:exercise-recovery`));
  assert.ok(ids.includes(`context:${snapshot.date}:cross-state`));
  assert.ok(ids.includes(`context:${snapshot.date}:hydration`));
});
