import type { User } from "@supabase/supabase-js";
import { daysAgoISO, todayISO } from "./date";
import type { ChatMessage, ExerciseRecord, FocusRecord, MoodRecord, NutritionRecord, SleepRecord, TodaySnapshot, TrendBundle } from "../types";
import type { UserProfile } from "./profile";

export function isDemoMode() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

export const demoUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@nava.app",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: { full_name: "NAVA Demo" },
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
    focusMinutes: 95,
    focusSessions: 4,
    rhythmScore: 83,
    nextAction: "今天基础节律稳定，晚间减少屏幕刺激，保持 23:30 前入睡。",
  };
}

export function demoTrends(): TrendBundle {
  const moods: MoodRecord[] = Array.from({ length: 14 }, (_, index) => ({
    ...demoMood,
    id: `demo-mood-${index}`,
    record_date: daysAgoISO(13 - index),
    mood_score: [62, 68, 72, 70, 76, 74, 78, 81, 77, 80, 84, 82, 79, 86][index],
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
  return { moods, sleeps, exercises, nutritions, focus };
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

export const demoProfile: UserProfile = {
  id: demoUser.id,
  username: "NAVA Demo",
  height: 172,
  weight: 64,
  occupation: "产品设计",
  goal: "改善睡眠并稳定工作日节律",
  mbti: "INTJ",
  exercise_frequency: "每周 3-4 次",
  sleep_schedule: "23:30 - 07:00",
  diet_preference: "高蛋白、少油",
  stress_factors: "项目截止日期",
};

