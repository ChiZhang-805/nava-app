import type { TodaySnapshot, TrendBundle } from "../types";

export const HOME_WIDGET_LIMIT = 6;

export type HomeWidgetId = "sleep" | "focus" | "exercise" | "mood" | "diet" | "face";

export type HomeWidgetPresentation = {
  id: HomeWidgetId;
  core: string;
  support: string;
  state: "ready" | "missing" | "attention";
};

export const homeWidgetIds: HomeWidgetId[] = ["sleep", "focus", "exercise", "mood", "diet", "face"];

const storageKey = (userId: string) => `nava.home-widgets.v1:${userId}`;

function validIds(value: unknown): HomeWidgetId[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is HomeWidgetId => typeof item === "string" && homeWidgetIds.includes(item as HomeWidgetId));
  return [...new Set(ids)].slice(0, HOME_WIDGET_LIMIT);
}

export function defaultHomeWidgetIds(): HomeWidgetId[] {
  return ["sleep", "focus", "exercise", "mood", "diet"];
}

export function loadHomeWidgetIds(userId: string): HomeWidgetId[] {
  if (typeof window === "undefined") return defaultHomeWidgetIds();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "null") as { ids?: unknown } | null;
    const ids = validIds(parsed?.ids);
    if (ids) return ids;
  } catch {
    // A malformed device preference must not affect the user's health data.
  }
  return defaultHomeWidgetIds();
}

export async function hydrateHomeWidgetIds(userId: string): Promise<HomeWidgetId[]> {
  const { loadUserAppPreferences, saveUserAppPreferences } = await import("./userCloudState.ts");
  const local = loadHomeWidgetIds(userId);
  const preferences = await loadUserAppPreferences(userId);
  const remote = validIds(preferences?.homeWidgetIds);
  const resolved = remote ?? local;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(userId), JSON.stringify({ version: 1, ids: resolved }));
  }
  if (!remote) await saveUserAppPreferences(userId, { homeWidgetIds: resolved });
  return resolved;
}

export function saveHomeWidgetIds(userId: string, ids: HomeWidgetId[]) {
  const normalized = validIds(ids) ?? [];
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(userId), JSON.stringify({ version: 1, ids: normalized }));
  }
  void import("./userCloudState.ts")
    .then(({ saveUserAppPreferences }) => saveUserAppPreferences(userId, { homeWidgetIds: normalized }))
    .catch((error) => console.warn("Home widget cloud sync deferred", error));
  return normalized;
}

export function moveHomeWidget(ids: HomeWidgetId[], source: HomeWidgetId, target: HomeWidgetId) {
  const next = [...ids];
  const sourceIndex = next.indexOf(source);
  const targetIndex = next.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return next;
  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next;
}

export function shiftHomeWidget(ids: HomeWidgetId[], id: HomeWidgetId, direction: -1 | 1) {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function mealCount(snapshot: TodaySnapshot) {
  const nutrition = snapshot.nutrition;
  if (!nutrition) return 0;
  return [nutrition.breakfast_items, nutrition.lunch_items, nutrition.dinner_items, nutrition.pantry_items]
    .filter((items) => Array.isArray(items) && items.length > 0).length;
}

function previousRecordedDayValues<T extends { record_date: string }>(records: T[], currentDate: string, read: (record: T) => number | null | undefined) {
  const byDate = new Map<string, number[]>();
  records.forEach((record) => {
    if (record.record_date >= currentDate) return;
    const value = read(record);
    if (value == null || !Number.isFinite(value)) return;
    byDate.set(record.record_date, [...(byDate.get(record.record_date) ?? []), value]);
  });
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-7)
    .map(([, values]) => values.reduce((sum, value) => sum + value, 0) / values.length);
}

function trendSupport(current: number | null | undefined, previous: number[], locale: "zh" | "en") {
  if (current == null || previous.length < 2) return null;
  const average = previous.reduce((sum, value) => sum + value, 0) / previous.length;
  if (!Number.isFinite(average) || Math.abs(average) < .001) return null;
  const percent = Math.round((current - average) / Math.abs(average) * 100);
  if (Math.abs(percent) < 3) return locale === "zh" ? "近7日持平" : "Flat vs 7d";
  const signed = `${percent > 0 ? "+" : ""}${percent}%`;
  return locale === "zh" ? `较近7日 ${signed}` : `${signed} vs 7d`;
}

