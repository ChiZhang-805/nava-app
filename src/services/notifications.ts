import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { LocalNotifications, type LocalNotificationSchema } from "@capacitor/local-notifications";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import { buildContextualNotificationDrafts } from "./notificationPlanner";

const SLEEP_ID = 41001;
const WEEKLY_ID = 41002;
const NUTRITION_ID = 41003;
const FOCUS_ID = 41004;
const MOOD_ID = 41005;
const HEALTH_ID = 41006;
const INBOX_LIMIT = 80;
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const notificationEventName = "nava:notifications-changed";
const notificationFlushes = new Map<string, Promise<void>>();
const notificationPreferenceFlushes = new Map<string, Promise<void>>();

export type NavaNotificationCategory = "sleep" | "nutrition" | "mood" | "focus" | "exercise" | "face" | "weekly" | "system";
export type NavaNotificationSource = "contextual" | "record" | "native" | "system";

export interface NavaNotificationTarget {
  tab: "today" | "record" | "ai" | "trends" | "profile";
  module?: "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";
  view?: string | null;
}

export interface NavaNotificationItem {
  id: string;
  category: NavaNotificationCategory;
  source: NavaNotificationSource;
  title: string;
  body: string;
  createdAt: string;
  target?: NavaNotificationTarget;
  readAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export interface NavaNotificationChange {
  items: NavaNotificationItem[];
  presented?: NavaNotificationItem;
  opened?: NavaNotificationItem;
}

export type NotificationPreferenceType = "sleep" | "nutrition" | "mood" | "focus" | "weekly_report" | "fdnb_signal";

type PendingNotificationPreference = {
  type: NotificationPreferenceType;
  localTime: string;
  timezone: string;
  scheduledAt: string;
};

function inboxKey(userId: string) {
  return `nava-notification-inbox:v1:${userId}`;
}

function pendingInboxKey(userId: string) {
  return `nava-notification-pending:v1:${userId}`;
}

function pendingPreferenceKey(userId: string) {
  return `nava-notification-preference-pending:v1:${userId}`;
}

function readPendingPreferences(userId: string): PendingNotificationPreference[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(pendingPreferenceKey(userId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingNotificationPreference => Boolean(
      item
      && typeof item === "object"
      && ["sleep", "nutrition", "mood", "focus", "weekly_report", "fdnb_signal"].includes(String((item as PendingNotificationPreference).type))
      && /^\d{2}:\d{2}$/.test(String((item as PendingNotificationPreference).localTime)),
    ));
  } catch {
    return [];
  }
}

function writePendingPreferences(userId: string, items: PendingNotificationPreference[]) {
  if (items.length === 0) window.localStorage.removeItem(pendingPreferenceKey(userId));
  else window.localStorage.setItem(pendingPreferenceKey(userId), JSON.stringify(items));
}

function readStoredItems(userId: string): NavaNotificationItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(inboxKey(userId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is NavaNotificationItem => Boolean(
      item
      && typeof item === "object"
      && typeof (item as NavaNotificationItem).id === "string"
      && typeof (item as NavaNotificationItem).title === "string"
      && typeof (item as NavaNotificationItem).body === "string"
      && typeof (item as NavaNotificationItem).createdAt === "string",
    ));
  } catch {
    return [];
  }
}

function itemRevision(item: NavaNotificationItem) {
  if (item.updatedAt) return item.updatedAt;
  const revisions = [item.updatedAt, item.deletedAt, item.readAt, item.createdAt]
    .filter((value): value is string => typeof value === "string")
    .sort();
  return revisions[revisions.length - 1] ?? item.createdAt;
}

function readPendingItems(userId: string): NavaNotificationItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(pendingInboxKey(userId)) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is NavaNotificationItem => Boolean(
      item && typeof item === "object" && typeof (item as NavaNotificationItem).id === "string",
    )) : [];
  } catch {
    return [];
  }
}

function writePendingItems(userId: string, items: NavaNotificationItem[]) {
  if (items.length === 0) window.localStorage.removeItem(pendingInboxKey(userId));
  else window.localStorage.setItem(pendingInboxKey(userId), JSON.stringify(items));
}

