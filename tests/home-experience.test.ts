import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyCoverage,
  buildMonthCells,
  dailyMetrics,
  homeSwipeThreshold,
  isVerticalHomeSwipe,
  monthEndISO,
  shiftMonth,
} from "../src/services/homeExperience.ts";
import type { TodaySnapshot, TrendBundle } from "../src/types.ts";

const emptyTrends = (): TrendBundle => ({
  moods: [], sleeps: [], exercises: [], nutritions: [], faces: [], focus: [],
  focusDistributions: [], healthMetrics: [], rhythms: [],
});

test("uses a one-sixth screen swipe with practical minimum and maximum distances", () => {
  assert.equal(homeSwipeThreshold(400), 88);
  assert.equal(homeSwipeThreshold(600), 100);
  assert.equal(homeSwipeThreshold(844), 141);
  assert.equal(homeSwipeThreshold(1_200), 144);
  assert.equal(isVerticalHomeSwipe(180, 700, 190, 545, 844, "up"), true);
  assert.equal(isVerticalHomeSwipe(180, 700, 300, 580, 844, "up"), false);
  assert.equal(isVerticalHomeSwipe(180, 400, 170, 550, 844, "down"), true);
});

test("builds a stable six-week month grid and crosses year boundaries", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(monthEndISO("2028-02"), "2028-02-29");
  const august = buildMonthCells("2026-08");
  assert.equal(august.length, 42);
  assert.equal(august.find((cell) => cell.day === 1)?.date, "2026-08-01");
  assert.equal(august.find((cell) => cell.day === 31)?.date, "2026-08-31");
});

test("coverage is derived only from recorded categories", () => {
  const trends = emptyTrends();
  trends.moods.push({ id: "m", record_date: "2026-08-29", mood_score: 82, factors: [], diary_content: null, ai_feedback: null });
  trends.focus.push({ id: "f", task_id: "t", record_date: "2026-08-29", completed_sessions: 2, total_minutes: 50 });
  assert.deepEqual(buildDailyCoverage(trends)["2026-08-29"].sort(), ["focus", "mood"]);
});

test("daily metric cards calculate from the selected day's real snapshot", () => {
  const snapshot: TodaySnapshot = {
    date: "2026-08-29",
    mood: null,
    sleep: null,
    exercise: { id: "e", record_date: "2026-08-29", steps: 8_000, exercise_minutes: 30, calories: 260, heart_rate: null, spo2: null, self_rating: null, ai_feedback: null },
    nutrition: null,
    face: null,
    focusMinutes: 30,
    focusSessions: 2,
    rhythmScore: 84,
    nextAction: "保持今天的节律。",
  };
  const metrics = dailyMetrics(snapshot);
  assert.equal(metrics.find((item) => item.key === "exercise")?.score, 100);
  assert.equal(metrics.find((item) => item.key === "focus")?.score, 50);
  assert.equal(metrics.find((item) => item.key === "mood")?.score, null);
});
