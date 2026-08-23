import {
  refreshRhythmScore,
  saveExerciseRecord,
  saveFocusSession,
  saveMoodRecord,
  saveNutritionRecord,
  saveSleepRecord,
} from "./records";
import { addTodo } from "./productivity";

export type StructuredEntryType = "mood" | "sleep" | "exercise" | "nutrition" | "focus" | "todo";

export type StructuredEntry = {
  id: string;
  type: StructuredEntryType;
  title: string;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  payload: Record<string, unknown>;
  confidence: number;
};

const moodWords: Array<[RegExp, number]> = [
  [/开心|愉快|兴奋|很好|happy|great/i, 85],
  [/平静|稳定|一般|calm|steady|okay/i, 68],
  [/焦虑|压力|烦|难过|低落|anxious|stress|sad/i, 38],
];

function numberMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? Number(match[1].replace(/,/g, "")) : undefined;
}

function timeMatches(text: string) {
  return [...text.matchAll(/(?:凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})(?:[:：点时]\s*(\d{1,2}))?/g)]
    .map((match) => `${String(Math.min(23, Number(match[1]))).padStart(2, "0")}:${String(Math.min(59, Number(match[2] ?? 0))).padStart(2, "0")}`)
    .slice(0, 2);
}

function sleepMinutes(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
}

function title(type: StructuredEntryType, locale: "zh" | "en") {
  const labels = locale === "zh"
    ? { mood: "情绪记录", sleep: "睡眠记录", exercise: "运动记录", nutrition: "饮食记录", focus: "专注记录", todo: "待办事项" }
    : { mood: "Mood record", sleep: "Sleep record", exercise: "Activity record", nutrition: "Meal record", focus: "Focus record", todo: "To-do" };
  return labels[type];
}

function entry(type: StructuredEntryType, locale: "zh" | "en", summary: string, fields: StructuredEntry["fields"], payload: Record<string, unknown>, confidence = 0.86): StructuredEntry {
  return { id: crypto.randomUUID(), type, title: title(type, locale), summary, fields, payload, confidence };
}

