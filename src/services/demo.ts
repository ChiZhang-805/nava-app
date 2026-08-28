import type { User } from "@supabase/supabase-js";
import { todayISO } from "./date";
import type { ChatMessage, DailyRhythmScore, ExerciseRecord, FaceRecord, FocusRecord, FocusTimeDistribution, FoodItem, HealthMetricSnapshot, MoodRecord, NutritionRecord, SleepRecord, TodaySnapshot, TrendBundle } from "../types";
import type { UserProfile } from "./profile";

const DEMO_SESSION_KEY = "nava.review.demo.auth.v1";
const DEMO_MOOD_HISTORY_KEY = "nava.review.demo.mood-history.v1";
const DEMO_RECORDS_KEY = "nava.review.demo.records.v1";

export function isDemoMode() {
  if (typeof window === "undefined") return false;
  const reviewDemoEnabled = import.meta.env.VITE_ENABLE_REVIEW_DEMO === "true";
  if (!import.meta.env.DEV && !reviewDemoEnabled) return false;
  const demoParam = new URLSearchParams(window.location.search).get("demo");
  if (demoParam === "0") return false;
  if (demoParam === "1") return true;
  return reviewDemoEnabled;
}

export function hasDemoAuthSession() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "signed-in";
}

export function startDemoAuthSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DEMO_SESSION_KEY, "signed-in");
}

export function clearDemoAuthSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(DEMO_SESSION_KEY);
}

export function isDemoLoginCredential(account: string, password: string) {
  return account.trim().length > 0 && password.length >= 6;
}

export function isDemoOtpCode(code: string, expectedLength = 8) {
  return new RegExp(`^\\d{${expectedLength}}$`).test(code.trim());
}

export const demoUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "local-demo@nava.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: { full_name: "NAVA 用户" },
  created_at: new Date().toISOString(),
} as User;

export const demoMood: MoodRecord = {
  id: "demo-mood",
  record_date: todayISO(),
  mood_score: 76,
  factors: ["睡眠", "工作", "运动"],
  diary_content: "上午压力偏高，午后步行后状态恢复。",
  ai_feedback: "今天情绪波动主要来自工作压力，轻运动有帮助。",
  diary_sentiment: 0.72,
};

const demoMoodSeed = [
  { score: 68, factors: ["睡眠", "压力"], diary: "睡眠偏短，上午进入状态较慢。" },
  { score: 74, factors: ["运动", "天气"], diary: "午后散步后，精神状态明显恢复。" },
  { score: 61, factors: ["工作", "压力"], diary: "项目节点集中，傍晚略感疲惫。" },
  { score: 82, factors: ["睡眠", "社交"], diary: "休息充分，交流过程轻松。" },
  { score: 77, factors: ["饮食", "运动"], diary: "饮食规律，晚间运动后情绪平稳。" },
  { score: 71, factors: ["工作", "身体不适"], diary: "久坐后有些不适，休息后缓解。" },
  { score: 76, factors: ["睡眠", "工作", "运动"], diary: "上午压力偏高，午后步行后状态恢复。" },
] as const;

