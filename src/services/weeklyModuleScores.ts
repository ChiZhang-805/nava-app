import type { ExerciseRecord, FaceRecord, FocusRecord, MoodRecord, NutritionRecord, SleepRecord, TrendBundle } from "../types";

export type WeeklyModuleKey = "sleep" | "exercise" | "nutrition" | "focus" | "face" | "mood";

export type WeeklyModuleScore = {
  key: WeeklyModuleKey;
  value: number | null;
  recordedDays: number;
};

type DatedRecord = { record_date: string };

function clampScore(value: number) {
  return Math.min(100, Math.max(0, value));
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function weeklyDailyAverage<T extends DatedRecord>(
  records: T[],
  startDate: string,
  endDate: string,
  scoreForRecord: (record: T) => number | null,
) {
  const valuesByDate = new Map<string, number[]>();
  records.forEach((record) => {
    if (record.record_date < startDate || record.record_date > endDate) return;
    const score = scoreForRecord(record);
    if (score == null) return;
    const values = valuesByDate.get(record.record_date) ?? [];
    values.push(clampScore(score));
    valuesByDate.set(record.record_date, values);
  });
  const dailyScores = [...valuesByDate.values()].map(mean);
  return {
    value: dailyScores.length ? Math.round(mean(dailyScores)) : null,
    recordedDays: dailyScores.length,
  };
}

function sleepScore(record: SleepRecord) {
  const rhythm = finite(record.rhythm_score);
  if (rhythm != null) return rhythm;
  const rating = finite(record.self_rating);
  return rating == null ? null : rating * 20;
}

function exerciseScore(record: ExerciseRecord) {
  const steps = finite(record.steps);
  if (steps != null) return (steps / 8000) * 100;
  const minutes = finite(record.exercise_minutes);
  if (minutes != null) return (minutes / 30) * 100;
  const rating = finite(record.self_rating);
  return rating == null ? null : rating * 20;
}

function nutritionScore(record: NutritionRecord) {
  const rating = finite(record.health_rating);
  if (rating != null) return rating * 20;
  const calories = finite(record.total_calories);
  return calories == null ? null : clampScore(100 - Math.abs(calories - 1800) / 18);
}

function focusWeeklyScore(records: FocusRecord[], startDate: string, endDate: string) {
  const minutesByDate = new Map<string, number>();
  records.forEach((record) => {
    if (record.record_date < startDate || record.record_date > endDate) return;
    const minutes = finite(record.total_minutes);
    if (minutes == null) return;
    minutesByDate.set(record.record_date, (minutesByDate.get(record.record_date) ?? 0) + Math.max(0, minutes));
  });
  const dailyScores = [...minutesByDate.values()].map((minutes) => clampScore((minutes / 120) * 100));
  return {
    value: dailyScores.length ? Math.round(mean(dailyScores)) : null,
    recordedDays: dailyScores.length,
  };
}

export function calculateWeeklyModuleScores(bundle: TrendBundle | null, startDate: string, endDate: string): WeeklyModuleScore[] {
  const trends = bundle ?? {
    moods: [], sleeps: [], exercises: [], nutritions: [], faces: [], focus: [],
    focusDistributions: [], healthMetrics: [], rhythms: [],
  };
  const sleep = weeklyDailyAverage<SleepRecord>(trends.sleeps, startDate, endDate, sleepScore);
  const exercise = weeklyDailyAverage<ExerciseRecord>(trends.exercises, startDate, endDate, exerciseScore);
  const nutrition = weeklyDailyAverage<NutritionRecord>(trends.nutritions, startDate, endDate, nutritionScore);
  const focus = focusWeeklyScore(trends.focus, startDate, endDate);
  const face = weeklyDailyAverage<FaceRecord>(trends.faces, startDate, endDate, (record) => finite(record.overall_score));
  const mood = weeklyDailyAverage<MoodRecord>(trends.moods, startDate, endDate, (record) => finite(record.mood_score));
  return [
    { key: "sleep", ...sleep },
    { key: "exercise", ...exercise },
    { key: "nutrition", ...nutrition },
    { key: "focus", ...focus },
    { key: "face", ...face },
    { key: "mood", ...mood },
  ];
}
