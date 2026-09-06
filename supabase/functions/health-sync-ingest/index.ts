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
import { requireHealthSyncConsent } from "../_shared/consent.ts";

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
    await requireHealthSyncConsent(userClient, user.id);
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
      let savedForDate = false;
      if (hasHealthMetrics(summary)) {
        await upsertHealthMetricSnapshot(userClient, user.id, date, summary);
        uploaded += 1;
        savedForDate = true;
      }
      if (hasExerciseMetrics(summary)) {
        const savedExercise = await upsertExercise(userClient, user.id, date, summary);
        if (savedExercise) {
          uploaded += 1;
          savedForDate = true;
        }
      }
      if (summary.sleepMinutes && summary.sleepMinutes > 0) {
        await upsertSleep(userClient, user.id, date, summary);
        uploaded += 1;
        savedForDate = true;
      }
      if (savedForDate) syncedDates.push(date);
    }

    let rhythm = null;
    if (syncedDates.length > 0) {
      const scoringDate = syncedDates.includes(requestedDate) ? requestedDate : syncedDates.at(-1)!;
      rhythm = calculateRhythm(await loadDailyInputs(userClient, user.id, scoringDate));
      await saveRhythmScore(userClient, user.id, rhythm);
    }

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
  const summary: HealthSummary = {
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
    activityBins: normalizeActivityBins(input.activityBins ?? input.activity_bins),
    activityCoverageHours: numberValue(input.activityCoverageHours) ?? numberValue(input.activity_coverage_hours),
    timezoneOffsetMinutes: numberValue(input.timezoneOffsetMinutes) ?? numberValue(input.timezone_offset_minutes),
    sourceMetadata: normalizeRecord(input.sourceMetadata ?? input.source_metadata),
    source: stringValue(input.source),
  };
  assertRange(summary.steps, "步数", 0, 250_000);
  assertRange(summary.activeEnergyKcal, "活动能量", 0, 20_000);
  assertRange(summary.exerciseMinutes, "运动分钟", 0, 1_440);
  assertNumericRange(summary.latestHeartRate, "最新心率", 20, 250);
  assertNumericRange(summary.restingHeartRate, "静息心率", 20, 220);
  assertNumericRange(summary.heartRateVariabilitySDNN, "心率变异性", 0, 1_000);
  assertRange(summary.sleepMinutes, "睡眠分钟", 0, 1_440);
  assertRange(summary.sleepEfficiency, "睡眠效率", 0, 1);
  assertRange(summary.activityCoverageHours, "活动覆盖小时", 0, 24);
  assertRange(summary.timezoneOffsetMinutes, "时区偏移", -840, 840);
  if (summary.sleepStart && !validIso(summary.sleepStart)) throw new Error("睡眠开始时间不是有效时间。");
  if (summary.sleepEnd && !validIso(summary.sleepEnd)) throw new Error("睡眠结束时间不是有效时间。");
  if (summary.sleepStartLocal && !normalizeClock(summary.sleepStartLocal)) throw new Error("本地入睡时间不是有效时间。");
  if (summary.sleepEndLocal && !normalizeClock(summary.sleepEndLocal)) throw new Error("本地醒来时间不是有效时间。");
  const bloodOxygen = numericOrNull(summary.latestBloodOxygen);
  if (summary.latestBloodOxygen != null && bloodOxygen == null) throw new Error("血氧数据不是有效数值。");
  if (bloodOxygen != null && !((bloodOxygen >= 0.5 && bloodOxygen <= 1) || (bloodOxygen >= 50 && bloodOxygen <= 100))) {
    throw new Error("血氧数据超出可接受范围。");
  }
  Object.values(summary.sleepStageMinutes ?? {}).forEach((value) => assertRange(value, "睡眠阶段分钟", 0, 1_440));
  return summary;
}

