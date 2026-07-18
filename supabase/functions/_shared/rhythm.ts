import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { asArray, assertNoError } from "./http.ts";
import {
  calculateRhythm,
  rhythmModelVersion,
  rhythmSchemaVersion,
  type DailyRecord,
  type RhythmInputs,
} from "./rhythm-core.ts";

export { calculateRhythm, rhythmModelVersion, rhythmSchemaVersion } from "./rhythm-core.ts";
export type { DailyRecord, RhythmInputs, RhythmSignal } from "./rhythm-core.ts";

const historyWindowDays = 42;

export async function loadDailyInputs(client: SupabaseClient, userId: string, date: string): Promise<RhythmInputs> {
  const start = shiftDate(date, -historyWindowDays);
  const [moodRes, sleepRes, exerciseRes, nutritionRes, focusRes, healthRes] = await Promise.all([
    client.from("mood_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
    client.from("sleep_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
    client.from("exercise_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
    client.from("nutrition_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
    client.from("focus_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
    client.from("health_metric_snapshots").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
  ]);

  [moodRes, sleepRes, exerciseRes, nutritionRes, focusRes, healthRes].forEach((response) => assertNoError(response.error));

  const moods = latestByDate(asArray<Record<string, unknown>>(moodRes.data));
  const sleeps = latestByDate(asArray<Record<string, unknown>>(sleepRes.data));
  const exercises = latestByDate(asArray<Record<string, unknown>>(exerciseRes.data));
  const nutritions = latestByDate(asArray<Record<string, unknown>>(nutritionRes.data));
  const health = latestByDate(asArray<Record<string, unknown>>(healthRes.data));
  const focusByDate = aggregateFocus(asArray<Record<string, unknown>>(focusRes.data));

  const timeline = eachDate(start, date).map((day) => {
    const focus = focusByDate.get(day) ?? { minutes: 0, sessions: 0 };
    return {
      date: day,
      mood: moods.get(day) ?? null,
      sleep: sleeps.get(day) ?? null,
      exercise: exercises.get(day) ?? null,
      nutrition: nutritions.get(day) ?? null,
      health: health.get(day) ?? null,
      focusMinutes: focus.minutes,
      focusSessions: focus.sessions,
    } satisfies DailyRecord;
  });

  return {
    date,
    today: timeline.at(-1) ?? emptyDay(date),
    history: timeline.filter((item) => item.date < date),
  };
}

export async function saveRhythmScore(client: SupabaseClient, userId: string, result: ReturnType<typeof calculateRhythm>) {
  const circadianScore = result.signals.find((signal) => signal.key === "circadian")?.score ?? null;
  const dataQualityScore = result.features.dataQuality.score;
  const { error } = await client.from("daily_rhythm_scores").upsert(
    {
      user_id: userId,
      record_date: result.date,
      score: result.score,
      confidence: result.confidence,
      signals: result.signals,
      reasons: result.reasons,
      actions: result.actions,
      model_version: rhythmModelVersion,
      features: result.features,
      baseline: result.baseline,
      anomaly_flags: result.anomalyFlags,
      fusion: result.fusion,
      phase_shift_minutes: result.phaseShiftMinutes,
      regularity_score: result.regularityScore,
      fragmentation_score: result.fragmentationScore,
      recovery_score: result.recoveryScore,
      circadian_score: circadianScore,
      data_quality_score: dataQualityScore,
      profile_labels: result.profileLabels,
      score_lower: result.scoreInterval.lower,
      score_upper: result.scoreInterval.upper,
      latent_state: result.fusion.stateFactors,
      change_point_probability: result.fusion.changePointProbability,
      trend_slope: result.fusion.trendSlope,
      schema_version: rhythmSchemaVersion,
    },
    { onConflict: "user_id,record_date" },
  );
  assertNoError(error);
}

function latestByDate(rows: Record<string, unknown>[]) {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const date = String(row.record_date ?? "");
    if (!date) continue;
    const existing = map.get(date);
    if (!existing || timestamp(row) >= timestamp(existing)) map.set(date, row);
  }
  return map;
}

function timestamp(row: Record<string, unknown>) {
  const raw = row.updated_at ?? row.created_at ?? "";
  const value = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(value) ? value : 0;
}

function aggregateFocus(rows: Record<string, unknown>[]) {
  const map = new Map<string, { minutes: number; sessions: number }>();
  for (const row of rows) {
    const date = String(row.record_date ?? "");
    if (!date) continue;
    const current = map.get(date) ?? { minutes: 0, sessions: 0 };
    current.minutes += numeric(row.total_minutes);
    current.sessions += numeric(row.completed_sessions);
    map.set(date, current);
  }
  return map;
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function emptyDay(date: string): DailyRecord {
  return { date, mood: null, sleep: null, exercise: null, nutrition: null, health: null, focusMinutes: 0, focusSessions: 0 };
}

function shiftDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function eachDate(start: string, end: string) {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = shiftDate(cursor, 1)) dates.push(cursor);
  return dates;
}
