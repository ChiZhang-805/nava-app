import assert from "node:assert/strict";
import test from "node:test";
import { buildHealthReportCharts } from "../src/services/healthReportExplorer.ts";
import type { HealthReportChart } from "../src/services/healthReportExplorer.ts";
import type { TrendBundle, FocusRecord, NutritionRecord, MoodRecord, HealthMetricSnapshot } from "../src/types.ts";
import type { JournalRecord } from "../src/services/journal.ts";

const date = "2026-11-20";
const bundle = (patch: Partial<TrendBundle> = {}): TrendBundle => ({ moods: [], sleeps: [], exercises: [], nutritions: [], faces: [], focus: [], focusDistributions: [], healthMetrics: [], rhythms: [], ...patch });
const journal = (id: string, category: JournalRecord["category"], data: Record<string, unknown>, recordDate = date, focus?: Record<string, unknown>): JournalRecord => ({ id, category, data, recordDate, createdAt: `${recordDate}T12:00:00Z`, focus });
const latest = (charts: HealthReportChart[], id: string) => charts.find(chart => chart.id === id)!.points.at(-1)!;

test("empty data keeps six categories but no invented numbers or heart category", () => {
  const charts = buildHealthReportCharts(null, date, "zh");
  for (const category of ["mood", "face", "focus", "sleep", "exercise", "diet"] as const) {
    assert.ok(charts[category].length);
    assert.ok(charts[category].every(chart => chart.points.length === 7 && chart.points.every(point => point.missing)));
  }
  assert.deepEqual(charts.heart, []);
});

test("new journal records are visible and explicit zero is distinct from absent or partial amounts", () => {
  const charts = buildHealthReportCharts(bundle({ journal: [
    journal("1", "food", { foods: "茶", calories: 0, protein: "" }),
    journal("2", "food", { foods: "午饭", calories: "520", protein: "30" }),
    journal("3", "food", { foods: "未估算的一餐" }),
    journal("4", "sport", { activity: "散步", durationMinutes: 20, steps: 0 }),
  ] }), date, "zh");
  assert.equal(latest(charts.diet, "diet-energy").value, 520);
  assert.equal(latest(charts.diet, "diet-protein").value, 30);
  assert.equal(latest(charts.exercise, "exercise-steps").missing, false);
  assert.equal(latest(charts.exercise, "exercise-steps").value, 0);
  assert.equal(latest(charts.diet, "diet-water").missing, true);
});

test("legacy daily aggregates are not added to journal entries or used to fill omitted fields", () => {
  const charts = buildHealthReportCharts(bundle({ journal: [journal("1", "food", { foods: "午饭", calories: 520 })], nutritions: [{ id: "old", record_date: date, total_calories: 520, protein_grams: 40 }] as NutritionRecord[] }), date, "en");
  assert.equal(latest(charts.diet, "diet-energy").value, 520);
  assert.equal(latest(charts.diet, "diet-protein").missing, true);
});

test("focus uses saved elapsed time and preserves older session totals without planned-time substitution", () => {
  const charts = buildHealthReportCharts(bundle({ journal: [
    journal("1", "focus", { task: "阅读", durationMinutes: 60 }, date, { elapsedMs: 600000, plannedMs: 3600000 }),
    journal("2", "focus", { task: "复习", durationMinutes: 30 }),
  ] }), date, "zh");
  assert.equal(latest(charts.focus, "focus-minutes").value, 10);
  assert.equal(latest(charts.focus, "focus-sessions").value, 2);
  const unknown = buildHealthReportCharts(bundle({ journal: [journal("1", "focus", { durationMinutes: 60 })] }), date, "zh");
  assert.equal(latest(unknown.focus, "focus-minutes").missing, true);
  const legacy = buildHealthReportCharts(bundle({ focus: [{ record_date: date, total_minutes: 25, completed_sessions: 1 }, { record_date: date, total_minutes: 15, completed_sessions: 1 }] as FocusRecord[] }), date, "zh");
  assert.equal(latest(legacy.focus, "focus-minutes").value, 40);
  assert.equal(latest(legacy.focus, "focus-sessions").value, 2);
});

test("overlapping sleep intervals merge rather than double-counting a night", () => {
  const charts = buildHealthReportCharts(bundle({ journal: [
    journal("1", "sleep", { bedtime: "23:00", wakeTime: "07:00" }),
    journal("2", "sleep", { bedtime: "00:00", wakeTime: "06:00" }),
    journal("3", "sleep", { bedtime: "13:00", wakeTime: "14:00" }),
  ] }), date, "zh");
  assert.equal(latest(charts.sleep, "sleep-hours").value, 9);
  assert.equal(charts.sleep.length, 1, "no invented sleep stages");
});

test("old ISO sleep timestamps retain actual dates and offsets", () => {
  const charts = buildHealthReportCharts(bundle({ journal: [journal("1", "sleep", { bedtime: "2026-11-19T22:00:00+08:00", wakeTime: "2026-11-20T06:30:00+08:00" })] }), date, "en");
  assert.equal(latest(charts.sleep, "sleep-hours").value, 8.5);
});

test("mood intensity is not inferred from prose or mixed with the older 100-point rating", () => {
  const charts = buildHealthReportCharts(bundle({ journal: [journal("1", "mood", { mood: "很开心", intensity: 8 })], moods: [{ record_date: date, mood_score: 80 }] as MoodRecord[] }), date, "zh");
  assert.equal(latest(charts.mood, "mood-intensity").value, 8);
  assert.equal(latest(charts.mood, "mood-legacy-rating").value, 80);
  const unscored = buildHealthReportCharts(bundle({ journal: [journal("1", "mood", { mood: "难过" })] }), date, "zh");
  assert.equal(latest(unscored.mood, "mood-intensity").missing, true);
});

test("heart charts require usable Apple-source data within the displayed period", () => {
  const metric = (source: string, value: number | null, day = date) => ({ id: "1", record_date: day, source, latest_heart_rate: value, resting_heart_rate: null, heart_rate_variability_sdnn: null, blood_oxygen: null } as HealthMetricSnapshot);
  for (const records of [[metric("manual", 70)], [metric("unknown", 70)], [metric("apple_health", 0)], [metric("apple_health", 70, "2026-11-21")], [metric("apple_health", 70, "2026-11-01")]]) {
    assert.deepEqual(buildHealthReportCharts(bundle({ healthMetrics: records }), date, "en").heart, []);
  }
  const charts = buildHealthReportCharts(bundle({ healthMetrics: [metric("apple_health", 72)] }), date, "zh");
  assert.equal(charts.heart.length, 1);
  assert.equal(charts.heart[0].points.at(-1)!.value, 72);
});

test("date windows cross months, omit future records and deduplicate journal IDs", () => {
  const row = journal("same", "face", { feeling: "精神不错" }, "2026-12-01");
  const charts = buildHealthReportCharts(bundle({ journal: [row, row, journal("future", "face", {}, "2026-12-02")] }), "2026-12-01", "en");
  assert.equal(charts.face[0].points[0].id, "2026-11-25");
  assert.equal(charts.face[0].points.at(-1)!.value, 1);
  assert.equal(charts.face[0].points.filter(point => !point.missing).length, 1);
});
