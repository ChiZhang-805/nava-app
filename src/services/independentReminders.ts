/** Calendar-local reminder policy, shared by delivery and the desktop simulator. */
export const reminderKinds = ["mood", "breakfast", "lunch", "dinner"] as const;
export type ReminderKind = typeof reminderKinds[number];
export type ReminderPreference = { enabled: boolean; localTime: string; timezone: string };
export type ReminderPreferences = Record<ReminderKind, ReminderPreference>;
export type ReminderEvidence = { date: string; mood: boolean; breakfast: boolean; lunch: boolean; dinner: boolean };
export const reminderTypes = { mood: "mood", breakfast: "nutrition_breakfast", lunch: "nutrition_lunch", dinner: "nutrition_dinner" } as const;
export const reminderLabels = { mood: ["情绪", "Mood"], breakfast: ["早餐", "Breakfast"], lunch: ["午餐", "Lunch"], dinner: ["晚餐", "Dinner"] } as const;
export const reminderDefaults = { mood: "20:30", breakfast: "08:30", lunch: "12:30", dinner: "19:00" } as const;
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
export function resolveReminderPreferences(rows: Array<{ notification_type: string; enabled: boolean; local_time: string | null; timezone: string | null }>, timezone: string): ReminderPreferences {
  return Object.fromEntries(reminderKinds.map((kind) => {
    const row = rows.find((item) => item.notification_type === reminderTypes[kind])
      ?? (kind === "lunch" ? rows.find((item) => item.notification_type === "nutrition") : undefined);
    const time = row?.local_time?.slice(0, 5);
    return [kind, { enabled: row?.enabled === true, localTime: time && validReminderTime(time) ? time : reminderDefaults[kind], timezone: row?.timezone || timezone }];
  })) as ReminderPreferences;
}
export function reminderEvidence(date: string, mood: { record_date: string; mood_score?: number | null } | null, nutrition: Record<string, unknown> | null): ReminderEvidence {
  const meal = (kind: string) => nutrition?.record_date === date && (
    (Array.isArray(nutrition[`${kind}_items`]) && (nutrition[`${kind}_items`] as unknown[]).length > 0)
    || (typeof nutrition[`${kind}_time`] === "string" && nutrition[`${kind}_time`] !== "")
  );
  return { date, mood: mood?.record_date === date && typeof mood.mood_score === "number" && Number.isFinite(mood.mood_score), breakfast: meal("breakfast"), lunch: meal("lunch"), dinner: meal("dinner") };
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
  return 1_000_000 + day * 4 + reminderKinds.indexOf(kind);
}
export function reminderMealFromView(view: string | null | undefined): Exclude<ReminderKind, "mood"> | null {
  return view === "editor-breakfast" ? "breakfast" : view === "editor-lunch" ? "lunch" : view === "editor-dinner" ? "dinner" : null;
}
export function reminderTarget(kind: ReminderKind) {
  return { tab: "record" as const, module: kind === "mood" ? "mood" as const : "diet" as const, view: kind === "mood" ? "editor" : `editor-${kind}` };
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
  return result;
}
export function emitReminderRecordSaved(userId: string, date: string, kind: ReminderKind) {
  window.dispatchEvent(new CustomEvent(reminderSavedEvent, { detail: { userId, date, kind } }));
}
