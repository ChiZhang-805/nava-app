export type TodoItem = {
  id: string;
  title: string;
  scheduledDate: string;
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
};

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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function loadTodos(userId: string): TodoItem[] {
  return readJson<TodoItem[]>(`nava-todos:${userId}`, []);
}

export function addTodo(userId: string, title: string, source: TodoItem["source"] = "manual", scheduledDate = todayISO()) {
  const normalized = title.trim();
  if (!normalized) throw new Error("待办事项不能为空。");
  const nextItem: TodoItem = {
    id: crypto.randomUUID(),
    title: normalized,
    scheduledDate,
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
    id: "sleep-window",
    titleZh: "稳定入睡窗口",
    titleEn: "Steady sleep window",
    detailZh: "连续三晚在计划时间前后 30 分钟内入睡",
    detailEn: "Sleep within 30 minutes of plan for three nights",
    xp: 40,
  },
  {
    id: "move-break",
    titleZh: "完成轻量活动",
    titleEn: "Complete light movement",
    detailZh: "今天完成一次 20 分钟低强度活动",
    detailEn: "Complete one 20-minute low-intensity activity today",
    xp: 25,
  },
  {
    id: "mood-checkin",
    titleZh: "记录情绪线索",
    titleEn: "Log a mood clue",
    detailZh: "记录情绪强度、主要原因和身体感受",
    detailEn: "Log mood intensity, cause, and body response",
    xp: 20,
  },
];

export function loadGrowthTasks(userId: string): GrowthTask[] {
  const completed = new Set(readJson<string[]>(`nava-growth-completed:${userId}`, []));
  return defaultGrowthTasks.map((task) => ({ ...task, completed: completed.has(task.id) }));
}

export function toggleGrowthTask(userId: string, id: string) {
  const completed = new Set(readJson<string[]>(`nava-growth-completed:${userId}`, []));
  if (completed.has(id)) completed.delete(id);
  else completed.add(id);
  window.localStorage.setItem(`nava-growth-completed:${userId}`, JSON.stringify([...completed]));
  emitChange();
  return loadGrowthTasks(userId);
}

export function growthXp(tasks: GrowthTask[]) {
  return tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.xp, 0);
}

export function subscribeProductivity(callback: () => void) {
  window.addEventListener(productivityEvent, callback);
  return () => window.removeEventListener(productivityEvent, callback);
}
