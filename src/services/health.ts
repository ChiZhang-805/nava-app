import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import { onboardingAnswers, resolveConsentFlag } from "./consent.ts";

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
  startBackgroundDelivery: () => Promise<{ enabled: boolean; errors: string[] }>;
  readPendingBackgroundUpdate: () => Promise<NativeHealthPendingUpdate>;
  acknowledgePendingBackgroundUpdate: (options: { through: string }) => Promise<void>;
  addListener: (
    eventName: "healthDataChanged",
    listener: (event: NativeHealthChange) => void,
  ) => Promise<PluginListenerHandle>;
}

export interface NativeHealthChange {
  occurredAt: string;
  types: string[];
}

export interface NativeHealthPendingUpdate extends NativeHealthChange {
  pending: boolean;
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

export async function isHealthSyncEnabled(userId: string) {
  if (isDemoMode()) return true;
  const { data, error } = await supabase
    .from("profiles")
    .select("health_data_consent,onboarding_answers")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const answers = onboardingAnswers(data?.onboarding_answers);
  return resolveConsentFlag(data?.health_data_consent, answers?.healthDataConsent);
}

export async function requestHealthAuthorization() {
  if (isDemoMode()) return { granted: true };

  if (!isNativeHealthAvailable()) {
    return { granted: false, reason: "当前是在浏览器预览，HealthKit 只能在 iPhone 真机或模拟器中使用。" };
  }
  return NavaHealth.requestAuthorization();
}

export async function startNativeHealthBackgroundDelivery() {
  if (!isNativeHealthAvailable() || isDemoMode()) return { enabled: false, errors: [] as string[] };
  return NavaHealth.startBackgroundDelivery();
}

export async function readPendingNativeHealthUpdate(): Promise<NativeHealthPendingUpdate> {
  if (!isNativeHealthAvailable() || isDemoMode()) return { pending: false, occurredAt: "", types: [] };
  return NavaHealth.readPendingBackgroundUpdate();
}

export async function subscribeNativeHealthChanges(listener: (event: NativeHealthChange) => void) {
  if (!isNativeHealthAvailable() || isDemoMode()) return null;
  return NavaHealth.addListener("healthDataChanged", listener);
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
      .gt("sample_count", 0)
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

export function subscribeHealthSyncCompletion(userId: string, onCompleted: (finishedAt: string | null) => void) {
  const topicSuffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  const channel = supabase
    .channel(`health-sync:${userId}:${topicSuffix}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "health_sync_jobs",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const next = payload.new as { status?: string; sample_count?: number | null; finished_at?: string | null };
        if (next.status === "success" && Number(next.sample_count ?? 0) > 0) onCompleted(next.finished_at ?? null);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function rememberHealthSync<T extends { lastSyncDate: string }>(userId: string, result: T) {
  try {
    localStorage.setItem(healthLastSyncKey(userId), result.lastSyncDate);
  } catch {
    // Sync remains successful even when local preview storage is unavailable.
  }
  return result;
}

export async function getNativeTodaySummary(userId: string) {
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

  if (!isNativeHealthAvailable() || !await isHealthSyncEnabled(userId)) return null;
  return NavaHealth.getTodaySummary();
}

export async function syncNativeHealthNow(userId: string) {
  if (isDemoMode()) return rememberHealthSync(userId, { uploaded: 2, lastSyncDate: new Date().toISOString(), skipped: false });

  if (!isNativeHealthAvailable()) {
    return { uploaded: 0, lastSyncDate: new Date().toISOString(), skipped: true };
  }
  if (!await isHealthSyncEnabled(userId)) {
    return { uploaded: 0, lastSyncDate: new Date().toISOString(), skipped: true, reason: "health_sync_consent_disabled" };
  }
  const syncStartedAt = new Date().toISOString();
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

  if (response.error) throw response.error;
  if (!response.data) throw new Error("健康同步服务没有返回结果。");
  try {
    await NavaHealth.acknowledgePendingBackgroundUpdate({ through: syncStartedAt });
  } catch (error) {
    console.warn("Health sync succeeded but the background marker could not be acknowledged", error);
  }
  const result = { ...response.data, summary };
  return result.uploaded > 0 ? rememberHealthSync(userId, result) : result;
}