function enqueueNotificationItems(userId: string, items: NavaNotificationItem[]) {
  if (isDemoMode() || items.length === 0) return;
  const pending = new Map(readPendingItems(userId).map((item) => [item.id, item]));
  items.forEach((item) => pending.set(item.id, item));
  writePendingItems(userId, [...pending.values()]);
  void flushPendingNotificationItems(userId)
    .catch((error) => console.warn("Notification cloud sync deferred", error));
}

function cloudRowToItem(row: Record<string, unknown>): NavaNotificationItem | null {
  if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.body !== "string" || typeof row.created_at !== "string") return null;
  if (!["sleep", "nutrition", "mood", "focus", "exercise", "face", "weekly", "system"].includes(String(row.category))) return null;
  if (!["contextual", "record", "native", "system"].includes(String(row.source))) return null;
  const target = row.target && typeof row.target === "object" ? row.target as NavaNotificationTarget : undefined;
  return {
    id: row.id,
    category: row.category as NavaNotificationCategory,
    source: row.source as NavaNotificationSource,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    target,
    readAt: typeof row.read_at === "string" ? row.read_at : undefined,
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

function compactItems(items: NavaNotificationItem[]) {
  const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
  return [...items]
    .filter((item) => !item.deletedAt || new Date(item.deletedAt).getTime() >= cutoff)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, INBOX_LIMIT);
}

function visibleItems(items: NavaNotificationItem[]) {
  return items.filter((item) => !item.deletedAt);
}

function emitChange(userId: string, presented?: NavaNotificationItem) {
  window.dispatchEvent(new CustomEvent<NavaNotificationChange>(notificationEventName, {
    detail: { items: listNavaNotifications(userId), presented },
  }));
}

async function persistNotificationItems(userId: string, items: NavaNotificationItem[]) {
  if (isDemoMode() || items.length === 0) return [];
  const rows = compactItems(items).map((item) => ({
    user_id: userId,
    id: item.id,
    category: item.category,
    source: item.source,
    title: item.title,
    body: item.body,
    target: item.target ?? null,
    created_at: item.createdAt,
    read_at: item.readAt ?? null,
    deleted_at: item.deletedAt ?? null,
  }));
  const result = await supabase.from("user_notifications")
    .upsert(rows, { onConflict: "user_id,id" })
    .select("id,category,source,title,body,target,created_at,read_at,deleted_at,updated_at");
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => cloudRowToItem(row)).filter((item): item is NavaNotificationItem => Boolean(item));
}

async function flushPendingNotificationItems(userId: string) {
  const active = notificationFlushes.get(userId);
  if (active) return active;
  const task = (async () => {
    for (;;) {
      const batch = readPendingItems(userId);
      if (batch.length === 0) return;
      const submitted = new Map(batch.map((item) => [item.id, JSON.stringify(item)]));
      const persisted = await persistNotificationItems(userId, batch);
      const latest = readPendingItems(userId);
      const remaining = latest.filter((item) => submitted.get(item.id) !== JSON.stringify(item));
      writePendingItems(userId, remaining);

      const stillPending = new Set(remaining.map((item) => item.id));
      const local = new Map(readStoredItems(userId).map((item) => [item.id, item]));
      persisted.forEach((item) => {
        if (!stillPending.has(item.id)) local.set(item.id, item);
      });
      window.localStorage.setItem(inboxKey(userId), JSON.stringify(compactItems([...local.values()])));
      emitChange(userId);
    }
  })();
  notificationFlushes.set(userId, task);
  try {
    await task;
  } finally {
    if (notificationFlushes.get(userId) === task) notificationFlushes.delete(userId);
  }
}

function writeStoredItems(
  userId: string,
  items: NavaNotificationItem[],
  presented?: NavaNotificationItem,
  persist: boolean | NavaNotificationItem[] = true,
) {
  const compacted = compactItems(items);
  window.localStorage.setItem(inboxKey(userId), JSON.stringify(compacted));
  emitChange(userId, presented);
  const cloudChanges = Array.isArray(persist) ? persist : persist ? compacted : [];
  enqueueNotificationItems(userId, cloudChanges);
  return visibleItems(compacted);
}

