import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import {
  assertNoError,
  errorResponse,
  jsonResponse,
  normalizeDate,
  numberValue,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";
import { calculateRhythm, loadDailyInputs, saveRhythmScore } from "../_shared/rhythm.ts";

type HealthSummary = {
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
  latestHeartRate?: number | string;
  restingHeartRate?: number | string;
  heartRateVariabilitySDNN?: number | string;
  latestBloodOxygen?: number | string;
  sleepMinutes?: number;
  source?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  const startedAt = new Date().toISOString();
  let jobId: string | undefined;

  try {
    const { user, userClient } = await requireUser(req);
    const body = await readJson(req);
    const date = normalizeDate(body.date);
    const summary = normalizeSummary((body.summary ?? body) as Record<string, unknown>);

    const job = await userClient
      .from("health_sync_jobs")
      .insert({
        user_id: user.id,
        source: summary.source ?? "apple_health",
        status: "running",
        started_at: startedAt,
      })
      .select("id")
      .single();
    assertNoError(job.error);
    jobId = job.data.id;

    let uploaded = 0;
    if (hasHealthMetrics(summary)) {
      await upsertHealthMetricSnapshot(userClient, user.id, date, summary);
      uploaded += 1;
    }

    if (summary.steps || summary.activeEnergyKcal || summary.exerciseMinutes || summary.latestHeartRate || summary.latestBloodOxygen) {
      await upsertExercise(userClient, user.id, date, summary);
      uploaded += 1;
    }

    if (summary.sleepMinutes && summary.sleepMinutes > 0) {
      await upsertSleep(userClient, user.id, date, summary);
      uploaded += 1;
    }

    const rhythm = calculateRhythm(await loadDailyInputs(userClient, user.id, date));
    await saveRhythmScore(userClient, user.id, rhythm);

    const finishedAt = new Date().toISOString();
    const update = await userClient
      .from("health_sync_jobs")
      .update({ status: "success", finished_at: finishedAt, sample_count: uploaded })
      .eq("id", jobId);
    assertNoError(update.error);

    return jsonResponse({ uploaded, jobId, lastSyncDate: finishedAt, rhythm });
  } catch (error) {
    if (jobId) {
      try {
        const { userClient } = await requireUser(req);
        await userClient
          .from("health_sync_jobs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : String(error),
          })
          .eq("id", jobId);
      } catch {
        // The original error is more useful to the client.
      }
    }
    return errorResponse(error);
  }
});

function normalizeSummary(input: Record<string, unknown>): HealthSummary {
  return {
    steps: numberValue(input.steps),
    activeEnergyKcal: numberValue(input.activeEnergyKcal) ?? numberValue(input.active_energy_kcal),
    exerciseMinutes: numberValue(input.exerciseMinutes) ?? numberValue(input.exercise_minutes),
    latestHeartRate: numberValue(input.latestHeartRate) ?? stringValue(input.latestHeartRate),
    restingHeartRate: numberValue(input.restingHeartRate) ?? numberValue(input.resting_heart_rate) ?? stringValue(input.restingHeartRate),
    heartRateVariabilitySDNN:
      numberValue(input.heartRateVariabilitySDNN) ??
      numberValue(input.heart_rate_variability_sdnn) ??
      numberValue(input.hrvSdnn) ??
      stringValue(input.heartRateVariabilitySDNN),
    latestBloodOxygen: numberValue(input.latestBloodOxygen) ?? stringValue(input.latestBloodOxygen),
    sleepMinutes: numberValue(input.sleepMinutes) ?? numberValue(input.sleep_minutes),
    source: stringValue(input.source),
  };
}

function hasHealthMetrics(summary: HealthSummary) {
  return Boolean(
    summary.latestHeartRate ||
      summary.restingHeartRate ||
      summary.heartRateVariabilitySDNN ||
      summary.latestBloodOxygen ||
      summary.steps ||
      summary.activeEnergyKcal ||
      summary.exerciseMinutes ||
      summary.sleepMinutes,
  );
}

async function upsertHealthMetricSnapshot(client: SupabaseClient, userId: string, date: string, summary: HealthSummary) {
  const { error } = await client.from("health_metric_snapshots").upsert(
    {
      user_id: userId,
      record_date: date,
      latest_heart_rate: numericOrNull(summary.latestHeartRate),
      resting_heart_rate: numericOrNull(summary.restingHeartRate),
      heart_rate_variability_sdnn: numericOrNull(summary.heartRateVariabilitySDNN),
      blood_oxygen: numericOrNull(normalizeSpo2(summary.latestBloodOxygen)),
      raw_payload: summary,
      source: summary.source ?? "apple_health",
    },
    { onConflict: "user_id,record_date,source" },
  );
  assertNoError(error);
}

async function upsertExercise(client: SupabaseClient, userId: string, date: string, summary: HealthSummary) {
  const { error } = await client.from("exercise_records").upsert(
    {
      user_id: userId,
      record_date: date,
      steps: Math.round(summary.steps ?? 0),
      calories: Math.round(summary.activeEnergyKcal ?? 0),
      exercise_minutes: Math.round(summary.exerciseMinutes ?? 0),
      heart_rate: normalizeHeartRate(summary.latestHeartRate),
      spo2: normalizeSpo2(summary.latestBloodOxygen),
      device_type: "apple_health",
    },
    { onConflict: "user_id,record_date" },
  );
  assertNoError(error);
}

async function upsertSleep(client: SupabaseClient, userId: string, date: string, summary: HealthSummary) {
  const duration = Math.round(summary.sleepMinutes ?? 0);
  const rhythmScore = Math.round(Math.min(100, Math.max(0, 68 + Math.min(18, 18 - Math.abs(450 - duration) / 9))));
  const { error } = await client.from("sleep_records").upsert(
    {
      user_id: userId,
      record_date: date,
      sleep_duration_minutes: duration,
      device_type: "apple_watch",
      rhythm_score: rhythmScore,
    },
    { onConflict: "user_id,record_date" },
  );
  assertNoError(error);
}

function normalizeSpo2(value: number | string | undefined) {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric <= 1 ? `${Math.round(numeric * 100)}%` : `${Math.round(numeric)}%`;
  return String(value);
}

function normalizeHeartRate(value: number | string | undefined) {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return String(Math.round(numeric));
  const text = String(value).trim();
  return text || null;
}

function numericOrNull(value: number | string | null | undefined) {
  if (value == null) return null;
  const numeric = Number(String(value).replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : null;
}
