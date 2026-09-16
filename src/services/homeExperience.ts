import type { TodaySnapshot, TrendBundle } from "../types";
import type { MascotMotion } from "./mascotMotion";

export type CalendarCell = {
  date: string | null;
  day: number | null;
};

export type YearHeatmapCell = {
  date: string;
  day: number;
  inYear: boolean;
};

export type YearHeatmapMonthLabel = {
  month: number;
  weekIndex: number;
};

export type YearHeatmap = {
  weeks: YearHeatmapCell[][];
  monthLabels: YearHeatmapMonthLabel[];
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

type LocalizedGuidanceVariants = {
  zh: string[];
  en: string[];
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

function pickGuidanceVariant(variants: LocalizedGuidanceVariants, locale: "zh" | "en", variantSeed: number) {
  const choices = variants[locale];
  const safeSeed = Number.isFinite(variantSeed) ? Math.abs(Math.trunc(variantSeed)) : 0;
  return choices[safeSeed % choices.length];
}

function completedFocusMessage(phase: HomeDayPhase, minutes: number, locale: "zh" | "en", variantSeed: number) {
  const minuteLabel = Math.round(minutes);
  const variants: Record<HomeDayPhase, LocalizedGuidanceVariants> = {
    dawn: {
      zh: [
        `已专注 ${minuteLabel} 分钟，伸个懒腰吧！`,
        `专注了 ${minuteLabel} 分钟，喝口水醒醒神。`,
        `${minuteLabel} 分钟完成，看看窗外放松下。`,
      ],
      en: [
        `${minuteLabel} focus minutes done. Take a gentle stretch.`,
        `${minuteLabel} minutes focused. Have some water.`,
        `${minuteLabel} minutes done. Rest your eyes by the window.`,
      ],
    },
    day: {
      zh: [
        `已专注 ${minuteLabel} 分钟，起来走一走吧！`,
        `${minuteLabel} 分钟完成，休息片刻再出发。`,
        `专注了 ${minuteLabel} 分钟，喝口水放松下。`,
      ],
      en: [
        `${minuteLabel} focus minutes done. Stand up and walk a little.`,
        `${minuteLabel} minutes complete. Pause before the next task.`,
        `${minuteLabel} minutes focused. Take a water break.`,
      ],
    },
    evening: {
      zh: [
        `已专注 ${minuteLabel} 分钟，活动一下肩颈。`,
        `${minuteLabel} 分钟完成，给自己一点缓冲。`,
        `专注了 ${minuteLabel} 分钟，起来走两分钟。`,
      ],
      en: [
        `${minuteLabel} focus minutes done. Loosen your shoulders.`,
        `${minuteLabel} minutes complete. Give yourself a pause.`,
        `${minuteLabel} minutes focused. Walk around for two minutes.`,
      ],
    },
    night: {
      zh: [
        `已专注 ${minuteLabel} 分钟，准备收尾休息。`,
        `${minuteLabel} 分钟完成，让眼睛歇一会儿。`,
        `专注了 ${minuteLabel} 分钟，放下屏幕缓缓。`,
      ],
      en: [
        `${minuteLabel} focus minutes done. Wind down for the night.`,
        `${minuteLabel} minutes complete. Rest your eyes and mind.`,
        `${minuteLabel} minutes focused. Step away from the screen.`,
      ],
    },
  };
  return pickGuidanceVariant(variants[phase], locale, variantSeed);
}

function focusPromptMessage(phase: HomeDayPhase, locale: "zh" | "en", variantSeed: number) {
  const variants: Record<HomeDayPhase, LocalizedGuidanceVariants> = {
    dawn: {
      zh: ["选一件小事，轻轻开启今天。", "从十分钟开始，先找到节奏。", "写下第一步，慢慢进入状态。"],
      en: ["Choose one small thing to begin the day.", "Start with ten minutes and find your rhythm.", "Write down the first step and ease into it."],
    },
    day: {
      zh: ["先专注 25 分钟，完成最重要的事。", "挑一件要紧的事，安静做 25 分钟。", "关掉一点干扰，专注完成一个小目标。"],
      en: ["Start with 25 minutes on the most important task.", "Pick one priority and give it 25 quiet minutes.", "Reduce one distraction and finish a small goal."],
    },
    evening: {
      zh: ["还想推进的话，专注 25 分钟就好。", "选个小目标，用 25 分钟收个尾。", "先做最重要的一步，再安心休息。"],
      en: ["If you want to continue, keep it to 25 minutes.", "Choose a small goal and wrap it up in 25 minutes.", "Do the most important next step, then rest."],
    },
    night: {
      zh: ["今天先到这里，给睡眠留点安静。", "慢慢放下屏幕，让大脑准备休息。", "把明天的事记下，今晚安心收尾。"],
      en: ["Call it a day and leave some quiet for sleep.", "Ease away from the screen and prepare to rest.", "Note tomorrow's task, then wind down tonight."],
    },
  };
  return pickGuidanceVariant(variants[phase], locale, variantSeed);
}

function steadyMessage(phase: HomeDayPhase, locale: "zh" | "en", variantSeed: number) {
  const variants: Record<HomeDayPhase, LocalizedGuidanceVariants> = {
    dawn: {
      zh: ["早上好，先感受一下今天的状态。", "新的一天，先喝口水再出发。", "慢慢醒来，给今天定个小目标。"],
      en: ["Good morning. Check in with how you feel.", "A new day—start with a little water.", "Wake gently and choose one small goal."],
    },
    day: {
      zh: ["今天状态平稳，再补齐一项记录吧。", "给自己一分钟，看看现在感觉如何。", "节奏不错，记下此刻的状态吧。"],
      en: ["Today's rhythm looks steady. Add one record.", "Take a minute to notice how you feel now.", "Your rhythm looks good. Save this moment."],
    },
    evening: {
      zh: ["回看今天，再决定休息还是轻量活动。", "傍晚啦，给今天的状态做个小结。", "忙了一天，留一点时间照顾自己。"],
      en: ["Review today, then choose rest or light activity.", "It's evening. Take a moment to check in.", "After a busy day, leave some time for yourself."],
    },
    night: {
      zh: ["慢慢放下屏幕，给睡眠留点安静。", "夜深了，让今天在安静里收尾。", "把节奏放慢一点，准备好好休息。"],
      en: ["Ease away from screens and leave quiet for sleep.", "It's late. Let the day end quietly.", "Slow the pace and get ready for good rest."],
    },
  };
  return pickGuidanceVariant(variants[phase], locale, variantSeed);
}

export function buildHomeGuidance(snapshot: TodaySnapshot, hour: number, locale: "zh" | "en" = "zh", variantSeed = 0): HomeGuidance {
  const zh = locale === "zh";
  const phase = homeDayPhase(hour);
  const actions = homeGuidanceActions(snapshot, hour, locale);
  const sleepMinutes = snapshot.sleep?.sleep_duration_minutes;
  const steps = snapshot.exercise?.steps;

  if (sleepMinutes != null && sleepMinutes < 360) {
    const slept = zh ? `${Math.floor(sleepMinutes / 60)} 小时 ${sleepMinutes % 60} 分` : `${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m`;
    const message = pickGuidanceVariant({
      zh: [`昨晚睡了 ${slept}，今天先照顾恢复。`, `睡眠 ${slept}，今天把节奏放缓些。`, `昨晚休息 ${slept}，多给自己一点缓冲。`],
      en: [`You slept ${slept}. Put recovery first today.`, `${slept} of sleep. Keep today's pace gentle.`, `You rested ${slept}. Leave yourself more breathing room.`],
    }, locale, variantSeed);
    return {
      phase,
      reason: "sleep_low",
      eyebrow: zh ? "恢复优先" : "Recovery first",
      message,
      motion: "sleep",
      actions,
    };
  }

  if ((snapshot.rhythmAnomalyCount ?? 0) > 0 && snapshot.nextAction.trim()) {
    return { phase, reason: "rhythm_signal", eyebrow: zh ? "今日节律提示" : "Rhythm signal", message: snapshot.nextAction.trim(), motion: "tail", actions };
  }

  if (hour >= 17 && (steps == null || steps < 3_000)) {
    const stepLabel = steps == null ? null : steps.toLocaleString();
    const message = steps == null
      ? pickGuidanceVariant({
        zh: ["步数还没同步，适合时轻走十分钟。", "今天活动还没记录，起来舒展一下吧。", "动一动肩颈，再轻松走一小段。"],
        en: ["Steps have not synced. Try a gentle ten-minute walk.", "Activity is not recorded yet. Stand up and stretch.", "Loosen your shoulders, then take a short walk."],
      }, locale, variantSeed)
      : pickGuidanceVariant({
        zh: [`今天 ${stepLabel} 步，适合时轻走十分钟。`, `已经走了 ${stepLabel} 步，再舒展一下吧。`, `今天 ${stepLabel} 步，起来活动两分钟。`],
        en: [`${stepLabel} steps today. Try a gentle ten-minute walk.`, `${stepLabel} steps so far. Take a brief stretch.`, `${stepLabel} steps today. Move around for two minutes.`],
      }, locale, variantSeed);
    return { phase, reason: "movement_low", eyebrow: zh ? "傍晚活动提示" : "Evening movement", message, motion: "lift", actions };
  }

  if (snapshot.focusMinutes >= 25) {
    return { phase, reason: "focus_complete", eyebrow: zh ? "专注完成" : "Focus completed", message: completedFocusMessage(phase, snapshot.focusMinutes, locale, variantSeed), motion: "wave", actions };
  }

  if (phase === "night") {
    return { phase, reason: "wind_down", eyebrow: zh ? "夜间节律" : "Night rhythm", message: steadyMessage("night", locale, variantSeed), motion: "sleep", actions };
  }

  if (hour >= 10 && snapshot.focusMinutes < 25) {
    return { phase, reason: "focus_missing", eyebrow: zh ? "下一步建议" : "Suggested next step", message: focusPromptMessage(phase, locale, variantSeed), motion: "read", actions };
  }

  return { phase, reason: "steady", eyebrow: zh ? "NAVA 今日建议" : "NAVA today", message: steadyMessage(phase, locale, variantSeed), motion: phase === "dawn" ? "wave" : phase === "evening" ? "tail" : "read", actions };
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
  // Keep complete weeks, but never reserve an entirely empty trailing week.
  const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - leading + 1;
    if (day < 1 || day > daysInMonth) return { date: null, day: null };
    return { date: `${month}-${pad(day)}`, day };
  });
}

