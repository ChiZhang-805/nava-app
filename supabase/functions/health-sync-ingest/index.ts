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
  date?: string;
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
  latestHeartRate?: number | string;
  restingHeartRate?: number | string;
  heartRateVariabilitySDNN?: number | string;
  latestBloodOxygen?: number | string;
  sleepMinutes?: number;
  sleepStart?: string;
  sleepEnd?: string;
  sleepStartLocal?: string;
  sleepEndLocal?: string;
  sleepEfficiency?: number;
  sleepStageMinutes?: Record<string, number>;
  activityBins?: Array<Record<string, unknown>>;
  activityCoverageHours?: number;
  timezoneOffsetMinutes?: number;
  sourceMetadata?: Record<string, unknown>;
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
    const requestedDate = normalizeDate(body.date);
    const rawSummaries = Array.isArray(body.summaries) ? body.summaries : [body.summary ?? body];
    if (rawSummaries.length === 0) throw new Error("请至少提供 1 天健康摘要。");
    if (rawSummaries.length > 31) throw new Error("单次最多同步 31 天健康摘要。");
    const summaries = rawSummaries
      .map((item) => normalizeSummary(item as Record<string, unknown>))
      .sort((left, right) => String(left.date ?? requestedDate).localeCompare(String(right.date ?? requestedDate)));

    const job = await userClient
      .from("health_sync_jobs")
      .insert({
        user_id: user.id,
        source: summaries[0]?.source ?? "apple_health",
        status: "running",
        started_at: startedAt,
      })
      .select("id")
      .single();
    assertNoError(job.error);
    if (!job.data?.id) throw new Error("无法创建健康同步任务。");
    jobId = job.data.id;

    let uploaded = 0;
    const syncedDates: string[] = [];
    for (const summary of summaries) {
      const date = normalizeDate(summary.date ?? requestedDate);
      if (hasHealthMetrics(summary)) {
        await upsertHealthMetricSnapshot(userClient, user.id, date, summary);
        uploaded += 1;
      }
      if (hasExerciseMetrics(summary)) {
        await upsertExercise(userClient, user.id, date, summary);
        uploaded += 1;
      }
      if (summary.sleepMinutes && summary.sleepMinutes > 0) {
        await upsertSleep(userClient, user.id, date, summary);
        uploaded += 1;
      }
      syncedDates.push(date);
    }

    const scoringDate = syncedDates.includes(requestedDate) ? requestedDate : syncedDates.at(-1) ?? requestedDate;
    const rhythm = calculateRhythm(await loadDailyInputs(userClient, user.id, scoringDate));
    await saveRhythmScore(userClient, user.id, rhythm);

    const finishedAt = new Date().toISOString();
    const update = await userClient
      .from("health_sync_jobs")
      .update({ status: "success", finished_at: finishedAt, sample_count: uploaded })
      .eq("id", jobId);
    assertNoError(update.error);

    return jsonResponse({ uploaded, syncedDates: [...new Set(syncedDates)], jobId, lastSyncDate: finishedAt, rhythm });
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
    date: stringValue(input.date) ?? stringValue(input.record_date),
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
    sleepStart: stringValue(input.sleepStart) ?? stringValue(input.sleep_start),
    sleepEnd: stringValue(input.sleepEnd) ?? stringValue(input.sleep_end),
    sleepStartLocal: stringValue(input.sleepStartLocal) ?? stringValue(input.sleep_start_local),
    sleepEndLocal: stringValue(input.sleepEndLocal) ?? stringValue(input.sleep_end_local),
    sleepEfficiency: numberValue(input.sleepEfficiency) ?? numberValue(input.sleep_efficiency),
    sleepStageMinutes: normalizeNumberRecord(input.sleepStageMinutes ?? input.sleep_stage_minutes),
    activityBins: Array.isArray(input.activityBins) ? input.activityBins as Array<Record<string, unknown>> : Array.isArray(input.activity_bins) ? input.activity_bins as Array<Record<string, unknown>> : undefined,
    activityCoverageHours: numberValue(input.activityCoverageHours) ?? numberValue(input.activity_coverage_hours),
    timezoneOffsetMinutes: numberValue(input.timezoneOffsetMinutes) ?? numberValue(input.timezone_offset_minutes),
    sourceMetadata: normalizeRecord(input.sourceMetadata ?? input.source_metadata),
    source: stringValue(input.source),
  };
}

function hasExerciseMetrics(summary: HealthSummary) {
  return [summary.steps, summary.activeEnergyKcal, summary.exerciseMinutes, summary.latestHeartRate, summary.latestBloodOxygen]
    .some((value) => value != null);
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
      summary.sleepMinutes ||
      (summary.activityBins?.length ?? 0) > 0 ||
      Object.keys(summary.sleepStageMinutes ?? {}).length > 0,
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
      activity_bins: summary.activityBins ?? [],
      sleep_stage_minutes: summary.sleepStageMinutes ?? {},
      sleep_start_at: validIso(summary.sleepStart),
      sleep_end_at: validIso(summary.sleepEnd),
      sleep_efficiency: summary.sleepEfficiency ?? null,
      timezone_offset_minutes: summary.timezoneOffsetMinutes == null ? null : Math.round(summary.timezoneOffsetMinutes),
      activity_coverage_hours: summary.activityCoverageHours ?? observedActivityHours(summary.activityBins),
      source_metadata: summary.sourceMetadata ?? {},
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
  const stages = summary.sleepStageMinutes ?? {};
  const start = normalizeClock(summary.sleepStartLocal) ?? localClockFromIso(summary.sleepStart, summary.timezoneOffsetMinutes);
  const end = normalizeClock(summary.sleepEndLocal) ?? localClockFromIso(summary.sleepEnd, summary.timezoneOffsetMinutes);
  const rhythmScore = Math.round(Math.min(100, Math.max(0, 68 + Math.min(18, 18 - Math.abs(450 - duration) / 9))));
  const { error } = await client.from("sleep_records").upsert(
    {
      user_id: userId,
      record_date: date,
      sleep_start: start,
      sleep_end: end,
      sleep_duration_minutes: duration,
      deep_sleep_minutes: roundedStage(stages.deep),
      light_sleep_minutes: roundedStage(stages.core ?? stages.light),
      rem_minutes: roundedStage(stages.rem),
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

function normalizeNumberRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, numberValue(item) ?? 0])
      .filter(([, item]) => Number(item) >= 0),
  );
}

function normalizeRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function validIso(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeClock(value?: string) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : null;
}

function localClockFromIso(value?: string, timezoneOffsetMinutes?: number) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const shifted = new Date(parsed.getTime() + (timezoneOffsetMinutes ?? 0) * 60_000);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

function roundedStage(value: unknown) {
  const parsed = numberValue(value);
  return parsed == null ? null : Math.max(0, Math.round(parsed));
}

function observedActivityHours(bins?: Array<Record<string, unknown>>) {
  if (!bins) return null;
  return new Set(bins.map((item) => numberValue(item.hour)).filter((value) => value != null)).size;
}
