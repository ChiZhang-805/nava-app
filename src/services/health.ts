import { Capacitor, registerPlugin } from "@capacitor/core";
import { refreshRhythmScore, saveExerciseRecord, saveSleepSummaryRecord } from "./records";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import { todayISO } from "./date";

export interface HealthTodayNativeSummary {
  date?: string;
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
  latestHeartRate?: number;
  restingHeartRate?: number;
  heartRateVariabilitySDNN?: number;
  latestBloodOxygen?: number;
  sleepMinutes?: number;
  sleepStart?: string;
  sleepEnd?: string;
  sleepStartLocal?: string;
  sleepEndLocal?: string;
  sleepEfficiency?: number;
  sleepStageMinutes?: Record<string, number>;
  activityCoverageHours?: number;
  timezoneOffsetMinutes?: number;
  sourceMetadata?: Record<string, unknown>;
  activityBins?: Array<{
    hour: number;
    start: string;
    end: string;
    steps?: number;
    activeEnergyKcal?: number;
    exerciseMinutes?: number;
  }>;
}

export interface HealthAuthorizationStatus {
  available: boolean;
  requested: boolean;
  status: "requested" | "needs_request" | "unknown" | "unavailable";
}

interface NavaHealthPlugin {
  requestAuthorization: () => Promise<{ granted: boolean }>;
  getAuthorizationStatus: () => Promise<HealthAuthorizationStatus>;
  getTodaySummary: () => Promise<HealthTodayNativeSummary>;
  getRecentSummaries: (options: { days: number }) => Promise<{ summaries: HealthTodayNativeSummary[] }>;
}

const NavaHealth = registerPlugin<NavaHealthPlugin>("NavaHealth");
const HEALTH_LAST_SYNC_KEY = "nava.health.last-sync.v1";

function healthLastSyncKey(userId?: string) {
  return userId ? `${HEALTH_LAST_SYNC_KEY}.${userId}` : HEALTH_LAST_SYNC_KEY;
}

export function isNativeHealthAvailable() {
  if (isDemoMode()) return true;
  return Capacitor.isNativePlatform();
}

export async function requestHealthAuthorization() {
  if (isDemoMode()) return { granted: true };

  if (!isNativeHealthAvailable()) {
    return { granted: false, reason: "当前是在浏览器预览，HealthKit 只能在 iPhone 真机或模拟器中使用。" };
  }
  return NavaHealth.requestAuthorization();
}

export async function getHealthAuthorizationStatus(): Promise<HealthAuthorizationStatus> {
  if (isDemoMode()) return { available: true, requested: true, status: "requested" };
  if (!isNativeHealthAvailable()) return { available: false, requested: false, status: "unavailable" };
  try {
    return await NavaHealth.getAuthorizationStatus();
  } catch {
    return { available: true, requested: false, status: "unknown" };
  }
}

export function readLastHealthSyncAt(userId?: string) {
  try {
    const stored = localStorage.getItem(healthLastSyncKey(userId));
    return stored ?? (isDemoMode() ? new Date().toISOString() : null);
  } catch {
    return null;
  }
}

export async function getLastHealthSyncAt(userId: string) {
  const localTimestamp = readLastHealthSyncAt(userId);
  if (isDemoMode()) return localTimestamp;

  try {
    const { data, error } = await supabase
      .from("health_sync_jobs")
      .select("finished_at,created_at")
      .eq("user_id", userId)
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const serverTimestamp = data?.finished_at ?? data?.created_at ?? null;
    if (!localTimestamp) return serverTimestamp;
    if (!serverTimestamp) return localTimestamp;
    return Date.parse(serverTimestamp) > Date.parse(localTimestamp) ? serverTimestamp : localTimestamp;
  } catch {
    return localTimestamp;
  }
}

function rememberHealthSync<T extends { lastSyncDate: string }>(userId: string, result: T) {
  try {
    localStorage.setItem(healthLastSyncKey(userId), result.lastSyncDate);
  } catch {
    // Sync remains successful even when local preview storage is unavailable.
  }
  return result;
}

export async function getNativeTodaySummary() {
  if (isDemoMode()) {
    return {
      steps: 8420,
      activeEnergyKcal: 486,
      exerciseMinutes: 42,
      latestHeartRate: 88,
      restingHeartRate: 62,
      heartRateVariabilitySDNN: 48,
      latestBloodOxygen: 0.98,
      sleepMinutes: 465,
      sleepStart: new Date(new Date().setHours(-1, 20, 0, 0)).toISOString(),
      sleepEnd: new Date(new Date().setHours(7, 5, 0, 0)).toISOString(),
      sleepStartLocal: "23:20",
      sleepEndLocal: "07:05",
      sleepEfficiency: 0.94,
      sleepStageMinutes: { deep: 85, rem: 95, core: 280, awake: 12 },
      activityBins: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        start: new Date(new Date().setHours(hour, 0, 0, 0)).toISOString(),
        end: new Date(new Date().setHours(hour + 1, 0, 0, 0)).toISOString(),
        steps: hour >= 8 && hour <= 21 ? Math.round(180 + Math.sin(hour / 24 * Math.PI) * 520) : 12,
        activeEnergyKcal: hour >= 8 && hour <= 21 ? 18 : 1,
        exerciseMinutes: hour === 18 ? 22 : 0,
      })),
      activityCoverageHours: 24,
      timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
    };
  }

  if (!isNativeHealthAvailable()) return null;
  return NavaHealth.getTodaySummary();
}

