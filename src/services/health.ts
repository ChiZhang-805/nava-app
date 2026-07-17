import { Capacitor, registerPlugin } from "@capacitor/core";
import { saveExerciseRecord, saveSleepSummaryRecord } from "./records";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export interface HealthTodayNativeSummary {
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
  latestHeartRate?: number;
  restingHeartRate?: number;
  heartRateVariabilitySDNN?: number;
  latestBloodOxygen?: number;
  sleepMinutes?: number;
}

interface NavaHealthPlugin {
  requestAuthorization: () => Promise<{ granted: boolean }>;
  getTodaySummary: () => Promise<HealthTodayNativeSummary>;
}

const NavaHealth = registerPlugin<NavaHealthPlugin>("NavaHealth");

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
    };
  }

  if (!isNativeHealthAvailable()) return null;
  return NavaHealth.getTodaySummary();
}

export async function syncNativeHealthNow(userId: string) {
  if (isDemoMode()) return { uploaded: 2, lastSyncDate: new Date().toISOString(), skipped: false };

  if (!isNativeHealthAvailable()) {
    return { uploaded: 0, lastSyncDate: new Date().toISOString(), skipped: true };
  }
  const summary = await NavaHealth.getTodaySummary();
  const response = await supabase.functions.invoke<{
    uploaded: number;
    lastSyncDate: string;
    rhythm?: unknown;
  }>("health-sync-ingest", { body: { summary, source: "apple_health" } });

  if (!response.error && response.data) return { ...response.data, summary };

  await saveExerciseRecord({
    userId,
    steps: Math.round(summary.steps ?? 0),
    calories: Math.round(summary.activeEnergyKcal ?? 0),
    minutes: Math.round(summary.exerciseMinutes ?? 0),
    heartRate: summary.latestHeartRate ? String(Math.round(summary.latestHeartRate)) : undefined,
    spo2: summary.latestBloodOxygen ? `${Math.round(summary.latestBloodOxygen * 100)}%` : undefined,
    source: "apple_health",
  });
  let uploaded = 1;
  if (summary.sleepMinutes && summary.sleepMinutes > 0) {
    await saveSleepSummaryRecord({
      userId,
      durationMinutes: Math.round(summary.sleepMinutes),
      source: "apple_watch",
    });
    uploaded += 1;
  }
  return { uploaded, lastSyncDate: new Date().toISOString(), summary };
}
