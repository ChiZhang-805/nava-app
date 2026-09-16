import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyCoverage,
  buildMonthCells,
  buildYearHeatmap,
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

test("builds only the required whole weeks and crosses year boundaries", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(monthEndISO("2028-02"), "2028-02-29");
  const august = buildMonthCells("2026-08");
  assert.equal(august.length, 42);
  assert.equal(august.find((cell) => cell.day === 1)?.date, "2026-08-01");
  assert.equal(august.find((cell) => cell.day === 31)?.date, "2026-08-31");
  assert.equal(buildMonthCells("2026-09").length, 35);
  assert.equal(buildMonthCells("2027-02").length, 28);
  assert.equal(buildMonthCells("2028-02").filter((cell) => cell.date).length, 29);
});

test("variable month grids preserve every date and weekday without empty trailing weeks", () => {
  for (let year = 2020; year <= 2040; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const days = new Date(year, month, 0).getDate();
      for (const mondayFirst of [true, false]) {
        const cells = buildMonthCells(monthKey, mondayFirst);
        assert.ok([28, 35, 42].includes(cells.length));
        assert.equal(cells.filter((cell) => cell.date).length, days);
        assert.ok(cells.slice(-7).some((cell) => cell.date));
        cells.forEach((cell, index) => {
          if (!cell.day) return;
          const weekday = new Date(year, month - 1, cell.day).getDay();
          assert.equal(index % 7, mondayFirst ? (weekday + 6) % 7 : weekday);
          assert.equal(cell.date, `${monthKey}-${String(cell.day).padStart(2, "0")}`);
        });
        assert.deepEqual(cells.filter((cell) => cell.day).map((cell) => cell.day), Array.from({ length: days }, (_, i) => i + 1));
      }
    }
  }
});

test("annual heatmap contains every day once in Monday-first week columns", () => {
  const regular = buildYearHeatmap(2026);
  const leap = buildYearHeatmap(2028);
  assert.equal(regular.monthLabels.length, 12);
  assert.equal(regular.weeks.every((week) => week.length === 7), true);
  assert.equal(regular.weeks.flat().filter((cell) => cell.inYear).length, 365);
  assert.equal(leap.weeks.flat().filter((cell) => cell.inYear).length, 366);
  assert.equal(regular.weeks.flat().filter((cell) => cell.date === "2026-01-01").length, 1);
  assert.equal(regular.weeks.flat().filter((cell) => cell.date === "2026-12-31").length, 1);
  assert.equal(new Date(`${regular.weeks[0][0].date}T00:00:00Z`).getUTCDay(), 1);
  assert.equal(regular.monthLabels.every((label, index, labels) => index === 0 || label.weekIndex > labels[index - 1].weekIndex), true);
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