export async function syncNativeHealthNow(userId: string) {
  if (isDemoMode()) return rememberHealthSync(userId, { uploaded: 2, lastSyncDate: new Date().toISOString(), skipped: false });

  if (!isNativeHealthAvailable()) {
    return { uploaded: 0, lastSyncDate: new Date().toISOString(), skipped: true };
  }
  let summaries: HealthTodayNativeSummary[];
  try {
    const recent = await NavaHealth.getRecentSummaries({ days: 14 });
    summaries = recent.summaries.length > 0 ? recent.summaries : [await NavaHealth.getTodaySummary()];
  } catch {
    summaries = [await NavaHealth.getTodaySummary()];
  }
  const summary = summaries[summaries.length - 1] ?? {};
  const response = await supabase.functions.invoke<{
    uploaded: number;
    lastSyncDate: string;
    syncedDates?: string[];
    rhythm?: unknown;
  }>("health-sync-ingest", { body: { summaries, source: "apple_health" } });

  if (!response.error && response.data) return rememberHealthSync(userId, { ...response.data, summary });

  let uploaded = 0;
  for (const item of summaries) {
    await saveHealthSnapshotFallback(userId, item);
    await saveExerciseRecord({
      userId,
      date: item.date,
      steps: Math.round(item.steps ?? 0),
      calories: Math.round(item.activeEnergyKcal ?? 0),
      minutes: Math.round(item.exerciseMinutes ?? 0),
      heartRate: item.latestHeartRate ? String(Math.round(item.latestHeartRate)) : undefined,
      spo2: item.latestBloodOxygen ? `${Math.round(item.latestBloodOxygen * 100)}%` : undefined,
      source: "apple_health",
    });
    uploaded += 1;
    if (item.sleepMinutes && item.sleepMinutes > 0) {
      await saveSleepSummaryRecord({
        userId,
        date: item.date,
        durationMinutes: Math.round(item.sleepMinutes),
        source: "apple_watch",
      });
      uploaded += 1;
    }
  }
  const refreshDate = summary.date ?? summaries.find((item) => item.date)?.date ?? todayISO();
  try {
    await refreshRhythmScore(refreshDate);
  } catch (error) {
    console.warn("Failed to refresh rhythm score after fallback health sync", error);
  }
  return rememberHealthSync(userId, { uploaded, syncedDates: summaries.map((item) => item.date).filter(Boolean), lastSyncDate: new Date().toISOString(), summary });
}

async function saveHealthSnapshotFallback(userId: string, item: HealthTodayNativeSummary) {
  const date = item.date ?? todayISO();
  const hasSnapshot =
    item.latestHeartRate != null ||
    item.restingHeartRate != null ||
    item.heartRateVariabilitySDNN != null ||
    item.latestBloodOxygen != null ||
    item.sleepStageMinutes != null ||
    (item.activityBins?.length ?? 0) > 0;
  if (!hasSnapshot) return;

  const { error } = await supabase.from("health_metric_snapshots").upsert(
    {
      user_id: userId,
      record_date: date,
      latest_heart_rate: item.latestHeartRate ?? null,
      resting_heart_rate: item.restingHeartRate ?? null,
      heart_rate_variability_sdnn: item.heartRateVariabilitySDNN ?? null,
      blood_oxygen: normalizeBloodOxygen(item.latestBloodOxygen),
      activity_bins: item.activityBins ?? [],
      sleep_stage_minutes: item.sleepStageMinutes ?? {},
      sleep_start_at: item.sleepStart ?? null,
      sleep_end_at: item.sleepEnd ?? null,
      sleep_efficiency: item.sleepEfficiency ?? null,
      timezone_offset_minutes: item.timezoneOffsetMinutes == null ? null : Math.round(item.timezoneOffsetMinutes),
      activity_coverage_hours: item.activityCoverageHours ?? item.activityBins?.length ?? null,
      source_metadata: item.sourceMetadata ?? {},
      raw_payload: item,
      source: "apple_health",
    },
    { onConflict: "user_id,record_date,source" },
  );

  if (error) console.warn("Failed to save fallback health snapshot", error);
}

function normalizeBloodOxygen(value?: number) {
  if (value == null || !Number.isFinite(value)) return null;
  return value <= 1 ? Math.round(value * 1000) / 10 : value;
}
