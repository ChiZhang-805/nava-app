import assert from "node:assert/strict";
import test from "node:test";
import {
  addHomeWidgetToSlot,
  buildHomeWidgetPresentation,
  defaultHomeWidgetIds,
  defaultHomeWidgetLayout,
  homeWidgetIds,
  homeWidgetIdsFromLayout,
  moveHomeWidget,
  moveHomeWidgetByDirection,
  normalizeHomeWidgetLayout,
  placeHomeWidgetInSlot,
  removeHomeWidgetFromSlot,
  shiftHomeWidget,
} from "../src/services/homeWidgets.ts";
import type { FaceRecord, TodaySnapshot, TrendBundle } from "../src/types.ts";
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

test("the home exposes exactly the six health modules and no duplicate steps card", () => {
  const expected = ["mood", "sleep", "exercise", "diet", "face", "focus"];
  assert.deepEqual(homeWidgetIds, expected);
  assert.deepEqual(defaultHomeWidgetIds(), expected);
});

test("widget order supports direct drag moves and accessible single-step moves", () => {
  assert.deepEqual(moveHomeWidget(["sleep", "focus", "mood"], "sleep", "mood"), ["focus", "mood", "sleep"]);
  assert.deepEqual(shiftHomeWidget(["sleep", "focus", "mood"], "focus", -1), ["focus", "sleep", "mood"]);
});

test("the home exposes six persistent slots and rejects retired heart and steps widgets", () => {
  assert.deepEqual(defaultHomeWidgetLayout(), ["mood", "sleep", "exercise", "diet", "face", "focus"]);
  assert.deepEqual(normalizeHomeWidgetLayout(["heart", null, "sleep", "sleep", "steps"]), [null, null, "sleep", null, null, null]);
  assert.deepEqual(homeWidgetIdsFromLayout(["mood", null, "sleep", null, null, null]), ["mood", "sleep"]);
});

test("inline editing removes and restores modules without creating duplicates", () => {
  const initial = defaultHomeWidgetLayout();
  const removed = removeHomeWidgetFromSlot(initial, 3);
  assert.deepEqual(removed, ["mood", "sleep", "exercise", null, "face", "focus"]);
  assert.deepEqual(addHomeWidgetToSlot(removed, "diet", 3), initial);
  assert.deepEqual(addHomeWidgetToSlot(removed, "mood", 3), removed);
  assert.deepEqual(placeHomeWidgetInSlot(initial, "mood", 4), ["face", "sleep", "exercise", "diet", "mood", "focus"]);
});

test("keyboard movement follows the visual two-by-three slot grid", () => {
  const initial = defaultHomeWidgetLayout();
  assert.deepEqual(moveHomeWidgetByDirection(initial, "mood", "right"), ["face", "sleep", "exercise", "diet", "mood", "focus"]);
  assert.deepEqual(moveHomeWidgetByDirection(initial, "sleep", "up"), ["sleep", "mood", "exercise", "diet", "face", "focus"]);
  assert.deepEqual(moveHomeWidgetByDirection(initial, "mood", "up"), initial);
});

test("widget presentation exposes only a core result and one real-data support line", () => {
  assert.deepEqual(buildHomeWidgetPresentation("focus", snapshot, "zh"), { id: "focus", core: "42m", support: "2 次完成", state: "ready" });
  assert.equal(buildHomeWidgetPresentation("sleep", snapshot, "zh").state, "attention");
  assert.equal(buildHomeWidgetPresentation("mood", snapshot, "zh").state, "missing");
});

test("sleep and exercise widgets keep compact unit labels", () => {
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
