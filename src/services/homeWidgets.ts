import { sameModeFaces } from "./faceComparison.ts";
import type { TodaySnapshot, TrendBundle } from "../types";

export const HOME_WIDGET_LIMIT = 6;
export const HOME_WIDGET_SLOT_COUNT = 6;

export type HomeWidgetId = "heart" | "sleep" | "exercise" | "steps" | "focus" | "mood" | "diet" | "face";
export type HomeWidgetSlot = HomeWidgetId | null;
export type HomeWidgetDirection = "left" | "right" | "up" | "down";

export type HomeWidgetPresentation = {
  id: HomeWidgetId;
  core: string;
  support: string;
  state: "ready" | "missing" | "attention";
};

export const homeWidgetIds: HomeWidgetId[] = ["heart", "sleep", "exercise", "steps", "focus", "mood", "diet", "face"];

const legacyDefaultHomeWidgetIds: HomeWidgetId[] = ["sleep", "focus", "exercise", "mood", "diet"];

function isLegacyDefault(ids: HomeWidgetId[]) {
  return ids.length === legacyDefaultHomeWidgetIds.length
    && ids.every((id, index) => id === legacyDefaultHomeWidgetIds[index]);
}

const storageKey = (userId: string) => `nava.home-widgets.v1:${userId}`;

// The visual grid is filled in the same order used by the Figma 1+3 layout:
// first the upper-left card, then the lower row, followed by the two remaining
// upper slots. Keeping this mapping explicit lets existing compact preference
// arrays migrate without changing their visible layout.
export const homeWidgetSlotGrid: ReadonlyArray<Readonly<{ row: number; column: number }>> = [
  { row: 0, column: 0 },
  { row: 1, column: 0 },
  { row: 1, column: 1 },
  { row: 1, column: 2 },
  { row: 0, column: 1 },
  { row: 0, column: 2 },
];

function validIds(value: unknown): HomeWidgetId[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is HomeWidgetId => typeof item === "string" && homeWidgetIds.includes(item as HomeWidgetId));
  return [...new Set(ids)].slice(0, HOME_WIDGET_LIMIT);
}

export function normalizeHomeWidgetLayout(value: unknown): HomeWidgetSlot[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<HomeWidgetId>();
  const layout = value.slice(0, HOME_WIDGET_SLOT_COUNT).map((item): HomeWidgetSlot => {
    if (item === null) return null;
    if (typeof item !== "string" || !homeWidgetIds.includes(item as HomeWidgetId)) return null;
    const id = item as HomeWidgetId;
    if (seen.has(id)) return null;
    seen.add(id);
    return id;
  });
  while (layout.length < HOME_WIDGET_SLOT_COUNT) layout.push(null);
  return layout;
}

export function homeWidgetIdsFromLayout(layout: HomeWidgetSlot[]): HomeWidgetId[] {
  return (normalizeHomeWidgetLayout(layout) ?? []).filter((id): id is HomeWidgetId => id !== null);
}

export function homeWidgetLayoutFromIds(ids: HomeWidgetId[]): HomeWidgetSlot[] {
  return normalizeHomeWidgetLayout(validIds(ids) ?? []) ?? Array.from({ length: HOME_WIDGET_SLOT_COUNT }, () => null);
}

export function defaultHomeWidgetIds(): HomeWidgetId[] {
  return ["heart", "sleep", "exercise", "steps"];
}

export function defaultHomeWidgetLayout(): HomeWidgetSlot[] {
  return homeWidgetLayoutFromIds(defaultHomeWidgetIds());
}

export function loadHomeWidgetLayout(userId: string): HomeWidgetSlot[] {
  if (typeof window === "undefined") return defaultHomeWidgetLayout();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "null") as { ids?: unknown; layout?: unknown } | null;
    const layout = normalizeHomeWidgetLayout(parsed?.layout ?? parsed?.ids);
    if (layout) return parsed?.layout === undefined && isLegacyDefault(homeWidgetIdsFromLayout(layout)) ? defaultHomeWidgetLayout() : layout;
  } catch {
    // A malformed device preference must not affect the user's health data.
  }
  return defaultHomeWidgetLayout();
}

export function loadHomeWidgetIds(userId: string): HomeWidgetId[] {
  return homeWidgetIdsFromLayout(loadHomeWidgetLayout(userId));
}

