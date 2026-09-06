import type { ExerciseRecord, MoodRecord, SleepRecord, TodaySnapshot, TrendBundle } from "../types";
import type { NavaNotificationItem } from "./notifications";

export interface ContextualNotificationDraft extends Omit<NavaNotificationItem, "createdAt" | "source"> {
  hour: number;
  priority: number;
}

function hasCompleteMood(snapshot: TodaySnapshot) {
  return Boolean(snapshot.mood && snapshot.mood.factors.length > 0 && snapshot.mood.diary_content?.trim());
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function recentThroughDate<T extends { record_date: string }>(records: T[] | undefined, date: string, limit: number) {
  return [...(records ?? [])]
    .filter((record) => record.record_date <= date)
    .sort((left, right) => left.record_date.localeCompare(right.record_date))
    .slice(-limit);
}

function minutesAfterMidnight(time: string | null | undefined) {
  if (!time || !/^\d{2}:\d{2}/.test(time)) return null;
  const [rawHour, minute] = time.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(rawHour) || !Number.isFinite(minute)) return null;
  return rawHour * 60 + minute;
}

function isLateSleep(record: SleepRecord) {
  const minutes = minutesAfterMidnight(record.sleep_start);
  return minutes != null && minutes >= 30 && minutes <= 5 * 60;
}

function isLowMood(record: MoodRecord) {
  return Number(record.mood_score) <= 40;
}

function activityLoad(record: ExerciseRecord) {
  return Math.max(0, Number(record.exercise_minutes) || 0) + Math.max(0, Number(record.steps) || 0) / 500;
}