export async function hydrateNavaNotifications(userId: string, migrateLocal = true) {
  const local = readStoredItems(userId);
  const pending = readPendingItems(userId);
  if (isDemoMode()) return visibleItems(compactItems(local));
  const result = await supabase
    .from("user_notifications")
    .select("id,category,source,title,body,target,created_at,read_at,deleted_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (result.error) throw result.error;
  const cloud = (result.data ?? []).map((row) => cloudRowToItem(row)).filter((item): item is NavaNotificationItem => Boolean(item));
  const cloudById = new Map(cloud.map((item) => [item.id, item]));
  const merged = new Map<string, NavaNotificationItem>();
  for (const item of [...cloud, ...local]) {
    const existing = merged.get(item.id);
    if (!existing || itemRevision(item) > itemRevision(existing)) merged.set(item.id, item);
  }
  pending.forEach((item) => merged.set(item.id, item));
  const compacted = compactItems([...merged.values()]);
  writeStoredItems(userId, compacted, undefined, false);
  if (migrateLocal) {
    const legacyChanges = local.filter((item) => {
      const remote = cloudById.get(item.id);
      return !remote || itemRevision(item) > itemRevision(remote);
    });
    if (legacyChanges.length > 0) enqueueNotificationItems(userId, legacyChanges);
  }
  await flushPendingNotificationItems(userId);
  return listNavaNotifications(userId);
}

export function listNavaNotifications(userId: string) {
  return visibleItems(compactItems(readStoredItems(userId)));
}

export function unreadNavaNotificationCount(userId: string) {
  return listNavaNotifications(userId).filter((item) => !item.readAt).length;
}

export function subscribeNavaNotifications(userId: string, listener: (change: NavaNotificationChange) => void) {
  const onChange = (event: Event) => {
    const detail = (event as CustomEvent<NavaNotificationChange>).detail;
    listener(detail ?? { items: listNavaNotifications(userId) });
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === inboxKey(userId)) listener({ items: listNavaNotifications(userId) });
  };
  window.addEventListener(notificationEventName, onChange);
  window.addEventListener("storage", onStorage);
  const channel = isDemoMode()
    ? null
    : supabase.channel(`user-notifications:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${userId}` }, () => {
        void hydrateNavaNotifications(userId, false)
          .then((items) => listener({ items }))
          .catch((error) => console.warn("Notification realtime refresh deferred", error));
      })
      .subscribe();
  return () => {
    window.removeEventListener(notificationEventName, onChange);
    window.removeEventListener("storage", onStorage);
    if (channel) void supabase.removeChannel(channel);
  };
}

export function publishNavaNotification(
  userId: string,
  input: Omit<NavaNotificationItem, "createdAt"> & { createdAt?: string },
  options: { present?: boolean; replace?: boolean } = {},
) {
  const items = readStoredItems(userId);
  const existingIndex = items.findIndex((item) => item.id === input.id);
  if (existingIndex >= 0 && !options.replace) return { item: items[existingIndex], created: false };

  const now = new Date().toISOString();
  const item: NavaNotificationItem = { ...input, createdAt: input.createdAt ?? now, updatedAt: now };
  if (existingIndex >= 0) items.splice(existingIndex, 1, item);
  else items.unshift(item);
  writeStoredItems(userId, items, options.present ? item : undefined, [item]);
  if (options.present) presentBrowserNotification(userId, item);
  return { item, created: existingIndex < 0 };
}

export function markNavaNotification(userId: string, id: string, read: boolean) {
  return markNavaNotifications(userId, [id], read);
}

export function markNavaNotifications(userId: string, ids: string[], read: boolean) {
  const selected = new Set(ids);
  const now = new Date().toISOString();
  const changed: NavaNotificationItem[] = [];
  const next = readStoredItems(userId).map((item) => {
    if (!selected.has(item.id)) return item;
    const updated = { ...item, readAt: read ? now : undefined, updatedAt: now };
    changed.push(updated);
    return updated;
  });
  return writeStoredItems(userId, next, undefined, changed);
}

