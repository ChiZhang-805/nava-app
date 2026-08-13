import type { User } from "@supabase/supabase-js";
import { daysAgoISO, todayISO } from "./date";
import type { ChatMessage, DailyRhythmScore, ExerciseRecord, FocusRecord, MoodRecord, NutritionRecord, SleepRecord, TodaySnapshot, TrendBundle } from "../types";
import type { UserProfile } from "./profile";

const DEMO_SESSION_KEY = "nava.review.demo.auth.v1";
export const demoLoginAccount = "13800138000";
export const demoLoginPassword = "12345678";
export const demoOtpCode = "123456";

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
  const normalized = account.trim();
  return normalized === demoLoginAccount && password === demoLoginPassword;
}

export function isDemoOtpCode(code: string) {
  return code.trim() === demoOtpCode;
}

export const demoUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: `${demoLoginAccount}@phone.nava.app`,
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
  breakfast_items: [{ name: "燕麦酸奶", calories: 360, amount: "1 碗" }],
  lunch_items: [{ name: "鸡胸肉沙拉", calories: 520, amount: "1 份" }],
  dinner_items: [{ name: "三文鱼糙米饭", calories: 620, amount: "1 份" }],
  pantry_items: [{ name: "坚果", calories: 180, amount: "30g" }],
  ai_feedback: "蛋白质摄入较好，晚餐碳水适中。",
};

export function demoTodaySnapshot(): TodaySnapshot {
  return {
    date: todayISO(),
    mood: demoMood,
    sleep: demoSleep,
    exercise: demoExercise,
    nutrition: demoNutrition,
    face: {
      id: "demo-face",
      record_date: todayISO(),
      image_path: null,
      overall_score: 82,
      skin_age: 27,
      annotations: [],
      feedback: "面部状态平稳。",
      model_version: "demo",
    },
    focusMinutes: 95,
    focusSessions: 4,
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
  const moods: MoodRecord[] = Array.from({ length: 7 }, (_, index) => ({
    ...demoMood,
    id: `demo-mood-${index}`,
    record_date: daysAgoISO(6 - index),
    mood_score: [81, 77, 80, 84, 82, 79, 86][index],
  }));
  const sleeps: SleepRecord[] = moods.map((mood, index) => ({
    ...demoSleep,
    id: `demo-sleep-${index}`,
    record_date: mood.record_date,
    sleep_duration_minutes: 410 + (index % 5) * 18,
  }));
  const exercises: ExerciseRecord[] = moods.map((mood, index) => ({
    ...demoExercise,
    id: `demo-exercise-${index}`,
    record_date: mood.record_date,
    steps: 5200 + index * 310,
  }));
  const nutritions: NutritionRecord[] = moods.map((mood, index) => ({
    ...demoNutrition,
    id: `demo-nutrition-${index}`,
    record_date: mood.record_date,
    total_calories: 1500 + (index % 4) * 120,
  }));
  const focus: FocusRecord[] = moods.map((mood, index) => ({
    id: `demo-focus-${index}`,
    task_id: `demo-task-${index}`,
    record_date: mood.record_date,
    completed_sessions: 1 + (index % 3),
    total_minutes: 25 + (index % 4) * 20,
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
  return { moods, sleeps, exercises, nutritions, focus, rhythms };
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