export async function hydrateHomeWidgetLayout(userId: string): Promise<HomeWidgetSlot[]> {
  const { loadUserAppPreferences, saveUserAppPreferences } = await import("./userCloudState.ts");
  const local = loadHomeWidgetLayout(userId);
  const preferences = await loadUserAppPreferences(userId);
  const remote = normalizeHomeWidgetLayout(preferences?.homeWidgetIds);
  const remoteIds = remote ? homeWidgetIdsFromLayout(remote) : null;
  const remoteIsLegacyDefault = Array.isArray(preferences?.homeWidgetIds)
    && preferences.homeWidgetIds.length === legacyDefaultHomeWidgetIds.length
    && preferences.homeWidgetIds.every((id, index) => id === legacyDefaultHomeWidgetIds[index]);
  const resolved = remote && remoteIds && !remoteIsLegacyDefault ? remote : local;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(userId), JSON.stringify({ version: 2, layout: resolved }));
  }
  if (!remote || remoteIsLegacyDefault) await saveUserAppPreferences(userId, { homeWidgetIds: resolved });
  return resolved;
}

export async function hydrateHomeWidgetIds(userId: string): Promise<HomeWidgetId[]> {
  return homeWidgetIdsFromLayout(await hydrateHomeWidgetLayout(userId));
}

export function saveHomeWidgetLayout(userId: string, layout: HomeWidgetSlot[]) {
  const normalized = normalizeHomeWidgetLayout(layout) ?? defaultHomeWidgetLayout();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(userId), JSON.stringify({ version: 2, layout: normalized }));
  }
  void import("./userCloudState.ts")
    .then(({ saveUserAppPreferences }) => saveUserAppPreferences(userId, { homeWidgetIds: normalized }))
    .catch((error) => console.warn("Home widget cloud sync deferred", error));
  return normalized;
}

export function saveHomeWidgetIds(userId: string, ids: HomeWidgetId[]) {
  const normalized = validIds(ids) ?? [];
  saveHomeWidgetLayout(userId, homeWidgetLayoutFromIds(normalized));
  return normalized;
}

export function placeHomeWidgetInSlot(layout: HomeWidgetSlot[], source: HomeWidgetId, targetSlot: number): HomeWidgetSlot[] {
  const next = normalizeHomeWidgetLayout(layout) ?? defaultHomeWidgetLayout();
  const sourceSlot = next.indexOf(source);
  if (sourceSlot < 0 || targetSlot < 0 || targetSlot >= HOME_WIDGET_SLOT_COUNT || sourceSlot === targetSlot) return next;
  [next[sourceSlot], next[targetSlot]] = [next[targetSlot], next[sourceSlot]];
  return next;
}