export function markAllNavaNotificationsRead(userId: string) {
  const now = new Date().toISOString();
  const changed: NavaNotificationItem[] = [];
  const next = readStoredItems(userId).map((item) => {
    if (item.deletedAt || item.readAt) return item;
    const updated = { ...item, readAt: now, updatedAt: now };
    changed.push(updated);
    return updated;
  });
  return writeStoredItems(userId, next, undefined, changed);
}

export function deleteNavaNotification(userId: string, id: string) {
  return deleteNavaNotifications(userId, [id])[0] ?? null;
}

export function deleteNavaNotifications(userId: string, ids: string[]) {
  const selected = new Set(ids);
  const items = readStoredItems(userId);
  const removed = items.filter((candidate) => selected.has(candidate.id) && !candidate.deletedAt);
  if (removed.length === 0) return [];
  const deletedAt = new Date().toISOString();
  const changed: NavaNotificationItem[] = [];
  const next = items.map((candidate) => {
    if (!selected.has(candidate.id) || candidate.deletedAt) return candidate;
    const updated = { ...candidate, deletedAt, updatedAt: deletedAt };
    changed.push(updated);
    return updated;
  });
  writeStoredItems(userId, next, undefined, changed);
  return removed;
}

export function restoreNavaNotification(userId: string, item: NavaNotificationItem) {
  return restoreNavaNotifications(userId, [item]);
}

export function restoreNavaNotifications(userId: string, restoredItems: NavaNotificationItem[]) {
  const items = readStoredItems(userId);
  const updatedAt = new Date().toISOString();
  const changed: NavaNotificationItem[] = [];
  for (const item of restoredItems) {
    const restored = { ...item, deletedAt: undefined, updatedAt };
    changed.push(restored);
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) items.splice(index, 1, restored);
    else items.unshift(restored);
  }
  return writeStoredItems(userId, items, undefined, changed);
}

export function notifyRecordSaved(userId: string, module: NavaNotificationTarget["module"], recordDate: string, locale: "zh" | "en") {
  if (!module) return;
  const labels = {
    mood: ["情绪记录", "Mood"], sleep: ["睡眠记录", "Sleep"], exercise: ["运动记录", "Activity"],
    diet: ["饮食记录", "Diet"], focus: ["专注记录", "Focus"], face: ["面部记录", "Face"],
  } as const;
  const label = labels[module][locale === "zh" ? 0 : 1];
  publishNavaNotification(userId, {
    id: `record-saved:${module}:${recordDate}`,
    category: module === "diet" ? "nutrition" : module,
    source: "record",
    title: locale === "zh" ? `${label}已保存` : `${label} saved`,
    body: locale === "zh" ? "真实记录已写入账号，今日状态和进度会随之更新。" : "Your saved data now updates today's status and progress.",
    target: { tab: "record", module, view: "history" },
  }, { present: true });
}

export function syncContextualNotifications(
  userId: string,
  snapshot: import("../types").TodaySnapshot,
  locale: "zh" | "en",
  now = new Date(),
  options: { present?: boolean } = { present: true },
) {
  const drafts = buildContextualNotificationDrafts(snapshot, now.getHours(), locale);
  let presented = false;
  for (const draft of drafts) {
    const item = {
      id: draft.id,
      category: draft.category,
      title: draft.title,
      body: draft.body,
      target: draft.target,
    };
    const shouldPresent = options.present === true && !presented;
    const result = publishNavaNotification(userId, { ...item, source: "contextual" }, { present: shouldPresent });
    if (result.created && shouldPresent) presented = true;
  }
  return listNavaNotifications(userId);
}

