/** Calendar-local reminder policy, shared by delivery and the desktop simulator. */
export const reminderKinds = ["mood", "breakfast", "lunch", "dinner", "sleep", "exercise", "focus", "face"] as const;
export type ReminderKind = typeof reminderKinds[number];
export type ReminderPreference = { enabled: boolean; localTime: string; timezone: string; mode: "fixed" | "smart" };
export type ReminderPreferences = Record<ReminderKind, ReminderPreference>;
export type ReminderEvidence = { date: string } & Record<ReminderKind, boolean>;
export const reminderTypes = { mood: "mood", breakfast: "nutrition_breakfast", lunch: "nutrition_lunch", dinner: "nutrition_dinner", sleep: "sleep", exercise: "exercise", focus: "focus", face: "face" } as const;
export const reminderLabels = { mood: ["情绪", "Mood"], breakfast: ["早餐", "Breakfast"], lunch: ["午餐", "Lunch"], dinner: ["晚餐", "Dinner"], sleep: ["睡前放松", "Wind down"], exercise: ["运动记录", "Activity"], focus: ["专注", "Focus"], face: ["面部记录", "Face log"] } as const;
export const reminderDefaults = { mood: "20:30", breakfast: "08:30", lunch: "12:30", dinner: "19:00", sleep: "22:30", exercise: "17:30", focus: "10:00", face: "20:00" } as const;
export const reminderChangeEvent = "nava:independent-reminders-changed";
export const reminderSavedEvent = "nava:reminder-record-saved";
export const reminderPreviewEvent = "nava:preview-reminder";