export function moveHomeWidgetByDirection(layout: HomeWidgetSlot[], source: HomeWidgetId, direction: HomeWidgetDirection): HomeWidgetSlot[] {
  const normalized = normalizeHomeWidgetLayout(layout) ?? defaultHomeWidgetLayout();
  const sourceSlot = normalized.indexOf(source);
  if (sourceSlot < 0) return normalized;
  const sourcePoint = homeWidgetSlotGrid[sourceSlot];
  const delta = direction === "left" ? { row: 0, column: -1 }
    : direction === "right" ? { row: 0, column: 1 }
      : direction === "up" ? { row: -1, column: 0 }
        : { row: 1, column: 0 };
  const targetSlot = homeWidgetSlotGrid.findIndex((point) => point.row === sourcePoint.row + delta.row && point.column === sourcePoint.column + delta.column);
  return targetSlot < 0 ? normalized : placeHomeWidgetInSlot(normalized, source, targetSlot);
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

function previousRecordedDayValues<T extends { record_date: string }>(
  records: T[],
  currentDate: string,
  read: (record: T) => number | null | undefined,
  aggregate: "average" | "sum" = "average",
) {
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
    .map(([, values]) => {
      const sum = values.reduce((total, value) => total + value, 0);
      return aggregate === "sum" ? sum : sum / values.length;
    });
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
  const category=id==='exercise'?'sport':id==='diet'?'food':id;
  const entries=snapshot.journal?.filter(r=>r.category===category)??[];
  if(entries.length){
    const latest=entries[0].data;
    let core='';
    if(id==='mood')core=String(latest.mood??'');
    if(id==='face')core=String(latest.feeling??'');
    if(id==='sleep')core=`${latest.hours??'--'}h`;
    if(id==='exercise')core=`${entries.reduce((n,r)=>n+Number(r.data.durationMinutes??0),0)}m`;
    if(id==='focus')core=`${Math.round(entries.reduce((n,r)=>n+Number(r.focus?.elapsedMs??0)/60000,0))}m`;
    if(id==='diet')core=String(latest.foods??'');
    if(core)return {id,core,support:zh?`${entries.length} 条记录`:`${entries.length} entries`,state:'ready'};
  }
  if (id === "heart") {
    const direct = Number.parseFloat(snapshot.exercise?.heart_rate ?? "");
    const directValid = snapshot.exercise?.record_date === snapshot.date && Number.isFinite(direct) && direct > 0;
    const historical = [...(trends?.healthMetrics ?? [])]
      .filter((item) => item.record_date <= snapshot.date)
      .sort((a, b) => b.record_date.localeCompare(a.record_date))
      .map((item) => ({ date: item.record_date, value: [item.latest_heart_rate, item.resting_heart_rate].find((value) => value != null && Number.isFinite(value) && value > 0) }))
      .find((item) => item.value != null);
    const value = directValid ? direct : historical?.value;
    const date = directValid ? snapshot.date : historical?.date;
    const datedUnit = date && date !== snapshot.date
      ? `${date.slice(0, 4) === snapshot.date.slice(0, 4) ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : date} · ${zh ? "次/分" : "bpm"}`
      : zh ? "次/分" : "bpm";
    return value == null || !Number.isFinite(value) || value <= 0
      ? { id, core: "--", support: zh ? "尚未同步" : "Not synced", state: "missing" }
      : { id, core: `${Math.round(value)}`, support: datedUnit, state: value > 100 || value < 50 ? "attention" : "ready" };
  }
  if (id === "sleep") {
    const minutes = snapshot.sleep?.sleep_duration_minutes;
    return minutes == null
      ? { id, core: "--", support: zh ? "尚未记录" : "Not logged", state: "missing" }
      : {
          id,
          core: `${Math.floor(minutes / 60)}`,
          support: zh ? `小时 ${minutes % 60} 分` : `h ${minutes % 60} min`,
          state: minutes < 360 ? "attention" : "ready",
        };
  }
  if (id === "focus") {
    const trend = trendSupport(snapshot.focusMinutes, previousRecordedDayValues(trends?.focus ?? [], snapshot.date, (record) => record.total_minutes, "sum"), locale);
    return snapshot.focusSessions <= 0
      ? { id, core: "--", support: zh ? "尚未完成" : "No session", state: "missing" }
      : { id, core: `${Math.round(snapshot.focusMinutes)}m`, support: trend ?? (zh ? `${snapshot.focusSessions} 次完成` : `${snapshot.focusSessions} sessions`), state: "ready" };
  }
  if (id === "exercise") {
    const exercise = snapshot.exercise;
    return exercise?.exercise_minutes == null
      ? { id, core: "--", support: zh ? "尚未记录" : "Not logged", state: "missing" }
      : { id, core: `${Math.round(exercise.exercise_minutes)}`, support: zh ? "分钟" : "min", state: exercise.exercise_minutes < 20 ? "attention" : "ready" };
  }
  if (id === "steps") {
    const exercise = snapshot.exercise;
    return exercise?.steps == null
      ? { id, core: "--", support: zh ? "尚未同步" : "Not synced", state: "missing" }
      : { id, core: `${Math.round(exercise.steps)}`, support: zh ? "步" : "steps", state: exercise.steps < 3000 ? "attention" : "ready" };
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
    return nutrition?.total_calories == null
      ? { id, core: "--", support: zh ? "尚未记录" : "Not logged", state: "missing" }
      : { id, core: `${Math.round(nutrition.total_calories)}k`, support: trend ?? (zh ? `${mealCount(snapshot)} 餐已记` : `${mealCount(snapshot)} meals`), state: "ready" };
  }
  const face = snapshot.face;
  const trend = trendSupport(face?.overall_score, previousRecordedDayValues(sameModeFaces(trends?.faces ?? [], face?.capture_mode, snapshot.date), snapshot.date, (record) => record.overall_score), locale);
  return face?.overall_score == null
    ? { id, core: "--", support: zh ? "尚未记录" : "Not logged", state: "missing" }
    : { id, core: `${Math.round(face.overall_score)}`, support: trend ?? (zh ? "今日状态" : "Today"), state: face.overall_score < 55 ? "attention" : "ready" };
}