function isoDateUtc(value: Date) {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** Build a Monday-first, whole-week grid that contains every day in the year. */
export function buildYearHeatmap(year: number): YearHeatmap {
  const normalizedYear = Number.isFinite(year) ? Math.trunc(year) : new Date().getFullYear();
  const firstDay = new Date(Date.UTC(normalizedYear, 0, 1));
  const lastDay = new Date(Date.UTC(normalizedYear, 11, 31));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const sundayOffset = (7 - lastDay.getUTCDay()) % 7;
  const end = new Date(lastDay);
  end.setUTCDate(end.getUTCDate() + sundayOffset);
  const weekCount = Math.round((end.getTime() - start.getTime()) / 604_800_000) + 1;
  const weeks = Array.from({ length: weekCount }, (_, weekIndex) => Array.from({ length: 7 }, (_, dayIndex) => {
    const value = new Date(start);
    value.setUTCDate(value.getUTCDate() + weekIndex * 7 + dayIndex);
    return {
      date: isoDateUtc(value),
      day: value.getUTCDate(),
      inYear: value.getUTCFullYear() === normalizedYear,
    };
  }));
  const monthLabels = Array.from({ length: 12 }, (_, month) => {
    const monthStart = new Date(Date.UTC(normalizedYear, month, 1));
    return {
      month: month + 1,
      weekIndex: Math.floor((monthStart.getTime() - start.getTime()) / 604_800_000),
    };
  });
  return { weeks, monthLabels };
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

const metricNumber = (value: number | null | undefined) => value == null ? "--" : String(Math.round(value));

export function dailyMetrics(snapshot: TodaySnapshot, locale: "zh" | "en" = "zh"): DailyMetric[] {
  const copy = <T,>(zh: T, en: T) => locale === "zh" ? zh : en;
  const sleepScore = snapshot.sleep?.rhythm_score != null
    ? Number(snapshot.sleep.rhythm_score)
    : snapshot.sleep?.self_rating != null
      ? Number(snapshot.sleep.self_rating) * 20
      : snapshot.sleep?.sleep_duration_minutes != null
        ? Math.round(clamp(100 - Math.abs(snapshot.sleep.sleep_duration_minutes - 480) / 4.8, 0, 100))
        : null;
  const exerciseScore = snapshot.exercise?.steps != null && snapshot.exercise.exercise_minutes != null
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
      secondary: snapshot.exercise ? `${metricNumber(snapshot.exercise.exercise_minutes)}${copy(" 分钟", " min")} · ${metricNumber(snapshot.exercise.calories)} kcal` : copy("暂无运动记录", "No activity record"),
    },
    {
      key: "diet",
      recorded: Boolean(snapshot.nutrition),
      score: dietScore,
      primary: snapshot.nutrition ? `${metricNumber(snapshot.nutrition.total_calories)} kcal` : "--",
      secondary: snapshot.nutrition ? `${copy("蛋白", "Protein")} ${metricNumber(snapshot.nutrition.protein_grams)}g · ${copy("饮水", "Water")} ${metricNumber(snapshot.nutrition.hydration_ml)}ml` : copy("暂无饮食记录", "No diet record"),
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