export function ensureNotificationQaState(userId: string, locale: "zh" | "en") {
  if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get("qa") !== "notifications") return;
  const now = Date.now();
  const qaItems: Array<Omit<NavaNotificationItem, "source">> = [
    { id: "qa:notification-banner", category: "system", createdAt: new Date(now).toISOString(), title: locale === "zh" ? "NAVA 今日提醒" : "NAVA reminder", body: locale === "zh" ? "轻轻补齐一项记录，今天的节律画像就会更完整。" : "Add one record to complete today's rhythm picture.", target: { tab: "record" } },
    { id: "qa:nutrition", category: "nutrition", createdAt: new Date(now - 2 * 60 * 60_000).toISOString(), title: locale === "zh" ? "别忘了记录一餐" : "Remember to log a meal", body: locale === "zh" ? "拍照或手动补充饮食，之后还能和活动消耗一起查看；营养视图、能量结构和本周健康报告也会根据这条真实记录同步更新。" : "Capture a photo or add the meal manually, then review it alongside activity energy use; nutrition and the weekly report will update from this real record.", target: { tab: "record", module: "diet", view: "editor" } },
    { id: "qa:exercise", category: "exercise", createdAt: new Date(now - 2 * 60 * 60_000 - 1_000).toISOString(), title: locale === "zh" ? "今天动得有点少" : "A little less activity today", body: locale === "zh" ? "身体合适时轻走十分钟。" : "Try a gentle 10-minute walk.", target: { tab: "record", module: "exercise", view: "editor" } },
    { id: "qa:mood", category: "mood", createdAt: new Date(now - 2 * 60 * 60_000 - 2_000).toISOString(), title: locale === "zh" ? "给今天的心情留句话" : "Leave a note for today's mood", body: locale === "zh" ? "留下一句真实感受。" : "Leave one honest feeling.", target: { tab: "record", module: "mood", view: "editor" } },
    { id: "qa:face", category: "face", createdAt: new Date(now - 2 * 60 * 60_000 - 3_000).toISOString(), title: locale === "zh" ? "记录今天的面部状态" : "Record today's face status", body: locale === "zh" ? "只作非诊断趋势记录。" : "For non-diagnostic trends only.", target: { tab: "record", module: "face", view: "editor" }, readAt: new Date(now - 60 * 60_000).toISOString() },
  ];
  qaItems.forEach((item, index) => publishNavaNotification(userId, { ...item, source: "system" }, { present: index === 0, replace: true }));
}

function parseTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 22,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 30,
  };
}

export async function loadNotificationPreference(userId: string, type: NotificationPreferenceType) {
  if (isDemoMode()) return null;
  await flushPendingNotificationPreferences(userId);
  const result = await supabase
    .from("notification_preferences")
    .select("enabled,local_time,timezone")
    .eq("user_id", userId)
    .eq("notification_type", type)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? {
    enabled: result.data.enabled === true,
    localTime: typeof result.data.local_time === "string" ? result.data.local_time.slice(0, 5) : null,
    timezone: typeof result.data.timezone === "string" ? result.data.timezone : null,
  } : null;
}

async function savePreference(userId: string, type: NotificationPreferenceType, localTime: string) {
  if (isDemoMode()) return;
  const pending = new Map(readPendingPreferences(userId).map((item) => [item.type, item]));
  pending.set(type, {
    type,
    localTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    scheduledAt: new Date().toISOString(),
  });
  writePendingPreferences(userId, [...pending.values()]);
  await flushPendingNotificationPreferences(userId);
}

export async function flushPendingNotificationPreferences(userId: string) {
  if (isDemoMode()) return;
  const active = notificationPreferenceFlushes.get(userId);
  if (active) return active;
  const task = (async () => {
    for (;;) {
      const pending = readPendingPreferences(userId);
      if (pending.length === 0) return;
      const submitted = new Map(pending.map((item) => [item.type, JSON.stringify(item)]));
      const { error } = await supabase.from("notification_preferences").upsert(pending.map((item) => ({
        user_id: userId,
        notification_type: item.type,
        enabled: true,
        local_time: item.localTime,
        timezone: item.timezone,
        last_scheduled_at: item.scheduledAt,
      })), { onConflict: "user_id,notification_type" });
      if (error) {
        if (/notification_preferences|schema cache|does not exist/i.test(error.message)) throw new Error("共享后端尚未启用通知偏好存储，本次提醒设置没有保存到账号。");
        throw error;
      }
      const latest = readPendingPreferences(userId);
      writePendingPreferences(userId, latest.filter((item) => submitted.get(item.type) !== JSON.stringify(item)));
    }
  })();
  notificationPreferenceFlushes.set(userId, task);
  try {
    await task;
  } finally {
    if (notificationPreferenceFlushes.get(userId) === task) notificationPreferenceFlushes.delete(userId);
  }
}

