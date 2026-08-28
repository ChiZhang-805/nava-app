export type TodoItem = {
  id: string;
  title: string;
  scheduledDate: string;
  scheduledTime?: string;
  completed: boolean;
  source: "manual" | "ai";
  createdAt: string;
};

export type GrowthTask = {
  id: string;
  titleZh: string;
  titleEn: string;
  detailZh: string;
  detailEn: string;
  xp: number;
  completed: boolean;
  category: "profile" | "daily";
  target: "profile" | "sleep" | "exercise" | "mood" | "nutrition" | "focus" | "face";
};

import type { TodaySnapshot } from "../types";
import { loadProfile, type UserProfile } from "./profile";
import { getTodaySnapshot } from "./records";
import { todayISO } from "./date";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

const productivityEvent = "nava-productivity-change";

function readJson<T>(key: string, fallback: T): T {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function emitChange() {
  window.dispatchEvent(new CustomEvent(productivityEvent));
}

export function loadTodos(userId: string): TodoItem[] {
  return readJson<TodoItem[]>(`nava-todos:${userId}`, []);
}

export function addTodo(
  userId: string,
  title: string,
  source: TodoItem["source"] = "manual",
  scheduledDate = todayISO(),
  scheduledTime?: string,
) {
  const normalized = title.trim();
  if (!normalized) throw new Error("待办事项不能为空。");
  const nextItem: TodoItem = {
    id: crypto.randomUUID(),
    title: normalized,
    scheduledDate,
    scheduledTime,
    completed: false,
    source,
    createdAt: new Date().toISOString(),
  };
  const next = [nextItem, ...loadTodos(userId)].slice(0, 40);
  window.localStorage.setItem(`nava-todos:${userId}`, JSON.stringify(next));
  emitChange();
  return nextItem;
}

export function toggleTodo(userId: string, id: string) {
  const next = loadTodos(userId).map((item) => item.id === id ? { ...item, completed: !item.completed } : item);
  window.localStorage.setItem(`nava-todos:${userId}`, JSON.stringify(next));
  emitChange();
  return next;
}

const defaultGrowthTasks: Omit<GrowthTask, "completed">[] = [
  {
    id: "profile-foundation",
    titleZh: "完善基础画像",
    titleEn: "Complete your profile",
    detailZh: "补齐昵称、年龄阶段与职业信息",
    detailEn: "Add your name, age range, and occupation",
    xp: 30,
    category: "profile",
    target: "profile",
  },
  {
    id: "profile-goal",
    titleZh: "设定节律目标",
    titleEn: "Set a rhythm goal",
    detailZh: "告诉 NAVA 当前最希望改善的方向",
    detailEn: "Tell NAVA what you most want to improve",
    xp: 30,
    category: "profile",
    target: "profile",
  },
  {
    id: "sleep-window",
    titleZh: "记录昨夜睡眠",
    titleEn: "Log last night's sleep",
    detailZh: "补齐入睡、醒来与睡眠时长",
    detailEn: "Add bedtime, wake time, and duration",
    xp: 25,
    category: "daily",
    target: "sleep",
  },
  {
    id: "move-break",
    titleZh: "完成轻量活动",
    titleEn: "Light movement",
    detailZh: "今天完成一次 20 分钟低强度活动",
    detailEn: "Complete one 20-minute low-intensity activity today",
    xp: 25,
    category: "daily",
    target: "exercise",
  },
  {
    id: "mood-checkin",
    titleZh: "记录情绪线索",
    titleEn: "Log a mood clue",
    detailZh: "记录情绪强度、主要原因和身体感受",
    detailEn: "Log mood intensity, cause, and body response",
    xp: 20,
    category: "daily",
    target: "mood",
  },
  {
    id: "nutrition-log",
    titleZh: "记录今日饮食",
    titleEn: "Log today's meals",
    detailZh: "记录至少一餐及主要食物内容",
    detailEn: "Log at least one meal and its main foods",
    xp: 20,
    category: "daily",
    target: "nutrition",
  },
  {
    id: "focus-block",
    titleZh: "完成专注时段",
    titleEn: "Focus block",
    detailZh: "累计完成至少 25 分钟专注",
    detailEn: "Complete at least 25 focused minutes",
    xp: 20,
    category: "daily",
    target: "focus",
  },
  {
    id: "face-check",
    titleZh: "完成面部记录",
    titleEn: "Face check",
    detailZh: "在授权后保存一次今日面部状态",
    detailEn: "Save today's face check after consent",
    xp: 15,
    category: "daily",
    target: "face",
  },
];

type GrowthCache = { date: string; tasks: GrowthTask[] };

export function loadGrowthTasks(userId: string): GrowthTask[] {
  const cache = readJson<GrowthCache | null>(`nava-growth-state:${userId}`, null);
  if (cache?.date === todayISO() && Array.isArray(cache.tasks)) return cache.tasks;
  return defaultGrowthTasks.map((task) => ({ ...task, completed: false }));
}

function taskCompleted(task: Omit<GrowthTask, "completed">, profile: UserProfile | null, snapshot: TodaySnapshot) {
  switch (task.id) {
    case "profile-foundation":
      return Boolean(profile?.username?.trim() && profile?.occupation?.trim() && profile?.age_group?.trim());
    case "profile-goal":
      return Boolean(profile?.goal?.trim());
    case "sleep-window":
      return Boolean(snapshot.sleep);
    case "move-break":
      return Number(snapshot.exercise?.exercise_minutes ?? 0) >= 20 || Number(snapshot.exercise?.steps ?? 0) >= 3000;
    case "mood-checkin":
      return Boolean(snapshot.mood);
    case "nutrition-log":
      return Boolean(snapshot.nutrition);
    case "focus-block":
      return snapshot.focusMinutes >= 25;
    case "face-check":
      return Boolean(snapshot.face);
    default:
      return false;
  }
}

export async function resolveGrowthTasks(userId: string): Promise<GrowthTask[]> {
  const [profile, snapshot] = await Promise.all([loadProfile(userId), getTodaySnapshot(userId)]);
  const tasks = defaultGrowthTasks.map((task) => ({ ...task, completed: taskCompleted(task, profile, snapshot) }));
  window.localStorage.setItem(`nava-growth-state:${userId}`, JSON.stringify({ date: todayISO(), tasks } satisfies GrowthCache));
  emitChange();
  return tasks;
}

export function growthXp(tasks: GrowthTask[]) {
  return tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.xp, 0);
}

export type GrowthSummary = { totalPoints: number; badges: string[] };

export async function reconcileGrowthRewards(tasks: GrowthTask[]): Promise<GrowthSummary> {
  if (isDemoMode()) return { totalPoints: growthXp(tasks), badges: growthXp(tasks) >= 100 ? ["rhythm_observer"] : [] };
  const { data, error } = await supabase.rpc("nava_reconcile_growth_rewards");
  if (error) {
    if (/nava_reconcile_growth_rewards|schema cache|does not exist/i.test(error.message)) return { totalPoints: growthXp(tasks), badges: [] };
    throw error;
  }
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return {
    totalPoints: Number(result.totalPoints) || growthXp(tasks),
    badges: Array.isArray(result.badges) ? result.badges.filter((item): item is string => typeof item === "string") : [],
  };
}

export function subscribeProductivity(callback: () => void) {
  window.addEventListener(productivityEvent, callback);
  return () => window.removeEventListener(productivityEvent, callback);
}
