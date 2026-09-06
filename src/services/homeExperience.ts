import type { TodaySnapshot, TrendBundle } from "../types";
import type { MascotMotion } from "./mascotMotion";

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

export type HomeDayPhase = "dawn" | "day" | "evening" | "night";

export type HomeGuidanceAction = {
  id: "sleep" | "diet" | "focus" | "exercise" | "mood" | "face" | "report" | "ai";
  label: string;
  target: {
    tab: "record" | "ai";
    module?: "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";
    view?: string | null;
  };
};

export type HomeGuidance = {
  phase: HomeDayPhase;
  reason: "sleep_low" | "rhythm_signal" | "movement_low" | "focus_complete" | "focus_missing" | "wind_down" | "steady";
  eyebrow: string;
  message: string;
  motion: MascotMotion;
  actions: HomeGuidanceAction[];
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function homeDayPhase(hour: number): HomeDayPhase {
  const normalized = ((Math.trunc(hour) % 24) + 24) % 24;
  if (normalized >= 5 && normalized < 9) return "dawn";
  if (normalized >= 9 && normalized < 17) return "day";
  if (normalized >= 17 && normalized < 21) return "evening";
  return "night";
}

function completeMood(snapshot: TodaySnapshot) {
  return Boolean(snapshot.mood?.factors.length && snapshot.mood.diary_content?.trim());
}

function homeGuidanceActions(snapshot: TodaySnapshot, hour: number, locale: "zh" | "en") {
  const zh = locale === "zh";
  const actions: HomeGuidanceAction[] = [];
  const add = (action: HomeGuidanceAction) => {
    if (!actions.some((candidate) => candidate.id === action.id)) actions.push(action);
  };

  if (hour >= 9 && !snapshot.sleep) add({ id: "sleep", label: zh ? "补睡眠" : "Add sleep", target: { tab: "record", module: "sleep", view: "editor" } });
  if (hour >= 10 && snapshot.focusMinutes < 25) add({ id: "focus", label: zh ? "去专注" : "Start focus", target: { tab: "record", module: "focus" } });
  if (hour >= 12 && !snapshot.nutrition) add({ id: "diet", label: zh ? "记一餐" : "Log a meal", target: { tab: "record", module: "diet", view: "editor" } });
  if (hour >= 17 && (!snapshot.exercise || (snapshot.exercise.steps ?? 0) < 3_000)) add({ id: "exercise", label: zh ? "动一动" : "Move gently", target: { tab: "record", module: "exercise" } });
  if (hour >= 18 && !completeMood(snapshot)) add({ id: "mood", label: zh ? "写心情" : "Check mood", target: { tab: "record", module: "mood", view: "editor" } });
  if (hour >= 20 && !snapshot.face) add({ id: "face", label: zh ? "记面部" : "Log face", target: { tab: "record", module: "face", view: "editor" } });

  add({ id: "report", label: zh ? "看报告" : "View report", target: { tab: "record" } });
  add({ id: "ai", label: zh ? "问 NAVA" : "Ask NAVA", target: { tab: "ai" } });
  return actions.slice(0, 3);
}

export function buildHomeGuidance(snapshot: TodaySnapshot, hour: number, locale: "zh" | "en" = "zh"): HomeGuidance {
  const zh = locale === "zh";
  const phase = homeDayPhase(hour);
  const actions = homeGuidanceActions(snapshot, hour, locale);
  const sleepMinutes = snapshot.sleep?.sleep_duration_minutes;
  const steps = snapshot.exercise?.steps;

  if (sleepMinutes != null && sleepMinutes < 360) {
    return {
      phase,
      reason: "sleep_low",
      eyebrow: zh ? "恢复优先" : "Recovery first",
      message: zh ? `昨晚睡了 ${Math.floor(sleepMinutes / 60)} 小时 ${sleepMinutes % 60} 分，今天放慢节奏。` : `You slept ${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m. Keep today's pace gentle.`,
      motion: "sleep",
      actions,
    };
  }

  if ((snapshot.rhythmAnomalyCount ?? 0) > 0 && snapshot.nextAction.trim()) {
    return { phase, reason: "rhythm_signal", eyebrow: zh ? "今日节律提示" : "Rhythm signal", message: snapshot.nextAction.trim(), motion: "tail", actions };
  }

  if (hour >= 17 && (steps == null || steps < 3_000)) {
    const message = steps == null
      ? (zh ? "步数尚未同步，感觉合适时轻走 10 分钟。" : "Steps have not synced. Try a gentle 10-minute walk if it feels right.")
      : (zh ? `今天 ${steps.toLocaleString()} 步，感觉合适时轻走 10 分钟。` : `${steps.toLocaleString()} steps today. Try a gentle 10-minute walk if it feels right.`);
    return { phase, reason: "movement_low", eyebrow: zh ? "傍晚活动提示" : "Evening movement", message, motion: "lift", actions };
  }

  if (snapshot.focusMinutes >= 25) {
    return { phase, reason: "focus_complete", eyebrow: zh ? "专注完成" : "Focus completed", message: zh ? `已专注 ${Math.round(snapshot.focusMinutes)} 分钟，休息一下吧！` : `${Math.round(snapshot.focusMinutes)} focus minutes complete. Take a short reset.`, motion: "wave", actions };
  }

  if (hour >= 10 && snapshot.focusMinutes < 25) {
    return { phase, reason: "focus_missing", eyebrow: zh ? "下一步建议" : "Suggested next step", message: zh ? "先专注 25 分钟，完成最重要的事。" : "Start with 25 minutes on today's most important task.", motion: "read", actions };
  }

  if (phase === "night") {
    return { phase, reason: "wind_down", eyebrow: zh ? "夜间节律" : "Night rhythm", message: zh ? "慢慢放下屏幕，给睡眠留段安静时间。" : "Ease away from screens and leave a quiet transition into sleep.", motion: "sleep", actions };
  }

  const phaseMessage = phase === "dawn"
    ? (zh ? "先感受身体状态，再安排第一个小目标。" : "Check how you feel, then choose the first small goal.")
    : phase === "evening"
      ? (zh ? "回看今天的记录，再决定休息还是轻量活动。" : "Review today's records, then choose rest or light activity.")
      : (zh ? "今天状态平稳，再补齐一项记录吧。" : "Today's state looks steady. Add one more record.");
  return { phase, reason: "steady", eyebrow: zh ? "NAVA 今日建议" : "NAVA today", message: phaseMessage, motion: phase === "dawn" ? "wave" : phase === "evening" ? "tail" : "read", actions };
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
