import { Capacitor, registerPlugin } from "@capacitor/core";
import { saveExerciseRecord, saveSleepSummaryRecord } from "./records";

export interface HealthTodayNativeSummary {
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
  latestHeartRate?: number;
  latestBloodOxygen?: number;
  sleepMinutes?: number;
}

interface NavaHealthPlugin {
  requestAuthorization: () => Promise<{ granted: boolean }>;
  getTodaySummary: () => Promise<HealthTodayNativeSummary>;
}

const NavaHealth = registerPlugin<NavaHealthPlugin>("NavaHealth");

export function isNativeHealthAvailable() {
  return Capacitor.isNativePlatform();
}

export async function requestHealthAuthorization() {
  if (!isNativeHealthAvailable()) {
    return { granted: false, reason: "当前是在浏览器预览，HealthKit 只能在 iPhone 真机或模拟器中使用。" };
  }
  return NavaHealth.requestAuthorization();
}

export async function getNativeTodaySummary() {
  if (!isNativeHealthAvailable()) return null;
  return NavaHealth.getTodaySummary();
}

export async function syncNativeHealthNow(userId: string) {
  if (!isNativeHealthAvailable()) {
    return { uploaded: 0, lastSyncDate: new Date().toISOString(), skipped: true };
  }
  const summary = await NavaHealth.getTodaySummary();
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
