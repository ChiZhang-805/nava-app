import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "./supabaseClient";
import { demoTodaySnapshot, isDemoMode } from "./demo";
import { flushPendingNotificationPreferences, notificationPermissionState } from "./notifications";
import { buildReminderOccurrences, localReminderDate, reminderChangeEvent, reminderEvidence, reminderKinds, reminderLabels, reminderOccurrenceId, reminderTarget, reminderTypes, resolveReminderPreferences, resolveReminderSchedule, validReminderTime, type ReminderKind, type ReminderPreference, type ReminderPreferences, type ReminderEvidence, type ReminderHistory } from "./independentReminders";

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
const demoKey = (userId: string) => `nava-demo-reminders:${userId}`;
export async function loadReminderPreferences(userId: string): Promise<ReminderPreferences> {
  if (isDemoMode()) {
    const saved = JSON.parse(localStorage.getItem(demoKey(userId)) || "null");
    const defaults = resolveReminderPreferences([], zone());
    return Object.fromEntries(reminderKinds.map((kind) => [kind, { ...defaults[kind], ...saved?.[kind] }])) as ReminderPreferences;
  }
  // Drain legacy pending writes first, so an old queued mood setting cannot
  // overwrite a newly saved independent setting after reconnecting.
  await flushPendingNotificationPreferences(userId);
  const { data, error } = await supabase.from("notification_preferences")
    .select("notification_type,enabled,local_time,timezone,timing_mode").eq("user_id", userId)
    .in("notification_type", [...Object.values(reminderTypes), "nutrition"]);
  if (error) throw new Error("提醒设置读取失败，请联网后重试。");
  return resolveReminderPreferences(data ?? [], zone());
}
export async function saveReminderPreference(userId: string, kind: ReminderKind, preference: ReminderPreference) {
  if (!reminderKinds.includes(kind) || !validReminderTime(preference.localTime)) throw new Error("请选择有效的提醒时间。");
  const next = { ...preference, enabled: preference.enabled === true, timezone: zone(), mode: preference.mode === "smart" ? "smart" as const : "fixed" as const };
  if (isDemoMode()) {
    const current = await loadReminderPreferences(userId);
    localStorage.setItem(demoKey(userId), JSON.stringify({ ...current, [kind]: next }));
  } else {
    await flushPendingNotificationPreferences(userId);
    const { data, error } = await supabase.from("notification_preferences").upsert({
      user_id: userId, notification_type: reminderTypes[kind], enabled: next.enabled,
      local_time: next.localTime, timing_mode: next.mode, timezone: next.timezone, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,notification_type" }).select("enabled,local_time,timezone,timing_mode").single();
    if (error || !data || data.enabled !== next.enabled || data.local_time?.slice(0, 5) !== next.localTime || data.timing_mode !== next.mode) {
      throw new Error("尚未确认提醒设置保存成功，请重新读取核对后重试。");
    }
  }
  window.dispatchEvent(new CustomEvent(reminderChangeEvent, { detail: { userId, kind, preference: next } }));
  return next;
}
export async function loadReminderEvidence(userId: string, date: string) {
  if (isDemoMode()) {
    const snapshot = demoTodaySnapshot(date);
    return { ...reminderEvidence(date, snapshot.mood, snapshot.nutrition as unknown as Record<string, unknown> | null), exercise: snapshot.exercise != null, focus: snapshot.focusMinutes > 0, face: snapshot.face != null };
  }
  const [mood, diet, exercise, focus, face] = await Promise.all([
    supabase.from("mood_records").select("record_date,mood_score").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    supabase.from("nutrition_records").select("record_date,breakfast_items,breakfast_time,lunch_items,lunch_time,dinner_items,dinner_time").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    supabase.from("exercise_records").select("steps,exercise_minutes,self_rating").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    supabase.from("focus_records").select("total_minutes").eq("user_id", userId).eq("record_date", date),
    supabase.from("face_records").select("overall_score").eq("user_id", userId).eq("record_date", date),
  ]);
  if ([mood, diet, exercise, focus, face].some((result) => result.error)) throw new Error("未能核对今天的记录，提醒暂缓，联网后重试。");
  return { ...reminderEvidence(date, mood.data, diet.data), exercise: exercise.data != null && [exercise.data.steps, exercise.data.exercise_minutes, exercise.data.self_rating].some((v) => v != null), focus: (focus.data ?? []).some((row) => row.total_minutes > 0), face: (face.data ?? []).some((row) => row.overall_score != null) };
}

let historyCache: { key: string; expires: number; value: Promise<ReminderHistory> } | null = null;
export async function loadEffectiveReminderPreferences(userId: string, preferences: ReminderPreferences, date: string) {
  if (!reminderKinds.some((kind) => preferences[kind].enabled && preferences[kind].mode === "smart")) return preferences;
  if (isDemoMode()) return resolveReminderSchedule(preferences, {}, date);
  const key = `${userId}:${date}`;
  if (!historyCache || historyCache.key !== key || historyCache.expires < Date.now()) {
    const value = (async () => {
      const start = new Date(`${date}T12:00:00`); start.setDate(start.getDate() - 14);
      const read = (table: string, fields: string) => supabase.from(table).select(fields).eq("user_id", userId).gte("record_date", localReminderDate(start)).lt("record_date", date).order("record_date", { ascending: true }).limit(100);
      const sources = await Promise.all([
        read("nutrition_records", "record_date,breakfast_time,lunch_time,dinner_time"),
        read("sleep_records", "record_date,sleep_start"), read("mood_records", "record_date,created_at"),
        read("exercise_records", "record_date,created_at"), read("focus_records", "record_date,started_at"), read("face_records", "record_date,created_at"),
      ]);
      if (sources.some((source) => source.error)) throw new Error("智能提醒读取失败，请重试。");
      const history: ReminderHistory = {};
      const add = (kind: ReminderKind, day: string, raw: unknown, timestamp = false) => {
        if (typeof raw !== "string") return;
        let time = raw.slice(0, 5);
        if (timestamp) {
          const at = new Date(raw);
          // Backfills/imports are not observations of a person's daily habit.
          if (!Number.isFinite(at.getTime()) || localReminderDate(at) !== day) return;
          time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
        }
        if (validReminderTime(time)) (history[kind] ??= []).push({ date: day, time });
      };
      const rows = sources.map((source) => source.data as unknown as Array<Record<string, unknown>>);
      rows[0].forEach((row) => { for (const kind of ["breakfast", "lunch", "dinner"] as const) add(kind, String(row.record_date), row[`${kind}_time`]); });
      rows[1].forEach((row) => add("sleep", String(row.record_date), row.sleep_start));
      (["mood", "exercise", "focus", "face"] as const).forEach((kind, index) => rows[index + 2].forEach((row) => add(kind, String(row.record_date), row[kind === "focus" ? "started_at" : "created_at"], true)));
      return history;
    })();
    historyCache = { key, expires: Date.now() + 5 * 60_000, value };
    void value.catch(() => { if (historyCache?.value === value) historyCache = null; });
  }
  return resolveReminderSchedule(preferences, await historyCache.value, date);
}
export function reminderMessage(kind: ReminderKind, date: string, locale: "zh" | "en") {
  const label = reminderLabels[kind][locale === "zh" ? 0 : 1];
  return {
    id: reminderOccurrenceId(kind, date), category: kind === "breakfast" || kind === "lunch" || kind === "dinner" ? "nutrition" as const : kind,
    source: "system" as const, createdAt: new Date().toISOString(),
    title: `${label}${locale === "zh" ? (kind === "sleep" || kind === "focus" || kind === "face" || kind === "exercise" ? "提醒" : "记录提醒") : " reminder"}`,
    body: kind === "sleep" ? (locale === "zh" ? "放下手边的事，给自己一点睡前放松的时间。" : "Take a little time to unwind before bed.") : kind === "focus" ? (locale === "zh" ? "挑一件重要的小事，开始一段专注吧。" : "Choose one small task and start a focus session.") : locale === "zh" ? `方便时，给今天留一条${label.replace("记录", "")}记录吧。` : `Add a ${label.toLowerCase()} entry when convenient.`,
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
    const owned = pending.notifications.filter((item) => [41001, 41003, 41004, 41005].includes(item.id) || (item.extra?.independentReminder && (preferences !== null || item.extra.userId === userId)));
    if (!preferences || !evidence) {
      if (owned.length) await LocalNotifications.cancel({ notifications: owned.map(({ id }) => ({ id })) });
      return;
    }
    if (!isCurrent() || await notificationPermissionState() !== "granted") return;
    const now = new Date();
    const capacity = Math.max(0, Math.min(56, 64 - (pending.notifications.length - owned.length)));
    const notifications = buildReminderOccurrences(preferences, evidence, now).slice(0, capacity).map(({ kind, date, at, id }) => {
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
