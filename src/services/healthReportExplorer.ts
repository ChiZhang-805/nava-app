import type { LineTrendPoint } from "../components/LineTrendChart";
import type { TrendBundle } from "../types";
import type { JournalCategory, JournalRecord } from "./journal";
import { rollingDateWindow, shiftDateISO } from "./date.ts";

export type HealthReportCategory = "mood" | "face" | "focus" | "sleep" | "exercise" | "diet" | "heart";
export interface HealthReportChart {
  id: string;
  title: string;
  unit: string;
  description: string;
  points: LineTrendPoint[];
}

function number(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
const sum = (values: unknown[]) => {
  const known = values.map(number).filter((value): value is number => value !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};
const average = (values: unknown[]) => {
  const known = values.map(number).filter((value): value is number => value !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};
const hasValue = (chart: HealthReportChart) => chart.points.some(point => !point.missing);
const clock = (value: unknown) => {
  const text = String(value ?? "");
  const match = text.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (match && Number(match[1]) < 24 && Number(match[2]) < 60) return `${match[1]}:${match[2]}`;
  if (text.includes("T") && Number.isFinite(Date.parse(text))) {
    const date = new Date(text);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return null;
};

/** The same recorded sleep intervals used by the journal, merged before totaling. */
function sleepHours(records: JournalRecord[]) {
  const intervals = records.flatMap(record => {
    const bedtime = clock(record.data.bedtime), wakeTime = clock(record.data.wakeTime);
    if (!bedtime || !wakeTime) return [];
    const endDay = String(record.data.wakeDate || record.recordDate);
    const startDay = String(record.data.bedDate || (bedtime > wakeTime ? shiftDateISO(endDay, -1) : endDay));
    const start = Date.parse(!record.data.bedDate && String(record.data.bedtime).includes("T") ? String(record.data.bedtime) : `${startDay}T${bedtime}`);
    const end = Date.parse(!record.data.wakeDate && String(record.data.wakeTime).includes("T") ? String(record.data.wakeTime) : `${endDay}T${wakeTime}`);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : [];
  }).sort((a, b) => a.start - b.start);
  if (!intervals.length) return null;
  let total = 0, current = { ...intervals[0] };
  for (const interval of intervals.slice(1)) {
    if (interval.start <= current.end) current.end = Math.max(current.end, interval.end);
    else { total += current.end - current.start; current = { ...interval }; }
  }
  return (total + current.end - current.start) / 3_600_000;
}

/** No inferred scores, targets, absent-to-zero filling, or fabricated device values. */
export function buildHealthReportCharts(bundle: TrendBundle | null, date: string, locale: "zh" | "en"): Record<HealthReportCategory, HealthReportChart[]> {
  const t = (zh: string, en: string) => locale === "zh" ? zh : en;
  const days = rollingDateWindow(date);
  const journal = [...new Map((bundle?.journal ?? []).map(record => [record.id, record])).values()];
  const entries = (category: JournalCategory, day: string) => journal.filter(record => record.category === category && record.recordDate === day);
  const rows = <T extends { record_date: string }>(records: T[] | undefined, day: string) => (records ?? []).filter(record => record.record_date === day);
  const points = (read: (day: string) => number | null): LineTrendPoint[] => days.map(day => {
    const value = read(day);
    return { id: day, label: `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`, value: value ?? 0, missing: value === null };
  });
  const chart = (id: string, title: string, unit: string, description: string, read: (day: string) => number | null): HealthReportChart => ({ id, title, unit, description, points: points(read) });
  const logged = t("近7天已记录的数值；未填写的日子留空。", "Logged values from the last 7 days. Missing days stay empty.");
  const journalFirst = (category: JournalCategory, day: string, read: (records: JournalRecord[]) => number | null, fallback: () => number | null) => {
    const saved = entries(category, day);
    // A journal entry and an older daily aggregate may describe the same event.
    // Never add those two sources together or fill an omitted journal field from it.
    return saved.length ? read(saved) : fallback();
  };
  const count = (category: JournalCategory, day: string, legacy: { record_date: string }[] | undefined) => journalFirst(category, day, saved => saved.length, () => rows(legacy, day).length || null);
  const recordUnit = t("条", "entries"), minutes = t("分钟", "min");
  const mood = [chart("mood-intensity", t("情绪强度", "Feeling intensity"), "/ 10", t("仅展示你明确填写的1–10强度；不是情绪好坏评分。", "Your explicit 1–10 intensity ratings, not a good/bad mood score."), day => average(entries("mood", day).map(record => { const value = number(record.data.intensity); return value !== null && value >= 1 && value <= 10 ? value : null; }))),
    chart("mood-entries", t("留下的心情", "Mood entries"), recordUnit, logged, day => count("mood", day, bundle?.moods))];
  const legacyMood = chart("mood-legacy-rating", t("历史情绪自评", "Earlier mood ratings"), "/ 100", t("旧记录中的原始自评分，与1–10情绪强度分开展示。", "Original ratings in older records, separate from 1–10 intensity."), day => average(rows(bundle?.moods, day).map(record => number(record.mood_score) !== null && record.mood_score <= 100 ? record.mood_score : null)));
  if (hasValue(legacyMood)) mood.push(legacyMood);
  const face = [chart("face-entries", t("面部小记", "Face observations"), recordUnit, t("记录次数，不是外貌或健康评分。", "Number of observations, not an appearance or health score."), day => count("face", day, bundle?.faces)),
    chart("face-details", t("补充的观察", "Details you noted"), t("项", "details"), t("眼周、皮肤与备注中实际填写的项目数。", "Filled eye-area, skin and note fields."), day => { const saved = entries("face", day); return saved.length ? saved.reduce((total, record) => total + ["eyeArea", "skinAppearance", "notes"].filter(key => typeof record.data[key] === "string" && String(record.data[key]).trim()).length, 0) : null; })];
  const focus = [chart("focus-minutes", t("已记录专注时长", "Logged focus time"), minutes, t("使用已保存的实际用时（含手动记录）；不会把计划时长当作完成。", "Saved elapsed time, including manual entries; planned time is not completion."), day => journalFirst("focus", day, saved => { const elapsed = sum(saved.map(record => record.focus?.elapsedMs)); return elapsed === null ? null : elapsed / 60000; }, () => sum(rows(bundle?.focus, day).map(record => record.total_minutes)))),
    chart("focus-sessions", t("专注记录次数", "Focus entries"), t("次", "sessions"), logged, day => journalFirst("focus", day, saved => saved.length, () => sum(rows(bundle?.focus, day).map(record => record.completed_sessions))))];
  const sleep = [chart("sleep-hours", t("睡眠时长", "Sleep duration"), t("小时", "h"), t("已记录时间段去除重叠后合计；不是睡眠质量评分。", "Logged intervals with overlaps removed; not a sleep-quality score."), day => journalFirst("sleep", day, sleepHours, () => { const value = sum(rows(bundle?.sleeps, day).map(record => record.sleep_duration_minutes)); return value === null ? null : value / 60; }))];
  const deep = chart("sleep-deep", t("已记录深睡", "Logged deep sleep"), minutes, t("只展示原记录里的深睡时长，不从入睡时间推算。", "Only saved deep-sleep measurements; never inferred from bedtimes."), day => sum(rows(bundle?.sleeps, day).map(record => record.deep_sleep_minutes)));
  if (hasValue(deep)) sleep.push(deep);
  const exercise = [chart("exercise-minutes", t("运动时长", "Activity duration"), minutes, logged, day => journalFirst("sport", day, saved => sum(saved.map(record => record.data.durationMinutes)), () => sum(rows(bundle?.exercises, day).map(record => record.exercise_minutes)))),
    chart("exercise-steps", t("已记录步数", "Logged steps"), t("步", "steps"), t("包括主动填写的步数，不推断设备测量来源。", "Includes manually logged steps; device provenance is not inferred."), day => journalFirst("sport", day, saved => sum(saved.map(record => record.data.steps)), () => sum(rows(bundle?.exercises, day).map(record => record.steps))))];
  const diet = [chart("diet-energy", t("已记录热量", "Logged energy"), "kcal", t("只合计已知热量，可能包含估算；不是全天摄入或饮食评分。", "Known logged energy, possibly estimated; not total daily intake or a diet score."), day => journalFirst("food", day, saved => sum(saved.map(record => record.data.calories)), () => sum(rows(bundle?.nutritions, day).map(record => record.total_calories)))),
    chart("diet-protein", t("已记录蛋白质", "Logged protein"), "g", t("只合计已填写项；没有填写不代表没有摄入。", "Known logged amounts only. Missing values do not mean none consumed."), day => journalFirst("food", day, saved => sum(saved.map(record => record.data.protein)), () => sum(rows(bundle?.nutritions, day).map(record => record.protein_grams)))),
    chart("diet-water", t("已记录饮水", "Logged water"), "ml", logged, day => sum(rows(bundle?.nutritions, day).map(record => record.hydration_ml)))];
  const apple = (bundle?.healthMetrics ?? []).filter(record => ["apple_health", "apple_watch"].includes(record.source));
  const heart = ([
    ["latest_heart_rate", t("最新心率记录", "Latest heart-rate reading"), "bpm"],
    ["resting_heart_rate", t("静息心率", "Resting heart rate"), "bpm"],
    ["heart_rate_variability_sdnn", t("心率变异性", "Heart-rate variability"), "ms"],
  ] as const).map(([field, title, unit]) => chart(`heart-${field}`, title, unit, t("来自已同步的Apple健康记录，不是实时测量。", "From synced Apple Health records, not a live measurement."), day => { const daily = rows(apple, day); const value = number(daily[daily.length - 1]?.[field]); return value !== null && value > 0 ? value : null; })).filter(hasValue);
  return { mood, face, focus, sleep, exercise, diet, heart };
}