export function buildContextualNotificationDrafts(
  snapshot: TodaySnapshot,
  hour: number,
  locale: "zh" | "en" = "zh",
  trends?: Pick<TrendBundle, "moods" | "sleeps" | "exercises" | "nutritions" | "faces">,
): ContextualNotificationDraft[] {
  const zh = locale === "zh";
  const drafts: ContextualNotificationDraft[] = [];
  const add = (draft: ContextualNotificationDraft) => drafts.push(draft);

  const recentMoods = recentThroughDate(trends?.moods, snapshot.date, 3);
  const recentSleeps = recentThroughDate(trends?.sleeps, snapshot.date, 3);
  const recentExercises = recentThroughDate(trends?.exercises, snapshot.date, 8);
  const recentNutritions = recentThroughDate(trends?.nutritions, snapshot.date, 8);
  const recentFaces = recentThroughDate(trends?.faces, snapshot.date, 3);
  const previousExerciseLoads = recentExercises.filter((record) => record.record_date !== snapshot.date).map(activityLoad).filter((value) => value > 0);
  const currentExerciseLoad = snapshot.exercise ? activityLoad(snapshot.exercise) : 0;
  const priorActivityAverage = average(previousExerciseLoads);
  const mealCount = snapshot.nutrition
    ? [snapshot.nutrition.breakfast_time, snapshot.nutrition.lunch_time, snapshot.nutrition.dinner_time, snapshot.nutrition.pantry_time].filter(Boolean).length
    : 0;
  const previousCalorieValues = recentNutritions
    .filter((record) => record.record_date !== snapshot.date)
    .map((record) => Number(record.total_calories))
    .filter((value) => value > 0);
  const priorCalorieAverage = average(previousCalorieValues);

  if (hour >= 9 && !snapshot.sleep) add({ id: `context:${snapshot.date}:sleep`, category: "sleep", hour: 9, priority: 62, title: zh ? "补充昨晚睡眠" : "Add last night's sleep", body: zh ? "补充一条睡眠记录，今天的节律建议会更准确。" : "Add one sleep record to improve today's rhythm guidance.", target: { tab: "record", module: "sleep", view: "editor" } });
  if (hour >= 12 && !snapshot.nutrition) add({ id: `context:${snapshot.date}:nutrition`, category: "nutrition", hour: 12, priority: 58, title: zh ? "别忘了记录一餐" : "Remember a meal", body: zh ? "拍照或手动补充饮食，之后还能和活动消耗一起查看。" : "Capture or add a meal to compare it with activity.", target: { tab: "record", module: "diet", view: "editor" } });
  if (hour >= 20 && snapshot.nutrition && mealCount > 0 && mealCount < 2) add({ id: `context:${snapshot.date}:nutrition-gap`, category: "nutrition", hour: 20, priority: 54, title: zh ? "今天的饮食记录还不完整" : "Today's meal log is incomplete", body: zh ? "如果还有一餐未记，现在补上就能形成更完整的今日记录。" : "Add any missing meal to complete today's record.", target: { tab: "record", module: "diet", view: "editor" } });

  const sleptShort = snapshot.sleep?.sleep_duration_minutes != null && snapshot.sleep.sleep_duration_minutes < 360;
  const moodLow = snapshot.mood != null && isLowMood(snapshot.mood);
  if (hour >= 17 && (!snapshot.exercise || (snapshot.exercise.steps ?? 0) < 3_000)) {
    const recoveryDay = sleptShort || moodLow;
    add({
      id: `context:${snapshot.date}:exercise`, category: "exercise", hour: 17, priority: recoveryDay ? 75 : 52,
      title: recoveryDay ? (zh ? "今天更适合轻量活动" : "Keep movement gentle today") : (zh ? "今天动得有点少" : "A little more movement"),
      body: recoveryDay ? (zh ? "结合今天已记录的状态，先舒展或慢走 10 分钟，不必追求强度。" : "Based on today's recorded state, start with 10 minutes of mobility or an easy walk.") : (zh ? "如果身体感觉合适，可以安排 10 分钟轻步行。" : "If it feels right, consider a gentle 10-minute walk."),
      target: { tab: "record", module: "exercise", view: "sports" },
    });
  }
  if (hour >= 18 && !hasCompleteMood(snapshot)) add({ id: `context:${snapshot.date}:mood`, category: "mood", hour: 18, priority: 56, title: zh ? "给今天的心情留句话" : "Check in with your mood", body: zh ? "选一个感受和主要原因，完成今天的情绪记录。" : "Choose a feeling and its main factor to complete today.", target: { tab: "record", module: "mood", view: "editor" } });
  if (hour >= 10 && snapshot.focusMinutes < 25) add({ id: `context:${snapshot.date}:focus`, category: "focus", hour: 10, priority: 60, title: zh ? "安排一个专注块" : "Plan a focus block", body: sleptShort ? (zh ? "今天先从 10 分钟轻任务开始，完成后再决定是否继续。" : "Start with a light 10-minute task, then decide whether to continue.") : (zh ? "从 25 分钟开始，让今天的节律更稳定。" : "Start with 25 minutes to steady today's rhythm."), target: { tab: "record", module: "focus", view: null } });
  if (hour >= 14 && sleptShort && snapshot.focusMinutes < 25) add({ id: `context:${snapshot.date}:sleep-focus`, category: "focus", hour: 14, priority: 82, title: zh ? "把今天的第一段专注放轻一点" : "Make the first focus block lighter", body: zh ? "根据今天已记录的状态，建议先做 10 分钟明确的小任务。" : "Based on today's recorded state, begin with one clear 10-minute task.", target: { tab: "record", module: "focus", view: null } });
  if (hour >= 20 && !snapshot.face) add({ id: `context:${snapshot.date}:face`, category: "face", hour: 20, priority: 38, title: zh ? "记录今天的面部状态" : "Capture today's face status", body: zh ? "如果方便，可以补一条非诊断的趋势记录。" : "If convenient, add a non-diagnostic trend record.", target: { tab: "record", module: "face", view: "editor" } });
  if (hour >= 11 && (snapshot.rhythmAnomalyCount ?? 0) > 0 && snapshot.nextAction.trim()) add({ id: `context:${snapshot.date}:rhythm`, category: "system", hour: 11, priority: 88, title: zh ? "今天有一项状态值得留意" : "One signal deserves attention", body: snapshot.nextAction, target: { tab: "record" } });

  if (hour >= 18 && recentMoods.length === 3 && recentMoods.every(isLowMood)) add({ id: `context:${snapshot.date}:mood-trend`, category: "mood", hour: 18, priority: 96, title: zh ? "最近的情绪记录持续偏低" : "Recent mood records remain low", body: zh ? "先降低任务负荷；如果这种状态持续或影响安全，请联系可信任的人或专业支持。" : "Reduce today's load, and seek trusted or professional support if this persists or affects safety.", target: { tab: "record", module: "mood", view: "history" } });
  if (hour >= 18 && recentMoods.length >= 2 && Math.abs(recentMoods[recentMoods.length - 1].mood_score - recentMoods[recentMoods.length - 2].mood_score) >= 35) add({ id: `context:${snapshot.date}:mood-change`, category: "mood", hour: 18, priority: 78, title: zh ? "最近两次情绪记录变化较大" : "Your last two mood entries changed notably", body: zh ? "可以补充主要事件或身体感受，帮助后续回看变化背景。" : "Add the main event or body feeling so the change has useful context.", target: { tab: "record", module: "mood", view: "editor" } });
  if (hour >= 20 && recentSleeps.length === 3 && recentSleeps.every(isLateSleep)) add({ id: `context:${snapshot.date}:sleep-late-trend`, category: "sleep", hour: 20, priority: 84, title: zh ? "最近的入睡节律有连续变化" : "Your recent sleep timing has shifted", body: zh ? "今晚可以先提前 20 分钟进入放松阶段，再观察几天变化。" : "Try starting wind-down 20 minutes earlier tonight and watch the next few days.", target: { tab: "record", module: "sleep", view: "history" } });
  if (hour >= 18 && snapshot.exercise && priorActivityAverage != null && previousExerciseLoads.length >= 3 && currentExerciseLoad > priorActivityAverage * 1.6 && currentExerciseLoad - priorActivityAverage >= 20) add({ id: `context:${snapshot.date}:exercise-load`, category: "exercise", hour: 18, priority: 90, title: zh ? "今天的活动量明显高于个人近期水平" : "Today's activity is above your recent level", body: zh ? "接下来优先补水、放松与恢复；如果出现不适，请停止运动。" : "Prioritize hydration, mobility, and recovery; stop if you feel unwell.", target: { tab: "record", module: "exercise", view: "sports" } });
  if (hour >= 21 && snapshot.nutrition && mealCount >= 2 && priorCalorieAverage != null && previousCalorieValues.length >= 3 && (snapshot.nutrition.total_calories > priorCalorieAverage * 1.45 + 200 || snapshot.nutrition.total_calories < priorCalorieAverage * .55 - 150)) add({ id: `context:${snapshot.date}:nutrition-change`, category: "nutrition", hour: 21, priority: 70, title: zh ? "今天的饮食记录与个人近期差异较大" : "Today's meal log differs from your recent entries", body: zh ? "先核对餐次、份量和是否漏记；确认无误后再结合身体感受回看。" : "First check meals, portions, and omissions; then review alongside how you feel.", target: { tab: "record", module: "diet", view: "editor" } });
  if (hour >= 20 && recentFaces.length === 3) {
    const scores = recentFaces.map((record) => record.overall_score).filter((value): value is number => value != null);
    if (scores.length === 3 && (scores.every((score) => score <= 50) || scores[2] <= scores[0] - 12)) add({ id: `context:${snapshot.date}:face-trend`, category: "face", hour: 20, priority: 68, title: zh ? "最近的面部状态记录有连续变化" : "Recent face-state entries show a change", body: zh ? "先核对拍摄条件，再结合睡眠与情绪记录查看趋势；这不是诊断。" : "Check capture conditions, then compare sleep and mood trends. This is not a diagnosis.", target: { tab: "record", module: "face", view: "history" } });
  }

  return drafts.sort((left, right) => right.priority - left.priority || right.hour - left.hour).slice(0, 6);
}
