import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "./supabaseClient";
import { demoTodaySnapshot, isDemoMode } from "./demo";
import { flushPendingNotificationPreferences, notificationPermissionState } from "./notifications";
import { buildReminderOccurrences, localReminderDate, reminderChangeEvent, reminderEvidence, reminderKinds, reminderLabels, reminderOccurrenceId, reminderTarget, reminderTypes, resolveReminderPreferences, validReminderTime, type ReminderKind, type ReminderPreference, type ReminderPreferences, type ReminderEvidence } from "./independentReminders";

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
const demoKey = (userId: string) => `nava-demo-reminders:${userId}`;
export async function loadReminderPreferences(userId: string): Promise<ReminderPreferences> {
  if (isDemoMode()) return JSON.parse(localStorage.getItem(demoKey(userId)) || "null") ?? resolveReminderPreferences([], zone());
  // Drain legacy pending writes first, so an old queued mood setting cannot
  // overwrite a newly saved independent setting after reconnecting.
  await flushPendingNotificationPreferences(userId);
  const { data, error } = await supabase.from("notification_preferences")
    .select("notification_type,enabled,local_time,timezone").eq("user_id", userId)
    .in("notification_type", [...Object.values(reminderTypes), "nutrition"]);
  if (error) throw new Error("提醒设置读取失败，请联网后重试。");
  return resolveReminderPreferences(data ?? [], zone());
}
export async function saveReminderPreference(userId: string, kind: ReminderKind, preference: ReminderPreference) {
  if (!reminderKinds.includes(kind) || !validReminderTime(preference.localTime)) throw new Error("请选择有效的提醒时间。");
  const next = { ...preference, enabled: preference.enabled === true, timezone: zone() };
  if (isDemoMode()) {
    const current = await loadReminderPreferences(userId);
    localStorage.setItem(demoKey(userId), JSON.stringify({ ...current, [kind]: next }));
  } else {
    await flushPendingNotificationPreferences(userId);
    const { data, error } = await supabase.from("notification_preferences").upsert({
      user_id: userId, notification_type: reminderTypes[kind], enabled: next.enabled,
      local_time: next.localTime, timezone: next.timezone, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,notification_type" }).select("enabled,local_time,timezone").single();
    if (error || !data || data.enabled !== next.enabled || data.local_time?.slice(0, 5) !== next.localTime) {
      throw new Error("尚未确认提醒设置保存成功，请重新读取核对后重试。");
    }
  }
  window.dispatchEvent(new CustomEvent(reminderChangeEvent, { detail: { userId, kind, preference: next } }));
  return next;
}
export async function loadReminderEvidence(userId: string, date: string) {
  if (isDemoMode()) {
    const snapshot = demoTodaySnapshot(date);
    return reminderEvidence(date, snapshot.mood, snapshot.nutrition as unknown as Record<string, unknown> | null);
  }
  const [mood, diet] = await Promise.all([
    supabase.from("mood_records").select("record_date,mood_score").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    supabase.from("nutrition_records").select("record_date,breakfast_items,breakfast_time,lunch_items,lunch_time,dinner_items,dinner_time").eq("user_id", userId).eq("record_date", date).maybeSingle(),
  ]);
  if (mood.error || diet.error) throw new Error("未能核对今天的记录，提醒暂缓，联网后重试。");
  return reminderEvidence(date, mood.data, diet.data);
}
export function reminderMessage(kind: ReminderKind, date: string, locale: "zh" | "en") {
  const label = reminderLabels[kind][locale === "zh" ? 0 : 1];
  return {
    id: reminderOccurrenceId(kind, date), category: kind === "mood" ? "mood" as const : "nutrition" as const,
    source: "system" as const, createdAt: new Date().toISOString(),
    title: `${label}${locale === "zh" ? "记录提醒" : " reminder"}`,
    body: locale === "zh" ? `今天的${label}还未记录，方便时给自己留一条记录吧。` : `Today's ${label.toLowerCase()} is not logged yet. Add it when convenient.`,
    target: reminderTarget(kind),
  };
}

// One native writer, including cleanup: late requests may never resurrect a
// disabled reminder or leak the previous account's notifications after logout.
let nativeTail: Promise<unknown> = Promise.resolve();
export function cancelSavedReminder(userId: string, kind: ReminderKind, date?: string) {
  const task = nativeTail.catch(() => undefined).then(async () => {
    if (!Capacitor.isNativePlatform()) return;
    const pending = await LocalNotifications.getPending();
    const owned = pending.notifications.filter((item) => item.extra?.independentReminder && item.extra.userId === userId && item.extra.reminderKind === kind && (!date || item.extra.scheduledDate === date));
    if (owned.length) await LocalNotifications.cancel({ notifications: owned.map(({ id }) => ({ id })) });
  });
  nativeTail = task;
  return task;
}
export function reconcileNativeReminders(userId: string, preferences: ReminderPreferences | null, evidence: ReminderEvidence | null, locale: "zh" | "en", isCurrent: () => boolean = () => true) {
  const task = nativeTail.catch(() => undefined).then(async () => {
    if (!Capacitor.isNativePlatform()) return;
    if (preferences && !isCurrent()) return;
    const pending = await LocalNotifications.getPending();
    if (preferences && !isCurrent()) return;
    const owned = pending.notifications.filter((item) => item.id === 41003 || item.id === 41005 || (item.extra?.independentReminder && (preferences !== null || item.extra.userId === userId)));
    if (!preferences || !evidence) {
      if (owned.length) await LocalNotifications.cancel({ notifications: owned.map(({ id }) => ({ id })) });
      return;
    }
    if (!isCurrent() || await notificationPermissionState() !== "granted") return;
    const now = new Date();
    const notifications = buildReminderOccurrences(preferences, evidence, now).map(({ kind, date, at, id }) => {
      const message = reminderMessage(kind, date, locale);
      return { id, title: message.title, body: message.body, schedule: { at, repeats: false, allowWhileIdle: true }, extra: {
        independentReminder: true, userId, reminderKind: kind, scheduledDate: date, scheduledAt: at.getTime(), localTime: preferences[kind].localTime, notificationId: message.id, category: message.category,
        destination: `record/${message.target.module}/${message.target.view}`,
      } };
    });
    const unchanged = new Set<number>();
    for (const item of owned) {
      const extra = item.extra;
      if (!extra?.independentReminder || extra.userId !== userId) continue;
      const desired = notifications.find((next) => next.id === item.id);
      if (desired && desired.extra.scheduledAt === extra.scheduledAt && desired.title === item.title) unchanged.add(item.id);
      // Do not cancel an Android alarm merely because Doze delayed it past its
      // nominal time. Explicit off/save still cancels it, and stale days expire.
      const kind = extra.reminderKind as ReminderKind;
      if (!desired && reminderKinds.includes(kind) && extra.scheduledDate === localReminderDate(now)
        && preferences[kind].enabled && preferences[kind].localTime === extra.localTime && !evidence[kind]) unchanged.add(item.id);
    }
    if (!isCurrent()) return;
    const obsolete = owned.filter((item) => !unchanged.has(item.id));
    if (obsolete.length) await LocalNotifications.cancel({ notifications: obsolete.map(({ id }) => ({ id })) });
    const added = notifications.filter((item) => !unchanged.has(item.id) && item.schedule.at > new Date());
    if (isCurrent() && added.length) await LocalNotifications.schedule({ notifications: added });
  });
  nativeTail = task;
  return task;
}