export function localReminderDate(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function validReminderTime(value: string) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function reminderAt(date: Date, time: string) {
  if (!validReminderTime(time)) throw new Error("Invalid reminder time");
  const at = new Date(date);
  const [hours, minutes] = time.split(":").map(Number);
  at.setHours(hours, minutes, 0, 0);
  return at;
}
export function resolveReminderPreferences(rows: Array<{ notification_type: string; enabled: boolean; local_time: string | null; timezone: string | null; timing_mode?: string }>, timezone: string): ReminderPreferences {
  return Object.fromEntries(reminderKinds.map((kind) => {
    const row = rows.find((item) => item.notification_type === reminderTypes[kind])
      ?? (kind === "lunch" ? rows.find((item) => item.notification_type === "nutrition") : undefined);
    const time = row?.local_time?.slice(0, 5);
    return [kind, { enabled: row?.enabled === true, localTime: time && validReminderTime(time) ? time : reminderDefaults[kind], timezone: row?.timezone || timezone, mode: row?.timing_mode === "smart" ? "smart" : "fixed" }];
  })) as ReminderPreferences;
}
export function reminderEvidence(date: string, mood: { record_date: string; mood_score?: number | null } | null, nutrition: Record<string, unknown> | null): ReminderEvidence {
  const meal = (kind: string) => nutrition?.record_date === date && (
    (Array.isArray(nutrition[`${kind}_items`]) && (nutrition[`${kind}_items`] as unknown[]).length > 0)
    || (typeof nutrition[`${kind}_time`] === "string" && nutrition[`${kind}_time`] !== "")
  );
  return { date, mood: mood?.record_date === date && typeof mood.mood_score === "number" && Number.isFinite(mood.mood_score), breakfast: meal("breakfast"), lunch: meal("lunch"), dinner: meal("dinner"), sleep: false, exercise: false, focus: false, face: false };
}
export type ReminderHistory = Partial<Record<ReminderKind, Array<{ date: string; time: string }>>>;
/** Personal, bounded scheduling rules; never an LLM or an invented health claim. */
export function resolveReminderSchedule(preferences: ReminderPreferences, history: ReminderHistory, date: string): ReminderPreferences {
  const windows: Record<ReminderKind, [number, number]> = { mood: [8 * 60, 22 * 60], breakfast: [5 * 60, 11 * 60], lunch: [11 * 60, 15 * 60], dinner: [16 * 60, 22 * 60], sleep: [20 * 60, 25 * 60], exercise: [8 * 60, 21 * 60], focus: [8 * 60, 21 * 60], face: [8 * 60, 22 * 60] };
  const start = new Date(`${date}T12:00:00`); start.setDate(start.getDate() - 14);
  const startDate = localReminderDate(start);
  return Object.fromEntries(reminderKinds.map((kind) => {
    const pref = preferences[kind];
    if (pref.mode !== "smart") return [kind, { ...pref }];
    // One observation per day prevents repeated edits from skewing the median.
    const unique = new Map((history[kind] ?? []).filter((item) => item.date >= startDate && item.date < date && validReminderTime(item.time)).map((item) => [item.date, item.time]));
    const samples = [...unique.values()].map((time) => {
      const [h, m] = time.split(":").map(Number);
      const minutes = h * 60 + m;
      return kind === "sleep" && minutes < 6 * 60 ? minutes + 1440 : minutes;
    }).sort((a, b) => a - b);
    let time: string = reminderDefaults[kind];
    if (samples.length >= 3) {
      const mid = Math.floor(samples.length / 2);
      const median = samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
      const minutes = Math.max(windows[kind][0], Math.min(windows[kind][1], Math.round((median + (kind === "sleep" ? -30 : kind === "focus" ? 0 : 15)) / 5) * 5)) % 1440;
      time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    }
    return [kind, { ...pref, localTime: time }];
  })) as ReminderPreferences;
}
export function reminderEligibility(kind: ReminderKind, preferences: ReminderPreferences, evidence: ReminderEvidence, now: Date): "due" | "disabled" | "recorded" | "not-due" | "unknown" {
  if (!preferences[kind].enabled) return "disabled";
  if (evidence.date !== localReminderDate(now)) return "unknown";
  if (evidence[kind]) return "recorded";
  const elapsed = now.getTime() - reminderAt(now, preferences[kind].localTime).getTime();
  // Never greet an evening visitor with stale breakfast reminders.
  return elapsed >= 0 && elapsed < 60 * 60_000 ? "due" : "not-due";
}
export function reminderOccurrenceId(kind: ReminderKind, date: string) { return `reminder:${date}:${kind}`; }
export function reminderNativeId(kind: ReminderKind, date: string) {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  // Disjoint from the previous four-slot IDs; reconciliation removes legacy plans.
  return 2_000_000 + day * 16 + reminderKinds.indexOf(kind);
}
export function reminderMealFromView(view: string | null | undefined): "breakfast" | "lunch" | "dinner" | null {
  return view === "editor-breakfast" ? "breakfast" : view === "editor-lunch" ? "lunch" : view === "editor-dinner" ? "dinner" : null;
}
export function reminderTarget(kind: ReminderKind) {
  if (kind === "breakfast" || kind === "lunch" || kind === "dinner") return { tab: "record" as const, module: "diet" as const, view: `editor-${kind}` };
  return { tab: "record" as const, module: kind, view: kind === "focus" ? "overview" : "editor" };
}
export function buildReminderOccurrences(preferences: ReminderPreferences, evidence: ReminderEvidence, now: Date, days = 14) {
  const result: Array<{ kind: ReminderKind; date: string; at: Date; id: number }> = [];
  for (let offset = 0; offset < Math.min(14, days); offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const date = localReminderDate(day);
    for (const kind of reminderKinds) {
      if (!preferences[kind].enabled || (evidence.date === date && evidence[kind])) continue;
      const at = reminderAt(day, preferences[kind].localTime);
      if (at > now) result.push({ kind, date, at, id: reminderNativeId(kind, date) });
    }
  }
  // iOS has a finite pending queue. Reserve eight slots for other app reminders.
  return result.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 56);
}
export function emitReminderRecordSaved(userId: string, date: string, kind: ReminderKind) {
  window.dispatchEvent(new CustomEvent(reminderSavedEvent, { detail: { userId, date, kind } }));
}