export function parseStructuredEntry(text: string, locale: "zh" | "en"): StructuredEntry | null {
  const value = text.trim();
  if (!value) return null;

  if (/待办|提醒我|记得要|todo|remind me/i.test(value)) {
    const todoTitle = value.replace(/^(请)?(帮我)?(添加|记录|新建)?(一个)?(今日|今天|明天)?(待办事项|待办|提醒我)[:：,，\s]*/i, "").trim() || value;
    return entry("todo", locale, todoTitle, [{ label: locale === "zh" ? "事项" : "Task", value: todoTitle }], { title: todoTitle });
  }

  if (/睡|醒|起床|入睡|sleep|bed|woke/i.test(value)) {
    const times = timeMatches(value);
    if (times.length >= 2) {
      const durationMinutes = sleepMinutes(times[0], times[1]);
      return entry("sleep", locale, value, [
        { label: locale === "zh" ? "入睡" : "Bedtime", value: times[0] },
        { label: locale === "zh" ? "醒来" : "Wake", value: times[1] },
        { label: locale === "zh" ? "时长" : "Duration", value: `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m` },
      ], { start: times[0], end: times[1], durationMinutes }, 0.9);
    }
  }

  if (/步|跑|运动|训练|骑行|exercise|steps|run|walk/i.test(value)) {
    const steps = numberMatch(value, /(\d[\d,]*)\s*步/i);
    const minutes = numberMatch(value, /(\d+)\s*(?:分钟|分|min(?:ute)?s?)/i);
    const calories = numberMatch(value, /(\d+)\s*(?:千卡|卡路里|kcal)/i);
    if (steps != null || minutes != null || calories != null) {
      const fields = [
        steps != null && { label: locale === "zh" ? "步数" : "Steps", value: steps.toLocaleString() },
        minutes != null && { label: locale === "zh" ? "运动" : "Activity", value: `${minutes} min` },
        calories != null && { label: locale === "zh" ? "消耗" : "Calories", value: `${calories} kcal` },
      ].filter(Boolean) as StructuredEntry["fields"];
      return entry("exercise", locale, value, fields, { steps: steps ?? 0, minutes: minutes ?? 0, calories: calories ?? 0 });
    }
  }

  if (/专注|学习|工作了|focus|studied|worked/i.test(value)) {
    const minutes = numberMatch(value, /(\d+)\s*(?:分钟|分|min(?:ute)?s?)/i);
    if (minutes != null) {
      const taskTitle = value.replace(/\d+\s*(?:分钟|分|min(?:ute)?s?)/i, "").replace(/专注|focus/gi, "").trim() || (locale === "zh" ? "专注任务" : "Focus task");
      return entry("focus", locale, value, [
        { label: locale === "zh" ? "任务" : "Task", value: taskTitle },
        { label: locale === "zh" ? "时长" : "Duration", value: `${minutes} min` },
      ], { taskTitle, minutes });
    }
  }

  if (/吃|早餐|午餐|晚餐|加餐|咖啡|饮食|ate|breakfast|lunch|dinner|coffee/i.test(value)) {
    const calories = numberMatch(value, /(\d+)\s*(?:千卡|卡路里|kcal)/i) ?? 0;
    const meal = /早餐|breakfast/i.test(value) ? "breakfast" : /午餐|lunch/i.test(value) ? "lunch" : /晚餐|dinner/i.test(value) ? "dinner" : "pantry";
    return entry("nutrition", locale, value, [
      { label: locale === "zh" ? "餐次" : "Meal", value: meal },
      { label: locale === "zh" ? "内容" : "Food", value },
    ], { meal, name: value, calories });
  }

  if (/情绪|心情|压力|焦虑|开心|平静|难过|mood|stress|anxious|happy|calm/i.test(value)) {
    const explicit = numberMatch(value, /(?:情绪|心情|mood)?\s*(\d{1,3})\s*(?:分|\/100)?/i);
    const inferred = moodWords.find(([pattern]) => pattern.test(value))?.[1] ?? 60;
    const score = Math.max(0, Math.min(100, explicit ?? inferred));
    return entry("mood", locale, value, [
      { label: locale === "zh" ? "强度" : "Score", value: `${score}/100` },
      { label: locale === "zh" ? "描述" : "Note", value },
    ], { moodScore: score, factors: [], diary: value });
  }

  return null;
}

export async function confirmStructuredEntry(userId: string, candidate: StructuredEntry) {
  const data = candidate.payload;
  if (candidate.type === "todo") return addTodo(userId, String(data.title ?? candidate.summary), "ai");
  if (candidate.type === "mood") await saveMoodRecord({
    userId,
    moodScore: Number(data.moodScore),
    factors: Array.isArray(data.factors) ? data.factors as string[] : [],
    diary: String(data.diary ?? ""),
  });
  if (candidate.type === "sleep") await saveSleepRecord({ userId, start: String(data.start), end: String(data.end), durationMinutes: Number(data.durationMinutes), source: "manual" });
  if (candidate.type === "exercise") await saveExerciseRecord({ userId, steps: Number(data.steps ?? 0), calories: Number(data.calories ?? 0), minutes: Number(data.minutes ?? 0), source: "manual" });
  if (candidate.type === "nutrition") await saveNutritionRecord({ userId, meal: data.meal as "breakfast" | "lunch" | "dinner" | "pantry", item: { name: String(data.name), calories: Number(data.calories ?? 0) }, totalCalories: Number(data.calories ?? 0) });
  if (candidate.type === "focus") await saveFocusSession({ userId, taskTitle: String(data.taskTitle), minutes: Number(data.minutes) });
  try {
    await refreshRhythmScore();
  } catch (error) {
    console.warn("Rhythm refresh deferred after structured entry", error);
  }
  return candidate;
}
