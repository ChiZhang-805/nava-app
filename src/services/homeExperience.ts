import type { TodaySnapshot, TrendBundle } from "../types";

export type CalendarCell = {
  date: string | null;
  day: number | null;
};

export type DailyMetric = {
  key: "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";
  recorded: boolean;
  score: number | null;
  primary: string;
  secondary: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function homeSwipeThreshold(viewportHeight: number) {
  return Math.round(clamp(viewportHeight / 6, 88, 144));
}

export function isVerticalHomeSwipe(startX: number, startY: number, endX: number, endY: number, viewportHeight: number, direction: "up" | "down") {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const threshold = homeSwipeThreshold(viewportHeight);
  if (Math.abs(deltaX) > Math.abs(deltaY) * 0.72) return false;
  return direction === "up" ? deltaY <= -threshold : deltaY >= threshold;
}

export function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(year, monthNumber - 1 + offset, 1);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}`;
}

export function monthEndISO(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(year, monthNumber, 0);
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
}

export function buildMonthCells(month: string, weekStartsMonday = true): CalendarCell[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const weekday = new Date(year, monthNumber - 1, 1).getDay();
  const leading = weekStartsMonday ? (weekday + 6) % 7 : weekday;
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1;
    if (day < 1 || day > daysInMonth) return { date: null, day: null };
    return { date: `${month}-${pad(day)}`, day };
  });
}

export function buildDailyCoverage(trends: TrendBundle) {
  const coverage: Record<string, Set<DailyMetric["key"]>> = {};
  const add = (date: string, key: DailyMetric["key"]) => {
    coverage[date] ??= new Set();
    coverage[date].add(key);
  };
  trends.moods.forEach((record) => add(record.record_date, "mood"));
  trends.sleeps.forEach((record) => add(record.record_date, "sleep"));
  trends.exercises.forEach((record) => add(record.record_date, "exercise"));
  trends.nutritions.forEach((record) => add(record.record_date, "diet"));
  trends.focus.forEach((record) => add(record.record_date, "focus"));
  trends.faces.forEach((record) => add(record.record_date, "face"));
  return Object.fromEntries(Object.entries(coverage).map(([date, keys]) => [date, [...keys]])) as Record<string, DailyMetric["key"][]>;
}

export function rhythmScoresByDate(trends: TrendBundle) {
  return Object.fromEntries(trends.rhythms.map((record) => [record.record_date, Math.round(record.score)]));
}

export function dailyMetrics(snapshot: TodaySnapshot, locale: "zh" | "en" = "zh"): DailyMetric[] {
  const copy = <T,>(zh: T, en: T) => locale === "zh" ? zh : en;
  const sleepScore = snapshot.sleep?.rhythm_score != null
    ? Number(snapshot.sleep.rhythm_score)
    : snapshot.sleep?.self_rating != null
      ? Number(snapshot.sleep.self_rating) * 20
      : snapshot.sleep?.sleep_duration_minutes != null
        ? Math.round(clamp(100 - Math.abs(snapshot.sleep.sleep_duration_minutes - 480) / 4.8, 0, 100))
        : null;
  const exerciseScore = snapshot.exercise
    ? Math.round(clamp(((snapshot.exercise.steps ?? 0) / 8_000) * 65 + ((snapshot.exercise.exercise_minutes ?? 0) / 30) * 35, 0, 100))
    : null;
  const dietScore = snapshot.nutrition
    ? snapshot.nutrition.health_rating != null
      ? Number(snapshot.nutrition.health_rating) * 20
      : null
    : null;
  const focusScore = snapshot.focusSessions > 0 || snapshot.focusMinutes > 0
    ? Math.round(clamp((snapshot.focusMinutes / 60) * 100, 0, 100))
    : null;

  return [
    {
      key: "mood",
      recorded: Boolean(snapshot.mood),
      score: snapshot.mood?.mood_score ?? null,
      primary: snapshot.mood ? `${Math.round(snapshot.mood.mood_score)}${copy(" 分", " pts")}` : "--",
      secondary: snapshot.mood?.factors?.slice(0, 2).join(" · ") || copy("暂无情绪记录", "No mood record"),
    },
    {
      key: "sleep",
      recorded: Boolean(snapshot.sleep),
      score: sleepScore,
      primary: snapshot.sleep?.sleep_duration_minutes != null ? `${Math.round(snapshot.sleep.sleep_duration_minutes / 60 * 10) / 10}${copy(" 小时", " hr")}` : "--",
      secondary: snapshot.sleep?.sleep_start && snapshot.sleep?.sleep_end ? `${snapshot.sleep.sleep_start} — ${snapshot.sleep.sleep_end}` : copy("暂无睡眠记录", "No sleep record"),
    },
    {
      key: "exercise",
      recorded: Boolean(snapshot.exercise),
      score: exerciseScore,
      primary: snapshot.exercise?.steps != null ? `${Math.round(snapshot.exercise.steps).toLocaleString()}${copy(" 步", " steps")}` : "--",
      secondary: snapshot.exercise ? `${Math.round(snapshot.exercise.exercise_minutes ?? 0)}${copy(" 分钟", " min")} · ${Math.round(snapshot.exercise.calories ?? 0)} kcal` : copy("暂无运动记录", "No activity record"),
    },
    {
      key: "diet",
      recorded: Boolean(snapshot.nutrition),
      score: dietScore,
      primary: snapshot.nutrition ? `${Math.round(snapshot.nutrition.total_calories)} kcal` : "--",
      secondary: snapshot.nutrition ? `${copy("蛋白", "Protein")} ${Math.round(snapshot.nutrition.protein_grams ?? 0)}g · ${copy("饮水", "Water")} ${Math.round(snapshot.nutrition.hydration_ml ?? 0)}ml` : copy("暂无饮食记录", "No diet record"),
    },
    {
      key: "focus",
      recorded: snapshot.focusSessions > 0 || snapshot.focusMinutes > 0,
      score: focusScore,
      primary: snapshot.focusMinutes > 0 ? `${Math.round(snapshot.focusMinutes)}${copy(" 分钟", " min")}` : "--",
      secondary: snapshot.focusSessions > 0 ? `${snapshot.focusSessions}${copy(" 个专注时段", " focus sessions")}` : copy("暂无专注记录", "No focus record"),
    },
    {
      key: "face",
      recorded: Boolean(snapshot.face),
      score: snapshot.face?.overall_score ?? null,
      primary: snapshot.face?.overall_score != null ? `${Math.round(snapshot.face.overall_score)}${copy(" 分", " pts")}` : "--",
      secondary: snapshot.face?.skin_age != null ? `${copy("肤龄参考", "Skin-age reference")} ${Math.round(snapshot.face.skin_age)}` : copy("暂无面部记录", "No face record"),
    },
  ];
}