function dateOffsetISO(endDate: string, offset: number) {
  const date = new Date(`${endDate}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function readDemoMoodOverrides() {
  if (typeof window === "undefined") return [] as MoodRecord[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEMO_MOOD_HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as MoodRecord[] : [];
  } catch {
    return [] as MoodRecord[];
  }
}

export function demoMoodHistory(endDate = todayISO()): MoodRecord[] {
  const overrides = new Map(readDemoMoodOverrides().map((record) => [record.record_date, record]));
  return demoMoodSeed.map((seed, index) => {
    const recordDate = dateOffsetISO(endDate, index - (demoMoodSeed.length - 1));
    return overrides.get(recordDate) ?? {
      ...demoMood,
      id: `demo-mood-${recordDate}`,
      record_date: recordDate,
      mood_score: seed.score,
      factors: [...seed.factors],
      diary_content: seed.diary,
    };
  });
}

export function saveDemoMood(input: { date?: string; moodScore: number; factors: string[]; diary?: string }) {
  const recordDate = input.date ?? todayISO();
  const record: MoodRecord = {
    ...demoMood,
    id: `demo-mood-${recordDate}`,
    record_date: recordDate,
    mood_score: input.moodScore,
    factors: [...input.factors],
    diary_content: input.diary?.trim() || null,
  };
  if (typeof window !== "undefined") {
    const next = readDemoMoodOverrides().filter((item) => item.record_date !== recordDate);
    next.push(record);
    window.localStorage.setItem(DEMO_MOOD_HISTORY_KEY, JSON.stringify(next));
  }
  return record;
}

export const demoSleep: SleepRecord = {
  id: "demo-sleep",
  record_date: todayISO(),
  sleep_start: "23:20",
  sleep_end: "07:05",
  sleep_duration_minutes: 465,
  deep_sleep_minutes: 86,
  light_sleep_minutes: 284,
  rem_minutes: 95,
  self_rating: 4,
  rhythm_score: 84,
  ai_feedback: "入睡时间稳定，深睡比例接近理想区间。",
};

export const demoExercise: ExerciseRecord = {
  id: "demo-exercise",
  record_date: todayISO(),
  steps: 8420,
  calories: 486,
  exercise_minutes: 42,
  heart_rate: "88",
  spo2: "98%",
  self_rating: 4,
  ai_feedback: "今日活动量达标，建议晚间保持轻拉伸。",
};

export const demoNutrition: NutritionRecord = {
  id: "demo-nutrition",
  record_date: todayISO(),
  total_calories: 1680,
  protein_grams: 96,
  carbohydrate_grams: 184,
  fat_grams: 58,
  hydration_ml: 2100,
  breakfast_items: [{ name: "燕麦酸奶", calories: 360, amount: "1 碗" }],
  lunch_items: [{ name: "鸡胸肉沙拉", calories: 520, amount: "1 份" }],
  dinner_items: [{ name: "三文鱼糙米饭", calories: 620, amount: "1 份" }],
  pantry_items: [{ name: "坚果", calories: 180, amount: "30g" }],
  ai_feedback: "蛋白质摄入较好，晚餐碳水适中。",
};

type DemoRecordOverrides = {
  sleeps: Record<string, SleepRecord>;
  exercises: Record<string, ExerciseRecord>;
  nutritions: Record<string, NutritionRecord>;
  focus: Record<string, FocusRecord[]>;
  faces: Record<string, TodaySnapshot["face"]>;
};

function emptyDemoRecordOverrides(): DemoRecordOverrides {
  return { sleeps: {}, exercises: {}, nutritions: {}, focus: {}, faces: {} };
}

function readDemoRecordOverrides(): DemoRecordOverrides {
  if (typeof window === "undefined") return emptyDemoRecordOverrides();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEMO_RECORDS_KEY) ?? "{}") as Partial<DemoRecordOverrides>;
    return {
      sleeps: parsed.sleeps ?? {},
      exercises: parsed.exercises ?? {},
      nutritions: parsed.nutritions ?? {},
      focus: parsed.focus ?? {},
      faces: parsed.faces ?? {},
    };
  } catch {
    return emptyDemoRecordOverrides();
  }
}

function writeDemoRecordOverrides(records: DemoRecordOverrides) {
  if (typeof window !== "undefined") window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(records));
}

export function saveDemoSleep(input: {
  date?: string;
  start?: string;
  end?: string;
  durationMinutes: number;
  deepMinutes?: number;
  lightMinutes?: number;
  remMinutes?: number;
  rating?: number;
  source?: "manual" | "apple_watch";
}) {
  const date = input.date ?? todayISO();
  const record: SleepRecord = {
    ...demoSleep,
    id: `demo-sleep-${date}`,
    record_date: date,
    sleep_start: input.start ?? demoSleep.sleep_start,
    sleep_end: input.end ?? demoSleep.sleep_end,
    sleep_duration_minutes: input.durationMinutes,
    deep_sleep_minutes: input.deepMinutes ?? demoSleep.deep_sleep_minutes,
    light_sleep_minutes: input.lightMinutes ?? demoSleep.light_sleep_minutes,
    rem_minutes: input.remMinutes ?? demoSleep.rem_minutes,
    self_rating: input.rating ?? demoSleep.self_rating,
  };
  const records = readDemoRecordOverrides();
  records.sleeps[date] = record;
  writeDemoRecordOverrides(records);
  return record;
}

export function saveDemoExercise(input: {
  date?: string;
  steps: number;
  calories: number;
  minutes: number;
  heartRate?: string;
  spo2?: string;
  rating?: number;
  source?: "manual" | "apple_health";
}) {
  const date = input.date ?? todayISO();
  const record: ExerciseRecord = {
    ...demoExercise,
    id: `demo-exercise-${date}`,
    record_date: date,
    steps: input.steps,
    calories: input.calories,
    exercise_minutes: input.minutes,
    heart_rate: input.heartRate ?? demoExercise.heart_rate,
    spo2: input.spo2 ?? demoExercise.spo2,
    self_rating: input.rating ?? demoExercise.self_rating,
  };
  const records = readDemoRecordOverrides();
  records.exercises[date] = record;
  writeDemoRecordOverrides(records);
  return record;
}

export function saveDemoNutrition(input: {
  date?: string;
  meal: "breakfast" | "lunch" | "dinner" | "pantry";
  items: FoodItem[];
  totalCalories?: number;
  append?: boolean;
}) {
  const date = input.date ?? todayISO();
  const records = readDemoRecordOverrides();
  const current = records.nutritions[date] ?? { ...demoNutrition, id: `demo-nutrition-${date}`, record_date: date };
  const key = `${input.meal}_items` as "breakfast_items" | "lunch_items" | "dinner_items" | "pantry_items";
  const mealItems = input.append ? [...(current[key] ?? []), ...input.items] : input.items;
  const record = { ...current, [key]: mealItems } as NutritionRecord;
  const allItems = [record.breakfast_items, record.lunch_items, record.dinner_items, record.pantry_items]
    .flatMap((items) => items ?? []);
  record.total_calories = input.totalCalories ?? allItems.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
  records.nutritions[date] = record;
  writeDemoRecordOverrides(records);
  return record;
}

export function saveDemoFocus(input: { date?: string; minutes: number }) {
  const date = input.date ?? todayISO();
  const records = readDemoRecordOverrides();
  const current = records.focus[date] ?? [];
  const priorMinutes = current.length > 0
    ? current.reduce((sum, item) => sum + item.total_minutes, 0)
    : date === todayISO() ? 95 : 0;
  const priorSessions = current.length > 0
    ? current.reduce((sum, item) => sum + item.completed_sessions, 0)
    : date === todayISO() ? 4 : 0;
  const record: FocusRecord = {
    id: `demo-focus-${date}`,
    task_id: `demo-task-${date}`,
    record_date: date,
    completed_sessions: priorSessions + 1,
    total_minutes: priorMinutes + input.minutes,
  };
  records.focus[date] = [record];
  writeDemoRecordOverrides(records);
  return record;
}

export function saveDemoFace(date: string, face: NonNullable<TodaySnapshot["face"]>) {
  const records = readDemoRecordOverrides();
  records.faces[date] = face;
  writeDemoRecordOverrides(records);
  return face;
}

export function demoTodaySnapshot(date = todayISO()): TodaySnapshot {
  const overrides = readDemoRecordOverrides();
  const moodHistory = demoMoodHistory(date);
  const mood = moodHistory[moodHistory.length - 1] ?? demoMood;
  const focus = overrides.focus[date];
  return {
    date,
    mood,
    sleep: overrides.sleeps[date] ?? { ...demoSleep, record_date: date },
    exercise: overrides.exercises[date] ?? { ...demoExercise, record_date: date },
    nutrition: overrides.nutritions[date] ?? { ...demoNutrition, record_date: date },
    face: overrides.faces[date] ?? {
      id: "demo-face",
      record_date: date,
      image_path: null,
      overall_score: 82,
      skin_age: 27,
      annotations: [],
      feedback: "面部状态平稳。",
      model_version: "demo",
      capture_mode: "bare_face",
      analysis_confidence: 0.91,
    },
    focusMinutes: focus ? focus.reduce((sum, item) => sum + item.total_minutes, 0) : 95,
    focusSessions: focus ? focus.reduce((sum, item) => sum + item.completed_sessions, 0) : 4,
    rhythmScore: 83,
    rhythmConfidence: 0.88,
    rhythmScoreLower: 77,
    rhythmScoreUpper: 88,
    rhythmModelVersion: "nava-chronostate-v4.27-2026-07",
    rhythmDataQuality: 86,
    rhythmTrendSlope: 1.2,
    rhythmAnomalyCount: 0,
    nextAction: "今日节律保持稳定，晚间减少连续屏幕刺激，睡前留出安静的放松时间，并尽量在 23:30 前入睡。",
  };
}

export function demoTrends(): TrendBundle {
  const overrides = readDemoRecordOverrides();
  const moods = demoMoodHistory();
  const sleeps: SleepRecord[] = moods.map((mood, index) => overrides.sleeps[mood.record_date] ?? ({
    ...demoSleep,
    id: `demo-sleep-${index}`,
    record_date: mood.record_date,
    sleep_duration_minutes: 410 + (index % 5) * 18,
  }));
  const exercises: ExerciseRecord[] = moods.map((mood, index) => overrides.exercises[mood.record_date] ?? ({
    ...demoExercise,
    id: `demo-exercise-${index}`,
    record_date: mood.record_date,
    steps: 5200 + index * 310,
  }));
  const nutritions: NutritionRecord[] = moods.map((mood, index) => overrides.nutritions[mood.record_date] ?? ({
    ...demoNutrition,
    id: `demo-nutrition-${index}`,
    record_date: mood.record_date,
    total_calories: 1500 + (index % 4) * 120,
  }));
  const faces: FaceRecord[] = moods.map((mood, index) => overrides.faces[mood.record_date] ?? ({
    id: `demo-face-${index}`,
    record_date: mood.record_date,
    image_path: null,
    overall_score: [78, 81, 79, 83, 80, 82, 84][index],
    skin_age: 27,
    annotations: [],
    feedback: "面部状态整体平稳。",
    model_version: "demo",
    capture_mode: "bare_face",
    analysis_confidence: 0.88 + index * 0.01,
  }));
  const focus: FocusRecord[] = moods.flatMap((mood, index) => overrides.focus[mood.record_date] ?? [{
    id: `demo-focus-${index}`,
    task_id: `demo-task-${index}`,
    record_date: mood.record_date,
    completed_sessions: 1 + (index % 3),
    total_minutes: 25 + (index % 4) * 20,
  }]);
  const focusDistributions: FocusTimeDistribution[] = moods.map((mood, index) => ({
    id: `demo-focus-distribution-${index}`,
    record_date: mood.record_date,
    period_0_6: 0,
    period_6_12: 15 + (index % 3) * 10,
    period_12_18: 10 + (index % 4) * 8,
    period_18_24: 5 + (index % 2) * 10,
  }));
  const healthMetrics: HealthMetricSnapshot[] = moods.map((mood, index) => ({
    id: `demo-health-${index}`,
    record_date: mood.record_date,
    latest_heart_rate: 78 + (index % 4),
    resting_heart_rate: 61 + (index % 3),
    heart_rate_variability_sdnn: 43 + (index % 5) * 2,
    blood_oxygen: 97 + (index % 2),
    activity_bins: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      steps: Math.round((exercises[index].steps ?? 0) * ([7, 8, 12, 13, 17, 18, 19].includes(hour) ? 0.1 : 0.012)),
      exerciseMinutes: hour === 18 ? exercises[index].exercise_minutes ?? 0 : 0,
    })),
    sleep_stage_minutes: {},
    sleep_start_at: `${mood.record_date}T23:20:00+08:00`,
    sleep_end_at: `${mood.record_date}T07:05:00+08:00`,
    sleep_efficiency: 0.88,
    activity_coverage_hours: 16,
    source: "demo_health",
  }));
  const rhythms: DailyRhythmScore[] = moods.map((mood, index) => ({
    id: `demo-rhythm-${index}`,
    record_date: mood.record_date,
    score: [75, 74, 77, 79, 81, 80, 83][index],
    confidence: 0.76 + index * 0.008,
    score_lower: [67, 66, 69, 71, 73, 72, 77][index],
    score_upper: [83, 82, 85, 87, 89, 88, 88][index],
    model_version: "nava-chronostate-v4.27-2026-07",
    schema_version: "4.27.0",
    fusion: {
      utilityFusion: {
        physiologyStrainPressure: 0.08,
        unresolvedDrawdownPressure: 0.03,
        phaseTurbulencePressure: 0.04,
        circadianDriftPressure: 0.03,
        physiologyLeadPressure: 0.11,
        presenteeismStrainPressure: 0.02,
        maskedStrainPressure: 0.04,
        functionalOverreachRelief: 0.03,
        phaseAdaptationRelief: 0.02,
        recoveryReboundRelief: 0.01,
        endpointCalibrationPressure: 0.02,
        tailOverreactionRelief: 0.01,
        sparseTransitionShock: 0,
        drawdownStallPressure: 0.02,
      },
    },
    data_quality_score: 82,
    trend_slope: index > 3 ? 1.1 : 0.4,
    anomaly_flags: [],
    actions: [],
  }));
  return { moods, sleeps, exercises, nutritions, faces, focus, focusDistributions, healthMetrics, rhythms };
}

export const demoMessages: ChatMessage[] = [
  {
    id: "demo-chat-1",
    role: "assistant",
    content: "早上好，我已经看到你的 Apple Watch 睡眠和今日活动数据。今天节律整体稳定。",
    created_at: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
  },
  {
    id: "demo-chat-2",
    role: "user",
    content: "昨晚 23:20 睡，7:05 醒，今天想保持专注。",
    created_at: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
  {
    id: "demo-chat-3",
    role: "assistant",
    content: "已记录睡眠。建议上午完成一个 45 分钟深度专注块，下午安排 10 分钟步行。",
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
];

export function demoMessagesFor(locale: "zh" | "en" = "zh"): ChatMessage[] {
  if (locale === "zh") return demoMessages;
  return [
    {
      id: "demo-chat-1-en",
      role: "assistant",
      content: "Good morning. I can see your Apple Watch sleep and activity data. Your rhythm looks steady today.",
      created_at: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    },
    {
      id: "demo-chat-2-en",
      role: "user",
      content: "I slept at 23:20, woke at 7:05, and want to stay focused today.",
      created_at: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    },
    {
      id: "demo-chat-3-en",
      role: "assistant",
      content: "Sleep logged. Try one 45-minute focus block this morning and a 10-minute walk in the afternoon.",
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
  ];
}

export const demoProfile: UserProfile = {
  id: demoUser.id,
  username: "NAVA 用户",
  height: 172,
  weight: 64,
  occupation: "产品设计",
  goal: "改善睡眠并稳定工作日节律",
  mbti: "INTJ",
  exercise_frequency: "每周 3-4 次",
  sleep_schedule: "23:30 - 07:00",
  diet_preference: "高蛋白、少油",
  stress_factors: "项目截止日期",
  avatar_url: null,
};
