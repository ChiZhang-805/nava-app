import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomeWidgetPresentation,
  defaultHomeWidgetIds,
  defaultHomeWidgetLayout,
  homeWidgetIdsFromLayout,
  moveHomeWidget,
  moveHomeWidgetByDirection,
  normalizeHomeWidgetLayout,
  placeHomeWidgetInSlot,
  shiftHomeWidget,
} from "../src/services/homeWidgets.ts";
import type { FaceRecord, HealthMetricSnapshot, TodaySnapshot, TrendBundle } from "../src/types.ts";
import { previousComparableFace, sameModeFaces } from "../src/services/faceComparison.ts";

const snapshot: TodaySnapshot = {
  date: "2026-09-05",
  mood: null,
  sleep: { id: "s", record_date: "2026-09-05", sleep_start: "23:30", sleep_end: "05:00", sleep_duration_minutes: 330, deep_sleep_minutes: 60, light_sleep_minutes: 210, rem_minutes: 60, self_rating: 2, rhythm_score: 55, ai_feedback: null },
  exercise: { id: "e", record_date: "2026-09-05", steps: 2800, calories: 120, exercise_minutes: 18, heart_rate: null, spo2: null, self_rating: 3, ai_feedback: null },
  nutrition: null,
  face: null,
  focusMinutes: 42,
  focusSessions: 2,
  rhythmScore: 62,
  nextAction: "今晚早点休息。",
};

test("the default home follows the four-card Figma metric order", () => {
  const expected = ["heart", "sleep", "exercise", "steps"];
  assert.deepEqual(defaultHomeWidgetIds(), expected);
});

test("widget order supports direct drag moves and accessible single-step moves", () => {
  assert.deepEqual(moveHomeWidget(["sleep", "focus", "mood"], "sleep", "mood"), ["focus", "mood", "sleep"]);
  assert.deepEqual(shiftHomeWidget(["sleep", "focus", "mood"], "focus", -1), ["focus", "sleep", "mood"]);
});

test("the home exposes six persistent slots while keeping the four-card reference layout", () => {
  assert.deepEqual(defaultHomeWidgetLayout(), ["heart", "sleep", "exercise", "steps", null, null]);
  assert.deepEqual(normalizeHomeWidgetLayout(["heart", null, "sleep", "sleep", "bogus"]), ["heart", null, "sleep", null, null, null]);
  assert.deepEqual(homeWidgetIdsFromLayout(["heart", null, "sleep", null, null, null]), ["heart", "sleep"]);
});

test("placing a widget uses empty slots and swaps occupied slots without losing data", () => {
  const initial = defaultHomeWidgetLayout();
  assert.deepEqual(placeHomeWidgetInSlot(initial, "heart", 4), [null, "sleep", "exercise", "steps", "heart", null]);
  assert.deepEqual(placeHomeWidgetInSlot(initial, "heart", 2), ["exercise", "sleep", "heart", "steps", null, null]);
  assert.deepEqual(homeWidgetIdsFromLayout(placeHomeWidgetInSlot(initial, "heart", 2)).sort(), defaultHomeWidgetIds().sort());
});

test("keyboard movement follows the visual two-by-three slot grid", () => {
  const initial = defaultHomeWidgetLayout();
  assert.deepEqual(moveHomeWidgetByDirection(initial, "heart", "right"), [null, "sleep", "exercise", "steps", "heart", null]);
  assert.deepEqual(moveHomeWidgetByDirection(initial, "sleep", "up"), ["sleep", "heart", "exercise", "steps", null, null]);
  assert.deepEqual(moveHomeWidgetByDirection(initial, "heart", "up"), initial);
});

test("widget presentation exposes only a core result and one real-data support line", () => {
  assert.deepEqual(buildHomeWidgetPresentation("focus", snapshot, "zh"), { id: "focus", core: "42m", support: "2 次完成", state: "ready" });
  assert.equal(buildHomeWidgetPresentation("sleep", snapshot, "zh").state, "attention");
  assert.equal(buildHomeWidgetPresentation("mood", snapshot, "zh").state, "missing");
  assert.equal(buildHomeWidgetPresentation("heart", snapshot, "zh").state, "missing");
});

