import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeWidgetPresentation, defaultHomeWidgetIds, moveHomeWidget, shiftHomeWidget } from "../src/services/homeWidgets.ts";
import type { TodaySnapshot, TrendBundle } from "../src/types.ts";

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

test("the default home uses the fixed five-widget product order and leaves face optional", () => {
  const expected = ["sleep", "focus", "exercise", "mood", "diet"];
  assert.deepEqual(defaultHomeWidgetIds(), expected);
});

test("widget order supports direct drag moves and accessible single-step moves", () => {
  assert.deepEqual(moveHomeWidget(["sleep", "focus", "mood"], "sleep", "mood"), ["focus", "mood", "sleep"]);
  assert.deepEqual(shiftHomeWidget(["sleep", "focus", "mood"], "focus", -1), ["focus", "sleep", "mood"]);
});

test("widget presentation exposes only a core result and one real-data support line", () => {
  assert.deepEqual(buildHomeWidgetPresentation("focus", snapshot, "zh"), { id: "focus", core: "42m", support: "2 次完成", state: "ready" });
  assert.equal(buildHomeWidgetPresentation("sleep", snapshot, "zh").state, "attention");
  assert.equal(buildHomeWidgetPresentation("mood", snapshot, "zh").state, "missing");
});

test("widget presentation uses real prior recorded days for a compact seven-day comparison", () => {
  const trendSnapshot: TodaySnapshot = { ...snapshot, exercise: { ...snapshot.exercise!, steps: 6_000 } };
  const trends: TrendBundle = {
    moods: [], sleeps: [], nutritions: [], faces: [], focus: [], focusDistributions: [], healthMetrics: [], rhythms: [],
    exercises: [
      { ...trendSnapshot.exercise!, id: "e1", record_date: "2026-09-03", steps: 4_000 },
      { ...trendSnapshot.exercise!, id: "e2", record_date: "2026-09-04", steps: 4_000 },
    ],
  };
  assert.equal(buildHomeWidgetPresentation("exercise", trendSnapshot, "zh", trends).support, "较近7日 +50%");
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