async function requestDisplayPermission() {
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") throw new Error("需要通知权限才能发送系统提醒。");
    return;
  }
  if (!("Notification" in window)) throw new Error("当前浏览器不支持系统通知，仍可使用 NAVA 应用内通知。");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error("需要通知权限才能发送系统提醒。");
}

async function scheduleNativeSuite(sleepTime: string, comprehensive: boolean) {
  if (!Capacitor.isNativePlatform()) return;
  const sleep = parseTime(sleepTime);
  const ids = [SLEEP_ID, WEEKLY_ID, NUTRITION_ID, FOCUS_ID, MOOD_ID, HEALTH_ID];
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  const notifications: LocalNotificationSchema[] = [
    { id: SLEEP_ID, title: "NAVA · 睡眠提醒", body: "该准备入睡了，给今天一个安静的收尾。", schedule: { on: { hour: sleep.hour, minute: sleep.minute }, allowWhileIdle: true }, extra: { notificationId: "native:sleep", category: "sleep", destination: "record/sleep/editor" } },
    { id: WEEKLY_ID, title: "NAVA · 本周健康报告", body: "小猫已经整理好你的跨模块周报。", schedule: { on: { weekday: 2, hour: 8, minute: 0 }, allowWhileIdle: true }, extra: { notificationId: "native:weekly", category: "weekly", destination: "record" } },
  ];
  if (comprehensive) notifications.push(
    { id: NUTRITION_ID, title: "NAVA · 饮食提醒", body: "记录一餐，让今天的能量和营养更清楚。", schedule: { on: { hour: 12, minute: 30 }, allowWhileIdle: true }, extra: { notificationId: "native:nutrition", category: "nutrition", destination: "record/diet/editor" } },
    { id: FOCUS_ID, title: "NAVA · 专注提醒", body: "从一个 25 分钟专注块开始今天的重点。", schedule: { on: { hour: 10, minute: 0 }, allowWhileIdle: true }, extra: { notificationId: "native:focus", category: "focus", destination: "record/focus" } },
    { id: MOOD_ID, title: "NAVA · 情绪提醒", body: "给今天的心情留一句真实记录。", schedule: { on: { hour: 20, minute: 30 }, allowWhileIdle: true }, extra: { notificationId: "native:mood", category: "mood", destination: "record/mood/editor" } },
    { id: HEALTH_ID, title: "NAVA · 今日状态", body: "看看今天的活动与恢复，按身体感受安排下一步。", schedule: { on: { hour: 18, minute: 30 }, allowWhileIdle: true }, extra: { notificationId: "native:health", category: "exercise", destination: "record/exercise" } },
  );
  await LocalNotifications.schedule({ notifications });
}

export async function enableNavaNotifications(userId: string, sleepTime = "22:30") {
  const sleep = parseTime(sleepTime);
  await requestDisplayPermission();
  await scheduleNativeSuite(sleepTime, false);
  await Promise.all([
    savePreference(userId, "sleep", `${sleep.hour.toString().padStart(2, "0")}:${sleep.minute.toString().padStart(2, "0")}`),
    savePreference(userId, "weekly_report", "08:00"),
  ]);
}

