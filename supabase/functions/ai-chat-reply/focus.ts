import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { resolveConsentFlag } from "../_shared/consent.ts";
import type { FocusEvidence } from "../_shared/focus-contract.ts";

/** Only server-read, consent-authorized values may be called saved evidence. */
export async function loadFocusEvidence(client: SupabaseClient, userId: string, deviceDate: unknown, signal?: AbortSignal): Promise<FocusEvidence[]> {
  if (typeof deviceDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deviceDate)
    || !Number.isFinite(Date.parse(`${deviceDate}T00:00:00Z`)) || new Date(`${deviceDate}T00:00:00Z`).toISOString().slice(0, 10) !== deviceDate) throw new Error("invalid_device_date");
  const profileQuery = client.from("profiles").select("ai_personalization_consent,onboarding_answers").eq("id", userId);
  const profile = await (signal ? profileQuery.abortSignal(signal) : profileQuery).maybeSingle();
  if (profile.error) throw new Error("AI consent could not be verified.");
  if (!resolveConsentFlag(profile.data?.ai_personalization_consent, profile.data?.onboarding_answers?.aiPersonalizationConsent)) return [];
  const start = new Date(`${deviceDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const startDate = start.toISOString().slice(0, 10);
  const read = (table: string, columns: string) => {
    const query = client.from(table).select(columns).eq("user_id", userId)
      .gte("record_date", startDate).lte("record_date", deviceDate).order("record_date", { ascending: false }).limit(7);
    return signal ? query.abortSignal(signal) : query;
  };
  const [sleep, mood, exercise] = await Promise.all([
    read("sleep_records", "record_date,sleep_duration_minutes"), read("mood_records", "record_date,mood_score"),
    read("exercise_records", "record_date,exercise_minutes,steps"),
  ]);
  if (sleep.error || mood.error || exercise.error) throw new Error("Saved focus evidence could not be loaded.");
  const valid = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const rows = (value: unknown) => (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const evidence: FocusEvidence[] = [];
  const s = rows(sleep.data).find((r) => valid(r.sleep_duration_minutes, 1, 1440));
  const m = rows(mood.data).find((r) => valid(r.mood_score, 0, 100));
  const e = rows(exercise.data).find((r) => valid(r.exercise_minutes, 1, 1440) || valid(r.steps, 1, 200000));
  if (s) evidence.push({ domain: "sleep", date: String(s.record_date), value: Math.round(Number(s.sleep_duration_minutes)), unit: "minutes" });
  if (m) evidence.push({ domain: "mood", date: String(m.record_date), value: Math.round(Number(m.mood_score)), unit: "score" });
  if (e) {
    const hasMinutes = valid(e.exercise_minutes, 1, 1440);
    evidence.push({ domain: "exercise", date: String(e.record_date), value: Math.round(Number(hasMinutes ? e.exercise_minutes : e.steps)), unit: hasMinutes ? "minutes" : "steps" });
  }
  return evidence;
}
