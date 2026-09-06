export type ExerciseRecoveryStatus = "recovered" | "improving" | "not_recovered";

export type ExerciseRecoveryInput = {
  minutes: number;
  heartRate?: string | null;
  sorenessLevel: number;
  fatigueLevel: number;
  hasInjury: boolean;
  sleepMinutes?: number | null;
};

export type ExerciseRecoveryEstimate = {
  minHours: number;
  maxHours: number;
  confidence: number;
  basis: string[];
  caution: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numericHeartRate(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A deliberately conservative, auditable estimate. It is not a medical or
 * physiological model: every modifier comes from fields the user can inspect
 * and edit, and the UI labels the result as an estimate.
 */
export function estimateExerciseRecovery(input: ExerciseRecoveryInput): ExerciseRecoveryEstimate {
  const minutes = clamp(Math.round(Number(input.minutes) || 0), 0, 720);
  const soreness = clamp(Math.round(Number(input.sorenessLevel) || 0), 0, 10);
  const fatigue = clamp(Math.round(Number(input.fatigueLevel) || 0), 0, 10);
  const heartRate = numericHeartRate(input.heartRate);
  const sleepMinutes = input.sleepMinutes == null ? null : clamp(Math.round(input.sleepMinutes), 0, 1_440);

  let center = minutes < 20 ? 4 : minutes < 45 ? 10 : minutes < 75 ? 18 : minutes < 120 ? 28 : 40;
  const basis: string[] = [`${minutes} 分钟运动`];

  if (heartRate != null) {
    if (heartRate >= 170) center += 18;
    else if (heartRate >= 150) center += 10;
    else if (heartRate >= 130) center += 5;
    basis.push(`心率 ${Math.round(heartRate)} bpm`);
  }
  if (soreness > 0) {
    center += soreness * 2.2;
    basis.push(`酸痛 ${soreness}/10`);
  }
  if (fatigue > 0) {
    center += fatigue * 1.8;
    basis.push(`疲劳 ${fatigue}/10`);
  }
  if (sleepMinutes != null && sleepMinutes < 360) {
    center += 8;
    basis.push(`睡眠 ${sleepMinutes} 分钟`);
  }
  if (input.hasInjury) {
    center = Math.max(center + 24, 48);
    basis.push("已标记伤病或不适");
  }

  const completeness = [minutes > 0, heartRate != null, soreness >= 0, fatigue >= 0, sleepMinutes != null]
    .filter(Boolean).length;
  const confidence = clamp(0.34 + completeness * 0.08 - (input.hasInjury ? 0.08 : 0), 0.34, 0.74);
  const uncertainty = 0.28 + (1 - confidence) * 0.45;
  const minHours = Math.max(2, Math.round(center * (1 - uncertainty)));
  const maxHours = Math.min(168, Math.max(minHours + 2, Math.round(center * (1 + uncertainty))));

  return {
    minHours,
    maxHours,
    confidence: Number(confidence.toFixed(2)),
    basis,
    caution: input.hasInjury || soreness >= 7 || fatigue >= 8,
  };
}