export function buildHomeWidgetPresentation(id: HomeWidgetId, snapshot: TodaySnapshot, locale: "zh" | "en" = "zh", trends?: TrendBundle | null): HomeWidgetPresentation {
  const zh = locale === "zh";
  if (id === "sleep") {
    const minutes = snapshot.sleep?.sleep_duration_minutes;
    const trend = trendSupport(minutes, previousRecordedDayValues(trends?.sleeps ?? [], snapshot.date, (record) => record.sleep_duration_minutes), locale);
    return minutes == null
      ? { id, core: "--", support: zh ? "尚未记录" : "Not logged", state: "missing" }
      : { id, core: `${(minutes / 60).toFixed(1)}h`, support: trend ?? (zh ? "昨夜睡眠" : "Last sleep"), state: minutes < 360 ? "attention" : "ready" };
  }
  if (id === "focus") {
    const trend = trendSupport(snapshot.focusMinutes, previousRecordedDayValues(trends?.focus ?? [], snapshot.date, (record) => record.total_minutes), locale);
    return snapshot.focusSessions <= 0
      ? { id, core: "--", support: zh ? "尚未完成" : "No session", state: "missing" }
      : { id, core: `${Math.round(snapshot.focusMinutes)}m`, support: trend ?? (zh ? `${snapshot.focusSessions} 次完成` : `${snapshot.focusSessions} sessions`), state: "ready" };
  }
  if (id === "exercise") {
    const exercise = snapshot.exercise;
    const trend = trendSupport(exercise?.steps, previousRecordedDayValues(trends?.exercises ?? [], snapshot.date, (record) => record.steps), locale);
    return !exercise
      ? { id, core: "--", support: zh ? "尚未记录" : "Not logged", state: "missing" }
      : { id, core: Math.round(exercise.steps ?? 0).toLocaleString(), support: trend ?? (zh ? `${Math.round(exercise.exercise_minutes ?? 0)} 分钟` : `${Math.round(exercise.exercise_minutes ?? 0)} min`), state: (exercise.steps ?? 0) < 3000 ? "attention" : "ready" };
  }
  if (id === "mood") {
    const score = snapshot.mood?.mood_score;
    if (score == null) return { id, core: "--", support: zh ? "尚未记录" : "Not logged", state: "missing" };
    const core = score >= 80 ? (zh ? "轻快" : "Bright") : score >= 60 ? (zh ? "平稳" : "Steady") : score >= 40 ? (zh ? "低落" : "Low") : (zh ? "沉重" : "Heavy");
    const trend = trendSupport(score, previousRecordedDayValues(trends?.moods ?? [], snapshot.date, (record) => record.mood_score), locale);
    return { id, core, support: trend ?? (zh ? `${Math.round(score)} 分` : `${Math.round(score)} pts`), state: score < 50 ? "attention" : "ready" };
  }
  if (id === "diet") {
    const nutrition = snapshot.nutrition;
    const trend = trendSupport(nutrition?.total_calories, previousRecordedDayValues(trends?.nutritions ?? [], snapshot.date, (record) => record.total_calories), locale);
    return !nutrition
      ? { id, core: "--", support: zh ? "尚未记录" : "Not logged", state: "missing" }
      : { id, core: `${Math.round(nutrition.total_calories)}k`, support: trend ?? (zh ? `${mealCount(snapshot)} 餐已记` : `${mealCount(snapshot)} meals`), state: "ready" };
  }
  const face = snapshot.face;
  const trend = trendSupport(face?.overall_score, previousRecordedDayValues(trends?.faces ?? [], snapshot.date, (record) => record.overall_score), locale);
  return face?.overall_score == null
    ? { id, core: "--", support: zh ? "尚未记录" : "Not logged", state: "missing" }
    : { id, core: `${Math.round(face.overall_score)}`, support: trend ?? (zh ? "今日状态" : "Today"), state: face.overall_score < 55 ? "attention" : "ready" };
}
