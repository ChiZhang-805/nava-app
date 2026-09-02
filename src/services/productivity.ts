export type TodoItem = {
  id: string;
  title: string;
  scheduledDate: string;
  scheduledTime?: string;
  completed: boolean;
  source: "manual" | "ai";
  createdAt: string;
  focusMinutes?: number;
  focusSessions?: number;
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
  target: "profile" | "sleep" | "exercise" | "mood" | "nutrition" | "focus" | "face" | "today" | "share" | "ai";
};

export type GrowthActivityKind = "checkin" | "share" | "ai";

import type { TodaySnapshot } from "../types";
import { loadProfile, type UserProfile } from "./profile";
import { getTodaySnapshot } from "./records";
import { todayISO } from "./date";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import type { GrowthProgressVisit } from "./growthProgressPresentation";

const productivityEvent = "nava-productivity-change";

const growthActivityPoints: Record<GrowthActivityKind, number> = {
  checkin: 10,
  share: 15,
  ai: 15,
};

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

function todoStorageKey(userId: string) {
  return `nava-todos:${userId}`;
}

function todoMigrationKey(userId: string) {
  return `nava-todos-migrated:${userId}:v2`;
}

function reminderAt(scheduledDate: string, scheduledTime?: string) {
  if (!scheduledTime || !/^\d{2}:\d{2}$/.test(scheduledTime)) return null;
  const value = new Date(`${scheduledDate}T${scheduledTime}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function scheduledTimeFromReminder(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function writeTodos(userId: string, items: TodoItem[]) {
  window.localStorage.setItem(todoStorageKey(userId), JSON.stringify(items.slice(0, 40)));
  emitChange();
  return items.slice(0, 40);
}

export function loadTodos(userId: string): TodoItem[] {
  return readJson<TodoItem[]>(todoStorageKey(userId), []);
}

export async function syncTodos(userId: string): Promise<TodoItem[]> {
  const cached = loadTodos(userId);
  if (isDemoMode()) return cached;

  const needsMigration = window.localStorage.getItem(todoMigrationKey(userId)) !== "done";
  if (needsMigration && cached.length > 0) {
    const migrated = await supabase.from("tasks").upsert(cached.map((item) => ({
      id: item.id,
      user_id: userId,
      title: item.title,
      scheduled_date: item.scheduledDate,
      estimated_minutes: item.focusMinutes ?? null,
      focus_sessions: item.focusSessions ?? null,
      reminder_at: reminderAt(item.scheduledDate, item.scheduledTime),
      completed: item.completed,
      category: "todo",
    })), { onConflict: "id" });
    if (migrated.error && !todoBackendUnavailable(migrated.error.message)) throw migrated.error;
    if (!migrated.error) window.localStorage.setItem(todoMigrationKey(userId), "done");
  } else if (needsMigration) {
    window.localStorage.setItem(todoMigrationKey(userId), "done");
  }

  const result = await supabase
    .from("tasks")
    .select("id,title,scheduled_date,completed,created_at,estimated_minutes,focus_sessions,reminder_at")
    .eq("user_id", userId)
    .eq("category", "todo")
    .order("created_at", { ascending: false })
    .limit(40);
  if (result.error) {
    if (todoBackendUnavailable(result.error.message)) return cached;
    throw result.error;
  }
  return writeTodos(userId, (result.data ?? []).map((row) => {
    const previous = cached.find((item) => item.id === String(row.id));
    return {
      id: String(row.id),
      title: String(row.title ?? ""),
      scheduledDate: String(row.scheduled_date ?? todayISO()),
      scheduledTime: scheduledTimeFromReminder(row.reminder_at) ?? previous?.scheduledTime,
      completed: row.completed === true,
      source: previous?.source ?? "manual" as const,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      focusMinutes: Number(row.estimated_minutes) > 0 ? Number(row.estimated_minutes) : previous?.focusMinutes,
      focusSessions: Number(row.focus_sessions) > 0 ? Number(row.focus_sessions) : previous?.focusSessions,
    };
  }));
}

export async function addTodo(
  userId: string,
  title: string,
  source: TodoItem["source"] = "manual",
  scheduledDate = todayISO(),
  scheduledTime?: string,
  focusPlan?: { focusMinutes?: number; focusSessions?: number },
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
    focusMinutes: focusPlan?.focusMinutes,
    focusSessions: focusPlan?.focusSessions,
  };
  if (isDemoMode()) {
    writeTodos(userId, [nextItem, ...loadTodos(userId)]);
    return nextItem;
  }

  const created = await supabase.from("tasks").insert({
    id: nextItem.id,
    user_id: userId,
    title: nextItem.title,
    scheduled_date: nextItem.scheduledDate,
    estimated_minutes: nextItem.focusMinutes ?? null,
    focus_sessions: nextItem.focusSessions ?? null,
    reminder_at: reminderAt(nextItem.scheduledDate, nextItem.scheduledTime),
    completed: false,
    category: "todo",
  }).select("id,title,scheduled_date,completed,created_at").single();
  if (created.error && !todoBackendUnavailable(created.error.message)) throw created.error;
  writeTodos(userId, [nextItem, ...loadTodos(userId)]);
  return nextItem;
}

export async function toggleTodo(userId: string, id: string) {
  const current = loadTodos(userId);
  const item = current.find((candidate) => candidate.id === id);
  if (!item) return current;
  const completed = !item.completed;
  if (!isDemoMode()) {
    const updated = await supabase
      .from("tasks")
      .update({ completed })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("category", "todo");
    if (updated.error && !todoBackendUnavailable(updated.error.message)) throw updated.error;
  }
  return writeTodos(userId, current.map((candidate) => candidate.id === id ? { ...candidate, completed } : candidate));
}

function todoBackendUnavailable(message: string) {
  return /schema cache|relation .*tasks.* does not exist|column .*(category|estimated_minutes|focus_sessions|reminder_at).* does not exist|could not find.*(category|estimated_minutes|focus_sessions|reminder_at)/i.test(message);
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
    id: "daily-checkin",
    titleZh: "完成今日打卡",
    titleEn: "Daily check-in",
    detailZh: "今日登录 NAVA 即可自动完成",
    detailEn: "Open NAVA today to complete this automatically",
    xp: growthActivityPoints.checkin,
    category: "daily",
    target: "today",
  },
  {
    id: "share-card",
    titleZh: "分享一次报告卡片",
    titleEn: "Share a report card",
    detailZh: "生成并分享任意一张状态报告卡片",
    detailEn: "Create and share any status report card",
    xp: growthActivityPoints.share,
    category: "daily",
    target: "share",
  },
  {
    id: "ai-conversation",
    titleZh: "完成一次 AI 对话",
    titleEn: "Complete an AI chat",
    detailZh: "向 NAVA 发送消息并收到一次回复",
    detailEn: "Send NAVA a message and receive a reply",
    xp: growthActivityPoints.ai,
    category: "daily",
    target: "ai",
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

function growthActivityStorageKey(userId: string) {
  return `nava-growth-activities:${userId}:${todayISO()}:v1`;
}

function loadLocalGrowthActivities(userId: string) {
  return new Set(readJson<GrowthActivityKind[]>(growthActivityStorageKey(userId), []));
}

function writeLocalGrowthActivities(userId: string, activities: Set<GrowthActivityKind>) {
  window.localStorage.setItem(growthActivityStorageKey(userId), JSON.stringify([...activities]));
  emitChange();
}

async function loadGrowthActivities(userId: string) {
  const activities = loadLocalGrowthActivities(userId);
  if (isDemoMode()) return activities;
  const date = todayISO();
  const eventKeys: Record<GrowthActivityKind, string> = {
    checkin: `${date}:checkin`,
    share: `${date}:share`,
    ai: `${date}:ai`,
  };
  const { data, error } = await supabase
    .from("growth_reward_ledger")
    .select("event_key")
    .eq("user_id", userId)
    .in("event_key", Object.values(eventKeys));
  if (error) {
    if (/growth_reward_ledger|schema cache|does not exist/i.test(error.message)) return activities;
    throw error;
  }
  const completedKeys = new Set((data ?? []).map((row) => String(row.event_key ?? "")));
  (Object.entries(eventKeys) as Array<[GrowthActivityKind, string]>).forEach(([activity, eventKey]) => {
    if (completedKeys.has(eventKey)) activities.add(activity);
  });
  writeLocalGrowthActivities(userId, activities);
  return activities;
}

export function loadGrowthTasks(userId: string): GrowthTask[] {
  const cache = readJson<GrowthCache | null>(`nava-growth-state:${userId}`, null);
  if (cache?.date === todayISO() && Array.isArray(cache.tasks)) return cache.tasks;
  return defaultGrowthTasks.map((task) => ({ ...task, completed: false }));
}

function taskCompleted(
  task: Omit<GrowthTask, "completed">,
  profile: UserProfile | null,
  snapshot: TodaySnapshot,
  activities: Set<GrowthActivityKind>,
) {
  switch (task.id) {
    case "profile-foundation":
      return Boolean(profile?.username?.trim() && profile?.occupation?.trim() && profile?.age_group?.trim());
    case "profile-goal":
      return Boolean(profile?.goal?.trim());
    case "daily-checkin":
      return activities.has("checkin");
    case "share-card":
      return activities.has("share");
    case "ai-conversation":
      return activities.has("ai");
    case "sleep-window":
      return Boolean(snapshot.sleep);
    case "move-break":
      return Number(snapshot.exercise?.exercise_minutes ?? 0) >= 20 || Number(snapshot.exercise?.steps ?? 0) >= 3000;
    case "mood-checkin":
      return Boolean(
        snapshot.mood
        && Array.isArray(snapshot.mood.factors)
        && snapshot.mood.factors.length > 0
        && snapshot.mood.diary_content?.trim(),
      );
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
  const [profile, snapshot, activities] = await Promise.all([loadProfile(userId), getTodaySnapshot(userId), loadGrowthActivities(userId)]);
  const tasks = defaultGrowthTasks.map((task) => ({ ...task, completed: taskCompleted(task, profile, snapshot, activities) }));
  window.localStorage.setItem(`nava-growth-state:${userId}`, JSON.stringify({ date: todayISO(), tasks } satisfies GrowthCache));
  emitChange();
  return tasks;
}

export async function recordGrowthActivity(userId: string, activity: GrowthActivityKind): Promise<GrowthRewardGrant | null> {
  const localActivities = loadLocalGrowthActivities(userId);
  if (isDemoMode()) {
    if (localActivities.has(activity)) return null;
    localActivities.add(activity);
    writeLocalGrowthActivities(userId, localActivities);
    return null;
  }

  const { data, error } = await supabase.rpc("nava_record_growth_activity", { activity_kind: activity });
  if (error) {
    if (/nava_record_growth_activity|schema cache|does not exist/i.test(error.message)) {
      console.warn("Growth activity reward is not available yet", error.message);
      return null;
    }
    throw error;
  }
  localActivities.add(activity);
  writeLocalGrowthActivities(userId, localActivities);
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const awarded = Array.isArray(result.awarded) ? result.awarded : [];
  const reward = awarded.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const eventKey = typeof reward?.eventKey === "string" ? reward.eventKey : "";
  const points = Number(reward?.points);
  if (!eventKey || !Number.isFinite(points) || points <= 0) return null;
  return { eventKey, points: Math.round(points), source: typeof reward?.source === "string" ? reward.source : "verified_engagement" };
}

export function growthXp(tasks: GrowthTask[]) {
  return tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.xp, 0);
}

export async function loadGrowthTotalPoints(userId: string) {
  if (isDemoMode()) return growthXp(loadGrowthTasks(userId));
  const { data, error } = await supabase
    .from("growth_reward_ledger")
    .select("points")
    .eq("user_id", userId);
  if (error) {
    if (/growth_reward_ledger|schema cache|does not exist/i.test(error.message)) return growthXp(loadGrowthTasks(userId));
    throw error;
  }
  return (data ?? []).reduce((total, row) => {
    const points = Number(row.points);
    return total + (Number.isFinite(points) && points > 0 ? Math.round(points) : 0);
  }, 0);
}

export type GrowthRewardGrant = {
  eventKey: string;
  points: number;
  source: string;
};

export type GrowthSummary = { totalPoints: number; badges: string[]; awarded: GrowthRewardGrant[] };

type GrowthProgressCache = {
  points: number;
  taskKeys: string[];
};

function growthProgressStorageKey(userId: string) {
  return `nava-growth-progress-view:${userId}:v1`;
}

export function loadLastViewedGrowthPoints(userId: string) {
  const cached = readJson<GrowthProgressCache | null>(growthProgressStorageKey(userId), null);
  return cached && Number.isFinite(cached.points) && cached.points >= 0 ? Math.round(cached.points) : null;
}

export function loadLastViewedGrowthTaskKeys(userId: string) {
  const cached = readJson<GrowthProgressCache | null>(growthProgressStorageKey(userId), null);
  return cached && Array.isArray(cached.taskKeys) ? cached.taskKeys.filter((key): key is string => typeof key === "string") : null;
}

function writeGrowthProgressCache(userId: string, points: number, taskKeys: string[]) {
  window.localStorage.setItem(growthProgressStorageKey(userId), JSON.stringify({
    points: Math.max(0, Math.round(points)),
    taskKeys: [...new Set(taskKeys.filter((key) => typeof key === "string" && key.length > 0))],
  } satisfies GrowthProgressCache));
}

export async function readGrowthProgress(userId: string, tasks: GrowthTask[], currentPoints: number): Promise<GrowthProgressVisit> {
  if (isDemoMode()) return readLocalGrowthProgress(userId, tasks, currentPoints);
  const { data, error } = await supabase.rpc("nava_read_growth_progress");
  if (error) {
    if (/nava_read_growth_progress|growth_progress_views|schema cache|does not exist/i.test(error.message)) {
      return readLocalGrowthProgress(userId, tasks, currentPoints);
    }
    throw error;
  }
  return parseGrowthProgressVisit(data, currentPoints);
}

export async function acknowledgeGrowthProgress(userId: string, visit: GrowthProgressVisit) {
  writeGrowthProgressCache(userId, visit.currentPoints, visit.currentTaskKeys);
  if (isDemoMode()) return;
  const { error } = await supabase.rpc("nava_ack_growth_progress", {
    acknowledged_points: visit.currentPoints,
    acknowledged_task_keys: visit.currentTaskKeys,
  });
  if (error && !/nava_ack_growth_progress|growth_progress_views|schema cache|does not exist/i.test(error.message)) throw error;
}

function parseGrowthProgressVisit(data: unknown, fallbackPoints: number): GrowthProgressVisit {
  const value = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const currentPoints = finiteNonNegative(value.currentPoints, fallbackPoints);
  const previousPoints = Math.min(currentPoints, finiteNonNegative(value.previousPoints, currentPoints));
  const delta = Math.max(0, finiteNonNegative(value.delta, currentPoints - previousPoints));
  return {
    isFirstVisit: value.isFirstVisit === true,
    previousPoints,
    currentPoints,
    delta,
    currentTaskKeys: stringArray(value.currentTaskKeys),
    newTaskKeys: stringArray(value.newTaskKeys),
  };
}

function finiteNonNegative(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : Math.max(0, Math.round(fallback));
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function readLocalGrowthProgress(userId: string, tasks: GrowthTask[], currentPoints: number): GrowthProgressVisit {
  const storageKey = growthProgressStorageKey(userId);
  const cached = readJson<GrowthProgressCache | null>(storageKey, null);
  const currentTaskKeys = tasks.filter((task) => task.completed).map((task) => task.category === "daily" ? `${todayISO()}:${task.id}` : task.id);
  if (!cached) {
    writeGrowthProgressCache(userId, currentPoints, currentTaskKeys);
    return { isFirstVisit: true, previousPoints: currentPoints, currentPoints, delta: 0, currentTaskKeys, newTaskKeys: [] };
  }
  const previousPoints = Math.min(currentPoints, finiteNonNegative(cached.points, currentPoints));
  const seenKeys = new Set(cached.taskKeys);
  return {
    isFirstVisit: false,
    previousPoints,
    currentPoints,
    delta: Math.max(0, currentPoints - previousPoints),
    currentTaskKeys,
    newTaskKeys: currentTaskKeys.filter((key) => !seenKeys.has(key)),
  };
}

export async function reconcileGrowthRewards(tasks: GrowthTask[]): Promise<GrowthSummary> {
  if (isDemoMode()) return reconcileDemoGrowthRewards(tasks);
  const { data, error } = await supabase.rpc("nava_reconcile_growth_rewards");
  if (error) {
    if (/nava_reconcile_growth_rewards|schema cache|does not exist/i.test(error.message)) return { totalPoints: growthXp(tasks), badges: [], awarded: [] };
    throw error;
  }
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const totalPoints = Number(result.totalPoints);
  return {
    totalPoints: Number.isFinite(totalPoints) && totalPoints >= 0 ? Math.round(totalPoints) : growthXp(tasks),
    badges: Array.isArray(result.badges) ? result.badges.filter((item): item is string => typeof item === "string") : [],
    awarded: Array.isArray(result.awarded) ? result.awarded.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const reward = item as Record<string, unknown>;
      const eventKey = typeof reward.eventKey === "string" ? reward.eventKey : "";
      const points = Number(reward.points);
      if (!eventKey || !Number.isFinite(points) || points <= 0) return [];
      return [{ eventKey, points: Math.round(points), source: typeof reward.source === "string" ? reward.source : "verified" }];
    }) : [],
  };
}

function reconcileDemoGrowthRewards(tasks: GrowthTask[]): GrowthSummary {
  const storageKey = "nava-demo-growth-reward-ledger:v1";
  const claimed = new Set(readJson<string[]>(storageKey, []));
  const awarded = tasks.filter((task) => task.completed).flatMap<GrowthRewardGrant>((task) => {
    const eventSuffix = task.id === "daily-checkin"
      ? "checkin"
      : task.id === "share-card"
        ? "share"
        : task.id === "ai-conversation"
          ? "ai"
          : task.target;
    const eventKey = task.category === "profile" ? `profile:${task.id}` : `${todayISO()}:${eventSuffix}`;
    if (claimed.has(eventKey)) return [];
    claimed.add(eventKey);
    return [{ eventKey, points: task.xp, source: task.category === "profile" ? "verified_profile" : "verified_record" }];
  });
  window.localStorage.setItem(storageKey, JSON.stringify([...claimed]));
  const totalPoints = growthXp(tasks);
  return { totalPoints, badges: totalPoints >= 100 ? ["rhythm_observer"] : [], awarded };
}

export function subscribeProductivity(callback: () => void) {
  window.addEventListener(productivityEvent, callback);
  return () => window.removeEventListener(productivityEvent, callback);
}