export async function enableNavaNotificationSuite(userId: string, sleepTime = "22:30", locale: "zh" | "en" = "zh") {
  const sleep = parseTime(sleepTime);
  await requestDisplayPermission();
  await scheduleNativeSuite(sleepTime, true);
  await Promise.all([
    savePreference(userId, "sleep", `${sleep.hour.toString().padStart(2, "0")}:${sleep.minute.toString().padStart(2, "0")}`),
    savePreference(userId, "nutrition", "12:30"), savePreference(userId, "focus", "10:00"),
    savePreference(userId, "mood", "20:30"), savePreference(userId, "fdnb_signal", "18:30"),
    savePreference(userId, "weekly_report", "08:00"),
  ]);
  publishNavaNotification(userId, {
    id: "system:notifications-enabled", category: "system", source: "system",
    title: locale === "zh" ? "系统提醒已开启" : "System reminders enabled",
    body: Capacitor.isNativePlatform()
      ? (locale === "zh" ? "睡眠、饮食、专注、情绪、状态和周报提醒已安排。" : "Sleep, diet, focus, mood, status, and weekly reminders are scheduled.")
      : (locale === "zh" ? "浏览器通知已授权；应用内提醒会继续使用真实记录判断。" : "Browser alerts are enabled; in-app reminders still use your real records."),
    target: { tab: "today", view: "notifications" },
  }, { present: true, replace: true });
}

export async function notificationPermissionState(): Promise<"granted" | "prompt" | "denied" | "unsupported"> {
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.checkPermissions();
    return permission.display === "granted" ? "granted" : permission.display === "prompt" || permission.display === "prompt-with-rationale" ? "prompt" : "denied";
  }
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission === "default" ? "prompt" : Notification.permission;
}

export async function clearScheduledNavaNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.cancel({
    notifications: [SLEEP_ID, WEEKLY_ID, NUTRITION_ID, FOCUS_ID, MOOD_ID, HEALTH_ID].map((id) => ({ id })),
  });
}

function targetFromDestination(destination: unknown): NavaNotificationTarget | undefined {
  if (typeof destination !== "string") return undefined;
  const [tab, module, view] = destination.split("/");
  if (!["today", "record", "ai", "trends", "profile"].includes(tab)) return undefined;
  return { tab: tab as NavaNotificationTarget["tab"], ...(module ? { module: module as NavaNotificationTarget["module"] } : {}), ...(view ? { view } : {}) };
}

function inboxItemFromNative(notification: LocalNotificationSchema): NavaNotificationItem {
  const extra = notification.extra as Record<string, unknown> | undefined;
  const notificationId = typeof extra?.notificationId === "string" ? extra.notificationId : `native:${notification.id}`;
  const category = typeof extra?.category === "string" ? extra.category as NavaNotificationCategory : "system";
  return {
    id: `${notificationId}:${new Date().toISOString().slice(0, 10)}`, category, source: "native",
    title: notification.title ?? "NAVA", body: notification.body ?? "", createdAt: new Date().toISOString(),
    target: targetFromDestination(extra?.destination),
  };
}

export async function subscribeNativeNotificationActions(userId: string, onOpen: (item: NavaNotificationItem) => void) {
  if (!Capacitor.isNativePlatform()) return null;
  const handles: PluginListenerHandle[] = [];
  handles.push(await LocalNotifications.addListener("localNotificationReceived", (notification) => {
    const item = inboxItemFromNative(notification);
    publishNavaNotification(userId, item, { present: true, replace: true });
  }));
  handles.push(await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
    const item = inboxItemFromNative(action.notification);
    publishNavaNotification(userId, { ...item, readAt: new Date().toISOString() }, { replace: true });
    onOpen(item);
  }));
  return { remove: async () => Promise.all(handles.map((handle) => handle.remove())) };
}

function presentBrowserNotification(userId: string, item: NavaNotificationItem) {
  if (Capacitor.isNativePlatform() || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(item.title, { body: item.body, tag: item.id });
    notification.onclick = () => {
      window.focus();
      window.dispatchEvent(new CustomEvent<NavaNotificationChange>(notificationEventName, {
        detail: { items: listNavaNotifications(userId), opened: item },
      }));
      notification.close();
    };
  } catch {
    // The in-app banner remains the reliable web fallback.
  }
}