function normalizeActivityBins(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new Error("活动时间分箱必须是数组。");
  if (value.length > 96) throw new Error("活动时间分箱数量超出单日上限。");
  return value.map((entry) => {
    const bin = normalizeRecord(entry);
    if (!bin) throw new Error("活动时间分箱包含无效条目。");
    const hour = numberValue(bin.hour);
    if (hour == null || !Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("活动时间分箱包含无效小时。");
    const steps = numberValue(bin.steps);
    const activeEnergyKcal = numberValue(bin.activeEnergyKcal) ?? numberValue(bin.active_energy_kcal);
    const exerciseMinutes = numberValue(bin.exerciseMinutes) ?? numberValue(bin.exercise_minutes);
    assertRange(steps, "分箱步数", 0, 100_000);
    assertRange(activeEnergyKcal, "分箱活动能量", 0, 10_000);
    assertRange(exerciseMinutes, "分箱运动分钟", 0, 60);
    const start = stringValue(bin.start);
    const end = stringValue(bin.end);
    const normalizedStart = start ? validIso(start) : null;
    const normalizedEnd = end ? validIso(end) : null;
    if (start && !normalizedStart) throw new Error("活动时间分箱包含无效开始时间。");
    if (end && !normalizedEnd) throw new Error("活动时间分箱包含无效结束时间。");
    return {
      hour,
      ...(normalizedStart ? { start: normalizedStart } : {}),
      ...(normalizedEnd ? { end: normalizedEnd } : {}),
      ...(steps != null ? { steps } : {}),
      ...(activeEnergyKcal != null ? { activeEnergyKcal } : {}),
      ...(exerciseMinutes != null ? { exerciseMinutes } : {}),
    };
  });
}

function assertRange(value: unknown, field: string, minimum: number, maximum: number) {
  if (value == null) return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${field}数据超出可接受范围。`);
}

function assertNumericRange(value: unknown, field: string, minimum: number, maximum: number) {
  if (value == null) return;
  const parsed = numericOrNull(value as number | string);
  if (parsed == null) throw new Error(`${field}数据不是有效数值。`);
  assertRange(parsed, field, minimum, maximum);
}

function hasExerciseMetrics(summary: HealthSummary) {
  return [summary.steps, summary.activeEnergyKcal, summary.exerciseMinutes, summary.latestHeartRate, summary.latestBloodOxygen]
    .some((value) => value != null);
}

function hasHealthMetrics(summary: HealthSummary) {
  return [
    summary.latestHeartRate,
    summary.restingHeartRate,
    summary.heartRateVariabilitySDNN,
    summary.latestBloodOxygen,
    summary.steps,
    summary.activeEnergyKcal,
    summary.exerciseMinutes,
    summary.sleepMinutes,
    summary.sleepStart,
    summary.sleepEnd,
    summary.sleepEfficiency,
    summary.activityCoverageHours,
  ].some((value) => value != null) ||
    (summary.activityBins?.length ?? 0) > 0 ||
    Object.keys(summary.sleepStageMinutes ?? {}).length > 0;
}

async function upsertHealthMetricSnapshot(client: SupabaseClient, userId: string, date: string, summary: HealthSummary) {
  const existing = await client
    .from("health_metric_snapshots")
    .select("latest_heart_rate,resting_heart_rate,heart_rate_variability_sdnn,blood_oxygen,activity_bins,sleep_stage_minutes,sleep_start_at,sleep_end_at,sleep_efficiency,timezone_offset_minutes,activity_coverage_hours,source_metadata")
    .eq("user_id", userId)
    .eq("record_date", date)
    .eq("source", summary.source ?? "apple_health")
    .maybeSingle();
  assertNoError(existing.error);
  const previous = (existing.data ?? {}) as Record<string, unknown>;
  const nextActivityBins = summary.activityBins?.length ? summary.activityBins : previous.activity_bins ?? [];
  const nextSleepStages = Object.keys(summary.sleepStageMinutes ?? {}).length > 0
    ? summary.sleepStageMinutes
    : previous.sleep_stage_minutes ?? {};
  const { error } = await client.from("health_metric_snapshots").upsert(
    {
      user_id: userId,
      record_date: date,
      latest_heart_rate: summary.latestHeartRate != null ? numericOrNull(summary.latestHeartRate) : previous.latest_heart_rate ?? null,
      resting_heart_rate: summary.restingHeartRate != null ? numericOrNull(summary.restingHeartRate) : previous.resting_heart_rate ?? null,
      heart_rate_variability_sdnn: summary.heartRateVariabilitySDNN != null ? numericOrNull(summary.heartRateVariabilitySDNN) : previous.heart_rate_variability_sdnn ?? null,
      blood_oxygen: summary.latestBloodOxygen != null ? numericOrNull(normalizeSpo2(summary.latestBloodOxygen)) : previous.blood_oxygen ?? null,
      activity_bins: nextActivityBins,
      sleep_stage_minutes: nextSleepStages,
      sleep_start_at: summary.sleepStart ? validIso(summary.sleepStart) : previous.sleep_start_at ?? null,
      sleep_end_at: summary.sleepEnd ? validIso(summary.sleepEnd) : previous.sleep_end_at ?? null,
      sleep_efficiency: summary.sleepEfficiency ?? previous.sleep_efficiency ?? null,
      timezone_offset_minutes: summary.timezoneOffsetMinutes == null ? previous.timezone_offset_minutes ?? null : Math.round(summary.timezoneOffsetMinutes),
      activity_coverage_hours: summary.activityCoverageHours ?? observedActivityHours(summary.activityBins) ?? previous.activity_coverage_hours ?? null,
      source_metadata: {
        ...normalizeRecord(previous.source_metadata),
        ...(summary.sourceMetadata ?? {}),
      },
      raw_payload: summary,
      source: summary.source ?? "apple_health",
    },
    { onConflict: "user_id,record_date,source" },
  );
  assertNoError(error);
}

async function upsertExercise(client: SupabaseClient, userId: string, date: string, summary: HealthSummary) {
  const existing = await client
    .from("exercise_records")
    .select("id,device_type")
    .eq("user_id", userId)
    .eq("record_date", date)
    .maybeSingle();
  assertNoError(existing.error);

  const patch: Record<string, unknown> = {};
  if (summary.steps != null) patch.steps = Math.max(0, Math.round(summary.steps));
  if (summary.activeEnergyKcal != null) patch.calories = Math.max(0, Math.round(summary.activeEnergyKcal));
  if (summary.exerciseMinutes != null) patch.exercise_minutes = Math.max(0, Math.round(summary.exerciseMinutes));
  if (summary.latestHeartRate != null) patch.heart_rate = normalizeHeartRate(summary.latestHeartRate);
  if (summary.latestBloodOxygen != null) patch.spo2 = normalizeSpo2(summary.latestBloodOxygen);
  if (Object.keys(patch).length > 0) patch.device_type = "apple_health";

  if (existing.data?.id) {
    const { error } = await client.from("exercise_records").update(patch).eq("id", existing.data.id);
    assertNoError(error);
    return Object.keys(patch).length > 0;
  }

  // The legacy daily exercise table requires a complete activity tuple. Partial
  // HealthKit authorization remains available in health_metric_snapshots and must
  // not be represented here with invented zero values.
  if (summary.steps == null || summary.activeEnergyKcal == null || summary.exerciseMinutes == null) return false;
  const { error } = await client.from("exercise_records").insert({
    user_id: userId,
    record_date: date,
    ...patch,
    device_type: "apple_health",
  });
  assertNoError(error);
  return true;
}

async function upsertSleep(client: SupabaseClient, userId: string, date: string, summary: HealthSummary) {
  const duration = Math.round(summary.sleepMinutes ?? 0);
  const stages = summary.sleepStageMinutes ?? {};
  const start = normalizeClock(summary.sleepStartLocal) ?? localClockFromIso(summary.sleepStart, summary.timezoneOffsetMinutes);
  const end = normalizeClock(summary.sleepEndLocal) ?? localClockFromIso(summary.sleepEnd, summary.timezoneOffsetMinutes);
  const rhythmScore = Math.round(Math.min(100, Math.max(0, 68 + Math.min(18, 18 - Math.abs(450 - duration) / 9))));
  const existing = await client
    .from("sleep_records")
    .select("sleep_start,sleep_end,deep_sleep_minutes,light_sleep_minutes,rem_minutes")
    .eq("user_id", userId)
    .eq("record_date", date)
    .maybeSingle();
  assertNoError(existing.error);
  const previous = (existing.data ?? {}) as Record<string, unknown>;
  const { error } = await client.from("sleep_records").upsert(
    {
      user_id: userId,
      record_date: date,
      sleep_start: start ?? previous.sleep_start ?? null,
      sleep_end: end ?? previous.sleep_end ?? null,
      sleep_duration_minutes: duration,
      deep_sleep_minutes: stageOrPrevious(stages.deep, previous.deep_sleep_minutes),
      light_sleep_minutes: stageOrPrevious(stages.core ?? stages.light, previous.light_sleep_minutes),
      rem_minutes: stageOrPrevious(stages.rem, previous.rem_minutes),
      device_type: summary.source ?? "apple_health",
      rhythm_score: rhythmScore,
    },
    { onConflict: "user_id,record_date" },
  );
  assertNoError(error);
}

function stageOrPrevious(value: unknown, previous: unknown) {
  const next = roundedStage(value);
  return next ?? (numberValue(previous) == null ? null : Math.max(0, Math.round(numberValue(previous)!)));
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
  const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    const parsed = numberValue(item);
    if (parsed == null || parsed < 0 || parsed > 1_440) throw new Error(`睡眠阶段 ${key} 不是有效的分钟数。`);
    return [key, parsed] as const;
  });
  return Object.fromEntries(entries);
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