test("historical heart rate is dated, sorted and never taken from a future or empty row", () => {
  const metrics = [
    { record_date: "2026-09-03", latest_heart_rate: 65 },
    { record_date: "2026-09-06", latest_heart_rate: 99 },
    { record_date: "2026-09-04", latest_heart_rate: 72 },
    { record_date: "2026-09-05", latest_heart_rate: null, resting_heart_rate: null },
  ] as HealthMetricSnapshot[];
  const trends = { healthMetrics: metrics } as TrendBundle;
  assert.equal(buildHomeWidgetPresentation("heart", snapshot, "zh", trends).core, "72");
  assert.equal(buildHomeWidgetPresentation("heart", snapshot, "zh", trends).support, "9/4 · 次/分");
  assert.equal(buildHomeWidgetPresentation("heart", snapshot, "en", trends).support, "9/4 · bpm");
  const today = { ...snapshot, exercise: { ...snapshot.exercise!, heart_rate: "81" } };
  assert.equal(buildHomeWidgetPresentation("heart", today, "zh", trends).core, "81");
  assert.equal(buildHomeWidgetPresentation("heart", today, "zh", trends).support, "次/分");
  assert.equal(buildHomeWidgetPresentation("heart", snapshot, "en", { healthMetrics: [{ record_date: "2025-12-31", resting_heart_rate: 60 }] } as TrendBundle).support, "2025-12-31 · bpm");
});

test("the four visual-reference metrics keep compact unit labels", () => {
  const trendSnapshot: TodaySnapshot = { ...snapshot, exercise: { ...snapshot.exercise!, steps: 6_000 } };
  const trends: TrendBundle = {
    moods: [], sleeps: [], nutritions: [], faces: [], focus: [], focusDistributions: [], healthMetrics: [], rhythms: [],
    exercises: [
      { ...trendSnapshot.exercise!, id: "e1", record_date: "2026-09-03", steps: 4_000 },
      { ...trendSnapshot.exercise!, id: "e2", record_date: "2026-09-04", steps: 4_000 },
    ],
  };
  assert.equal(buildHomeWidgetPresentation("sleep", trendSnapshot, "zh", trends).support, "小时 30 分");
  assert.equal(buildHomeWidgetPresentation("exercise", trendSnapshot, "zh", trends).support, "分钟");
  assert.equal(buildHomeWidgetPresentation("steps", trendSnapshot, "zh", trends).support, "步");
});

test("focus comparison sums multiple sessions within each recorded day", () => {
  const trendSnapshot: TodaySnapshot = { ...snapshot, focusMinutes: 90, focusSessions: 2 };
  const trends: TrendBundle = {
    moods: [], sleeps: [], exercises: [], nutritions: [], faces: [], focusDistributions: [], healthMetrics: [], rhythms: [],
    focus: [
      { id: "f1", task_id: "a", record_date: "2026-09-03", completed_sessions: 1, total_minutes: 30 },
      { id: "f2", task_id: "b", record_date: "2026-09-03", completed_sessions: 1, total_minutes: 30 },
      { id: "f3", task_id: "c", record_date: "2026-09-04", completed_sessions: 2, total_minutes: 60 },
    ],
  };
  assert.equal(buildHomeWidgetPresentation("focus", trendSnapshot, "zh", trends).support, "较近7日 +50%");
});

test("face comparison and home delta use earlier same-mode scores, never future or unknown mode", () => {
  const faces = [
    { id: "old-bare", record_date: "2026-09-01", capture_mode: "bare_face", overall_score: 60 },
    { id: "prior-bare", record_date: "2026-09-02", capture_mode: "bare_face", overall_score: 60 },
    { id: "recent-makeup", record_date: "2026-09-04", capture_mode: "makeup", overall_score: 100 },
    { id: "future-bare", record_date: "2026-09-06", capture_mode: "bare_face", overall_score: 99 },
  ] as FaceRecord[];
  const current = { id: "current", record_date: snapshot.date, capture_mode: "bare_face", overall_score: 72 } as FaceRecord;
  assert.equal(previousComparableFace(faces, current)?.id, "prior-bare");
  assert.equal(previousComparableFace(faces, { ...current, capture_mode: undefined }), null);
  assert.equal(sameModeFaces(faces, undefined, snapshot.date).length, 0);
  assert.equal(buildHomeWidgetPresentation("face", { ...snapshot, face: current }, "zh", { faces } as TrendBundle).support, "较近7日 +20%");
});
