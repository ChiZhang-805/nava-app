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
}

export interface NavaNotificationChange {
  items: NavaNotificationItem[];
  presented?: NavaNotificationItem;
  opened?: NavaNotificationItem;
}

type PreferenceType = "sleep" | "nutrition" | "mood" | "focus" | "weekly_report" | "fdnb_signal";

function inboxKey(userId: string) {
  return `nava-notification-inbox:v1:${userId}`;
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

function writeStoredItems(userId: string, items: NavaNotificationItem[], presented?: NavaNotificationItem) {
  const compacted = compactItems(items);
  window.localStorage.setItem(inboxKey(userId), JSON.stringify(compacted));
  emitChange(userId, presented);
  return visibleItems(compacted);
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
  return () => {
    window.removeEventListener(notificationEventName, onChange);
    window.removeEventListener("storage", onStorage);
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

  const item: NavaNotificationItem = { ...input, createdAt: input.createdAt ?? new Date().toISOString() };
  if (existingIndex >= 0) items.splice(existingIndex, 1, item);
  else items.unshift(item);
  writeStoredItems(userId, items, options.present ? item : undefined);
  if (options.present) presentBrowserNotification(userId, item);
  return { item, created: existingIndex < 0 };
}

export function markNavaNotification(userId: string, id: string, read: boolean) {
  return markNavaNotifications(userId, [id], read);
}

export function markNavaNotifications(userId: string, ids: string[], read: boolean) {
  const selected = new Set(ids);
  const now = new Date().toISOString();
  return writeStoredItems(userId, readStoredItems(userId).map((item) => (
    selected.has(item.id) ? { ...item, readAt: read ? now : undefined } : item
  )));
}

export function markAllNavaNotificationsRead(userId: string) {
  const now = new Date().toISOString();
  return writeStoredItems(userId, readStoredItems(userId).map((item) => (
    item.deletedAt || item.readAt ? item : { ...item, readAt: now }
  )));
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
  writeStoredItems(userId, items.map((candidate) => (
    selected.has(candidate.id) && !candidate.deletedAt ? { ...candidate, deletedAt } : candidate
  )));
  return removed;
}

export function restoreNavaNotification(userId: string, item: NavaNotificationItem) {
  return restoreNavaNotifications(userId, [item]);
}

export function restoreNavaNotifications(userId: string, restoredItems: NavaNotificationItem[]) {
  const items = readStoredItems(userId);
  for (const item of restoredItems) {
    const restored = { ...item, deletedAt: undefined };
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) items.splice(index, 1, restored);
    else items.unshift(restored);
  }
  return writeStoredItems(userId, items);
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

export function syncContextualNotifications(userId: string, snapshot: import("../types").TodaySnapshot, locale: "zh" | "en", now = new Date()) {
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
    const result = publishNavaNotification(userId, { ...item, source: "contextual" }, { present: !presented });
    if (result.created && !presented) presented = true;
  }
  return listNavaNotifications(userId);
}

export function ensureNotificationQaState(userId: string, locale: "zh" | "en") {
  if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get("qa") !== "notifications") return;
  const now = Date.now();
  const qaItems: Array<Omit<NavaNotificationItem, "source">> = [
    { id: "qa:notification-banner", category: "system", createdAt: new Date(now).toISOString(), title: locale === "zh" ? "NAVA 今日提醒" : "NAVA reminder", body: locale === "zh" ? "轻轻补齐一项记录，今天的节律画像就会更完整。" : "Add one record to complete today's rhythm picture.", target: { tab: "record" } },
    { id: "qa:sleep", category: "sleep", createdAt: new Date(now - 18 * 60_000).toISOString(), title: locale === "zh" ? "今晚早点放松" : "Wind down earlier", body: locale === "zh" ? "把睡眠提醒设在准备休息前，留一点安静过渡。" : "Set a reminder before bed for a calmer transition.", target: { tab: "record", module: "sleep", view: "editor" } },
    { id: "qa:nutrition", category: "nutrition", createdAt: new Date(now - 75 * 60_000).toISOString(), title: locale === "zh" ? "午餐还没有记录" : "Lunch is not recorded", body: locale === "zh" ? "拍一张照片或手动补充今天的午餐，营养视图、能量结构和本周健康报告都会根据这条真实记录同步更新。" : "Capture a photo or add lunch manually so nutrition, energy balance, and the weekly health report can update from this real record.", target: { tab: "record", module: "diet", view: "editor" } },
    { id: "qa:focus", category: "focus", createdAt: new Date(now - 26 * 60 * 60_000).toISOString(), title: locale === "zh" ? "完成一个专注块" : "Focus block completed", body: locale === "zh" ? "昨天的 25 分钟已经保存，可以在历史里回看。" : "Yesterday's 25 minutes are saved in history.", target: { tab: "record", module: "focus", view: "history" }, readAt: new Date(now - 25 * 60 * 60_000).toISOString() },
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

async function savePreference(userId: string, type: PreferenceType, localTime: string) {
  if (isDemoMode()) return;
  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: userId, notification_type: type, enabled: true, local_time: localTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    last_scheduled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,notification_type" });
  if (error) {
    if (/notification_preferences|schema cache|does not exist/i.test(error.message)) throw new Error("共享后端尚未启用通知偏好存储，本次提醒设置没有保存到账号。");
    throw error;
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
