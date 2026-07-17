import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { asArray, assertNoError, clamp } from "./http.ts";

type SignalKey = "sleep" | "activity" | "mood" | "nutrition" | "focus" | "recovery";

type DailyRecord = {
  date: string;
  mood: Record<string, unknown> | null;
  sleep: Record<string, unknown> | null;
  exercise: Record<string, unknown> | null;
  nutrition: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  focusMinutes: number;
  focusSessions: number;
};

type RhythmInputs = {
  date: string;
  today: DailyRecord;
  history: DailyRecord[];
};

type Signal = {
  key: SignalKey;
  label: string;
  score: number;
  weight: number;
  reason: string;
  evidence?: Record<string, unknown>;
};

type MetricStats = {
  count: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
};

type Baseline = {
  historyDays: number;
  observedDays: number;
  sleepDuration: MetricStats;
  sleepStart: MetricStats;
  sleepMidpoint: MetricStats;
  steps: MetricStats;
  exerciseMinutes: MetricStats;
  activeCalories: MetricStats;
  mood: MetricStats;
  nutritionCalories: MetricStats;
  focusMinutes: MetricStats;
  latestHeartRate: MetricStats;
  restingHeartRate: MetricStats;
  hrvSdnn: MetricStats;
};

export const rhythmSchemaVersion = "2.0.0";
export const rhythmModelVersion = "nava-rhythm-v2-baseline-2026-07";

export async function loadDailyInputs(client: SupabaseClient, userId: string, date: string): Promise<RhythmInputs> {
  const start = shiftDate(date, -28);
  const [moodRes, sleepRes, exerciseRes, nutritionRes, focusRes, healthRes] = await Promise.all([
    client.from("mood_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
    client.from("sleep_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
    client
      .from("exercise_records")
      .select("*")
      .eq("user_id", userId)
      .gte("record_date", start)
      .lte("record_date", date)
      .order("record_date")
      .order("updated_at", { ascending: false }),
    client.from("nutrition_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
    client.from("focus_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date),
    client.from("health_metric_snapshots").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", date).order("record_date"),
  ]);

  assertNoError(moodRes.error);
  assertNoError(sleepRes.error);
  assertNoError(exerciseRes.error);
  assertNoError(nutritionRes.error);
  assertNoError(focusRes.error);
  assertNoError(healthRes.error);

  const moods = firstByDate(asArray<Record<string, unknown>>(moodRes.data));
  const sleeps = firstByDate(asArray<Record<string, unknown>>(sleepRes.data));
  const exercises = firstByDate(asArray<Record<string, unknown>>(exerciseRes.data));
  const nutritions = firstByDate(asArray<Record<string, unknown>>(nutritionRes.data));
  const health = firstByDate(asArray<Record<string, unknown>>(healthRes.data));
  const focusByDate = aggregateFocus(asArray<Record<string, unknown>>(focusRes.data));

  const history: DailyRecord[] = eachDate(start, date).map((day) => {
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
    };
  });

  return {
    date,
    today: history.find((item) => item.date === date) ?? emptyDay(date),
    history: history.filter((item) => item.date < date && hasAnySignal(item)),
  };
}

export function calculateRhythm(inputs: RhythmInputs) {
  const baseline = buildBaseline(inputs.history);
  const today = inputs.today;
  const signals = [
    scoreSleep(today, baseline),
    scoreActivity(today, baseline),
    scoreMood(today, baseline),
    scoreNutrition(today, baseline),
    scoreFocus(today, baseline),
    scoreRecovery(today, baseline),
  ].filter(Boolean) as Signal[];

  const totalWeight = signals.reduce((sum, item) => sum + item.weight, 0);
  const score = totalWeight > 0
    ? signals.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
    : 50;

  const phaseShiftMinutes = calculatePhaseShift(today, baseline);
  const regularityScore = calculateRegularityScore(today, baseline);
  const fragmentationRisk = calculateFragmentationRisk(today, baseline);
  const recoveryScore = signals.find((item) => item.key === "recovery")?.score ?? null;
  const anomalyFlags = detectAnomalies(today, baseline, phaseShiftMinutes);
  const profileLabels = buildProfileLabels({ today, baseline, phaseShiftMinutes, regularityScore, fragmentationRisk, recoveryScore });
  const confidence = calculateConfidence(signals, baseline);
  const actions = buildActions({ signals, today, baseline, anomalyFlags, phaseShiftMinutes, recoveryScore });
  const reasons = [...signals.map((item) => item.reason), ...anomalyFlags.map((flag) => flag.message)];

  return {
    schemaVersion: rhythmSchemaVersion,
    modelVersion: rhythmModelVersion,
    date: inputs.date,
    score: Math.round(score),
    confidence,
    signals,
    reasons,
    actions,
    phaseShiftMinutes,
    regularityScore,
    fragmentationScore: fragmentationRisk,
    recoveryScore,
    anomalyFlags,
    profileLabels,
    baseline,
    features: {
      fusion: "dynamic weighted multimodal score",
      components: ["sleep", "activity", "mood", "nutrition", "focus", "recovery"],
      circadian: {
        phaseShiftMinutes,
        regularityScore,
        fragmentationRisk,
        isProxy: regularityScore == null ? null : Number((regularityScore / 100).toFixed(2)),
        ivProxy: fragmentationRisk == null ? null : Number((fragmentationRisk / 100).toFixed(2)),
      },
      recovery: {
        recoveryScore,
        hrvSdnn: numeric(today.health?.heart_rate_variability_sdnn),
        restingHeartRate: numeric(today.health?.resting_heart_rate),
      },
      baselineWindowDays: 28,
      observedHistoryDays: baseline.observedDays,
    },
  };
}

export async function saveRhythmScore(client: SupabaseClient, userId: string, result: ReturnType<typeof calculateRhythm>) {
  const { error } = await client.from("daily_rhythm_scores").upsert(
    {
      user_id: userId,
      record_date: result.date,
      score: result.score,
      confidence: result.confidence,
      signals: result.signals,
      reasons: result.reasons,
      actions: result.actions,
      model_version: result.modelVersion,
      features: result.features,
      baseline: result.baseline,
      anomaly_flags: result.anomalyFlags,
      phase_shift_minutes: result.phaseShiftMinutes,
      regularity_score: result.regularityScore,
      fragmentation_score: result.fragmentationScore,
      recovery_score: result.recoveryScore,
      profile_labels: result.profileLabels,
    },
    { onConflict: "user_id,record_date" },
  );
  assertNoError(error);
}

function scoreSleep(day: DailyRecord, baseline: Baseline): Signal | null {
  if (!day.sleep) return null;
  const duration = numeric(day.sleep.sleep_duration_minutes);
  const start = parseClock(day.sleep.sleep_start);
  const deep = numeric(day.sleep.deep_sleep_minutes);
  const rem = numeric(day.sleep.rem_minutes);
  const rating = numeric(day.sleep.self_rating);
  const targetDuration = baseline.sleepDuration.median ?? 450;
  const targetStart = baseline.sleepStart.median ?? 23 * 60;
  const durationScore = duration > 0 ? clamp(100 - Math.abs(duration - targetDuration) / 2.8, 20, 100) : 45;
  const phaseScore = start != null ? clamp(100 - circularDiff(start, targetStart) / 2.4, 25, 100) : 55;
  const deepRatioScore = duration > 0 && deep > 0 ? clamp(70 + (deep / duration - 0.18) * 120, 25, 100) : 60;
  const remRatioScore = duration > 0 && rem > 0 ? clamp(72 + (rem / duration - 0.22) * 100, 25, 100) : 60;
  const ratingScore = rating ? clamp(rating * 20, 20, 100) : 60;
  const score = rounded(durationScore * 0.42 + phaseScore * 0.25 + deepRatioScore * 0.14 + remRatioScore * 0.12 + ratingScore * 0.07);
  const phaseShift = start != null ? signedCircularDiff(start, targetStart) : null;

  return {
    key: "sleep",
    label: "睡眠",
    score,
    weight: 0.28,
    reason: duration > 0
      ? `睡眠 ${Math.round(duration / 60)} 小时 ${Math.round(duration % 60)} 分钟，${phaseShift == null ? "入睡相位待补齐" : phaseShiftText(phaseShift)}。`
      : "已有睡眠记录但缺少睡眠时长。",
    evidence: { duration, targetDuration, start, targetStart, phaseShift },
  };
}

function scoreActivity(day: DailyRecord, baseline: Baseline): Signal | null {
  if (!day.exercise) return null;
  const steps = numeric(day.exercise.steps);
  const minutes = numeric(day.exercise.exercise_minutes);
  const calories = numeric(day.exercise.calories);
  const stepTarget = clamp((baseline.steps.median ?? 8000) * 0.9, 4500, 11000);
  const minuteTarget = clamp((baseline.exerciseMinutes.median ?? 40) * 0.9, 25, 75);
  const calorieTarget = clamp((baseline.activeCalories.median ?? 420) * 0.9, 220, 700);
  const score = rounded(
    clamp((steps / stepTarget) * 100, 0, 110) * 0.58 +
      clamp((minutes / minuteTarget) * 100, 0, 110) * 0.28 +
      clamp((calories / calorieTarget) * 100, 0, 110) * 0.14,
  );

  return {
    key: "activity",
    label: "活动",
    score,
    weight: 0.18,
    reason: `步数 ${Math.round(steps)}，运动 ${Math.round(minutes)} 分钟，目标按个人基线动态调整。`,
    evidence: { steps, minutes, calories, stepTarget, minuteTarget, calorieTarget },
  };
}

function scoreMood(day: DailyRecord, baseline: Baseline): Signal | null {
  if (!day.mood) return null;
  const mood = numeric(day.mood.mood_score);
  const baselineMood = baseline.mood.mean;
  const delta = baselineMood == null ? 0 : mood - baselineMood;
  const score = rounded(clamp(mood + clamp(delta, -20, 20) * 0.25, 0, 100));
  return {
    key: "mood",
    label: "情绪",
    score,
    weight: 0.14,
    reason: baselineMood == null ? "已记录主观情绪。" : `情绪比个人均值${delta >= 0 ? "高" : "低"} ${Math.abs(Math.round(delta))} 分。`,
    evidence: { mood, baselineMood, delta },
  };
}

function scoreNutrition(day: DailyRecord, baseline: Baseline): Signal | null {
  if (!day.nutrition) return null;
  const calories = numeric(day.nutrition.total_calories);
  const target = clamp(baseline.nutritionCalories.median ?? 1800, 1200, 2600);
  const score = calories > 0 ? rounded(clamp(100 - Math.abs(calories - target) / target * 95, 25, 100)) : 45;
  return {
    key: "nutrition",
    label: "饮食",
    score,
    weight: 0.12,
    reason: calories > 0 ? `当前摄入约 ${Math.round(calories)} kcal，个人参考值约 ${Math.round(target)} kcal。` : "已有饮食记录但缺少热量。",
    evidence: { calories, target },
  };
}

function scoreFocus(day: DailyRecord, baseline: Baseline): Signal | null {
  if (day.focusMinutes <= 0) return null;
  const target = clamp(baseline.focusMinutes.median ?? 90, 25, 150);
  const score = rounded(clamp(day.focusMinutes / target * 100, 0, 110));
  return {
    key: "focus",
    label: "专注",
    score,
    weight: 0.12,
    reason: `已完成 ${Math.round(day.focusMinutes)} 分钟专注，个人参考值约 ${Math.round(target)} 分钟。`,
    evidence: { focusMinutes: day.focusMinutes, target, sessions: day.focusSessions },
  };
}

function scoreRecovery(day: DailyRecord, baseline: Baseline): Signal | null {
  const hrv = numeric(day.health?.heart_rate_variability_sdnn);
  const restingHr = numeric(day.health?.resting_heart_rate);
  const latestHr = numeric(day.health?.latest_heart_rate);
  const sleepDuration = numeric(day.sleep?.sleep_duration_minutes);
  if (!hrv && !restingHr && !latestHr && !sleepDuration) return null;

  const sleepScore = sleepDuration > 0 ? clamp(100 - Math.abs(sleepDuration - (baseline.sleepDuration.median ?? 450)) / 3, 25, 100) : 55;
  const hrvScore = hrv > 0 && baseline.hrvSdnn.median
    ? clamp(65 + (hrv - baseline.hrvSdnn.median) / Math.max(8, baseline.hrvSdnn.median) * 45, 20, 100)
    : hrv > 0 ? clamp(hrv * 1.5, 25, 95) : 55;
  const hrBaseline = baseline.restingHeartRate.median ?? baseline.latestHeartRate.median;
  const hr = restingHr || latestHr;
  const hrScore = hr > 0 && hrBaseline ? clamp(72 - (hr - hrBaseline) * 3.2, 20, 100) : 55;
  const available = [sleepDuration > 0, hrv > 0, hr > 0].filter(Boolean).length;
  const score = rounded((sleepScore * 0.45 + hrvScore * 0.35 + hrScore * 0.2) * (available >= 2 ? 1 : 0.92));

  return {
    key: "recovery",
    label: "恢复",
    score,
    weight: 0.16,
    reason: hrv > 0 ? `HRV SDNN ${Math.round(hrv)} ms，结合睡眠和心率估计恢复状态。` : "根据睡眠和心率估计恢复状态。",
    evidence: { sleepDuration, hrv, restingHr, latestHr, hrBaseline },
  };
}

function buildBaseline(history: DailyRecord[]): Baseline {
  const observed = history.filter(hasAnySignal);
  return {
    historyDays: 28,
    observedDays: observed.length,
    sleepDuration: stats(observed.map((day) => numeric(day.sleep?.sleep_duration_minutes)).filter(positive)),
    sleepStart: circularStats(observed.map((day) => parseClock(day.sleep?.sleep_start)).filter(isNumber)),
    sleepMidpoint: circularStats(observed.map(sleepMidpoint).filter(isNumber)),
    steps: stats(observed.map((day) => numeric(day.exercise?.steps)).filter(positive)),
    exerciseMinutes: stats(observed.map((day) => numeric(day.exercise?.exercise_minutes)).filter(positive)),
    activeCalories: stats(observed.map((day) => numeric(day.exercise?.calories)).filter(positive)),
    mood: stats(observed.map((day) => optionalNumeric(day.mood?.mood_score)).filter(isNumber)),
    nutritionCalories: stats(observed.map((day) => numeric(day.nutrition?.total_calories)).filter(positive)),
    focusMinutes: stats(observed.map((day) => day.focusMinutes).filter(positive)),
    latestHeartRate: stats(observed.map((day) => numeric(day.health?.latest_heart_rate) || numeric(day.exercise?.heart_rate)).filter(positive)),
    restingHeartRate: stats(observed.map((day) => numeric(day.health?.resting_heart_rate)).filter(positive)),
    hrvSdnn: stats(observed.map((day) => numeric(day.health?.heart_rate_variability_sdnn)).filter(positive)),
  };
}

function calculatePhaseShift(day: DailyRecord, baseline: Baseline) {
  const midpoint = sleepMidpoint(day);
  const target = baseline.sleepMidpoint.median;
  if (midpoint == null || target == null) return null;
  return Math.round(signedCircularDiff(midpoint, target));
}

function calculateRegularityScore(day: DailyRecord, baseline: Baseline) {
  if (baseline.observedDays < 3) return null;
  const phaseShift = calculatePhaseShift(day, baseline);
  const sleepStartSd = baseline.sleepStart.sd ?? 90;
  const stepCv = coefficientOfVariation(baseline.steps);
  const phasePenalty = phaseShift == null ? 18 : Math.min(48, Math.abs(phaseShift) / 2.2);
  const variancePenalty = Math.min(30, sleepStartSd / 4) + Math.min(22, stepCv * 35);
  return rounded(100 - phasePenalty - variancePenalty);
}

function calculateFragmentationRisk(day: DailyRecord, baseline: Baseline) {
  const duration = numeric(day.sleep?.sleep_duration_minutes);
  const deep = numeric(day.sleep?.deep_sleep_minutes);
  const rem = numeric(day.sleep?.rem_minutes);
  const steps = numeric(day.exercise?.steps);
  const deepRisk = duration > 0 && deep > 0 ? clamp((0.16 - deep / duration) * 180, 0, 35) : 12;
  const remRisk = duration > 0 && rem > 0 ? clamp((0.18 - rem / duration) * 120, 0, 22) : 8;
  const activityRisk = baseline.steps.median && steps > 0 ? clamp((baseline.steps.median - steps) / baseline.steps.median * 35, 0, 35) : 10;
  const phaseShift = calculatePhaseShift(day, baseline);
  const phaseRisk = phaseShift == null ? 8 : clamp(Math.abs(phaseShift) / 6, 0, 25);
  return rounded(deepRisk + remRisk + activityRisk + phaseRisk);
}

function detectAnomalies(day: DailyRecord, baseline: Baseline, phaseShiftMinutes: number | null) {
  const flags: Array<{ code: string; severity: "info" | "warning" | "critical"; message: string; value?: number; baseline?: number | null }> = [];
  const duration = numeric(day.sleep?.sleep_duration_minutes);
  const steps = numeric(day.exercise?.steps);
  const mood = numeric(day.mood?.mood_score);
  const restingHr = numeric(day.health?.resting_heart_rate);
  const latestHr = numeric(day.health?.latest_heart_rate);
  const hrv = numeric(day.health?.heart_rate_variability_sdnn);
  const spo2 = normalizeSpo2(day.health?.blood_oxygen ?? day.exercise?.spo2);

  if (duration > 0 && isLow(duration, baseline.sleepDuration, 75, 360)) {
    flags.push({ code: "short_sleep", severity: duration < 300 ? "critical" : "warning", message: "睡眠时长明显低于个人基线。", value: duration, baseline: baseline.sleepDuration.mean });
  }
  if (phaseShiftMinutes != null && Math.abs(phaseShiftMinutes) >= 90) {
    flags.push({ code: "phase_shift", severity: "warning", message: phaseShiftMinutes > 0 ? "睡眠相位明显推迟。" : "睡眠相位明显提前。", value: phaseShiftMinutes, baseline: 0 });
  }
  if (steps > 0 && isLow(steps, baseline.steps, 1800, 3500)) {
    flags.push({ code: "low_activity", severity: "warning", message: "活动量低于个人基线。", value: steps, baseline: baseline.steps.mean });
  }
  if (mood > 0 && isLow(mood, baseline.mood, 12, 45)) {
    flags.push({ code: "low_mood", severity: "warning", message: "情绪分数明显偏低。", value: mood, baseline: baseline.mood.mean });
  }
  const hr = restingHr || latestHr;
  const hrBaseline = restingHr ? baseline.restingHeartRate : baseline.latestHeartRate;
  if (hr > 0 && isHigh(hr, hrBaseline, 8, 95)) {
    flags.push({ code: "high_heart_rate", severity: hr > 105 ? "critical" : "warning", message: "心率高于个人基线，请结合运动和身体状态判断。", value: hr, baseline: hrBaseline.mean });
  }
  if (hrv > 0 && isLow(hrv, baseline.hrvSdnn, 8, 25)) {
    flags.push({ code: "low_hrv", severity: "warning", message: "HRV 低于个人基线，恢复状态可能不足。", value: hrv, baseline: baseline.hrvSdnn.mean });
  }
  if (spo2 != null && spo2 < 94) {
    flags.push({ code: "low_spo2", severity: "critical", message: "血氧读数偏低，请优先确认设备读数和身体状态。", value: spo2, baseline: null });
  }
  return flags;
}

function buildProfileLabels(input: {
  today: DailyRecord;
  baseline: Baseline;
  phaseShiftMinutes: number | null;
  regularityScore: number | null;
  fragmentationRisk: number | null;
  recoveryScore: number | null;
}) {
  const labels: string[] = [];
  if ((input.phaseShiftMinutes ?? 0) > 60) labels.push("late_shift");
  if ((input.phaseShiftMinutes ?? 0) < -60) labels.push("early_shift");
  if ((input.regularityScore ?? 100) < 58) labels.push("irregular_rhythm");
  if ((input.fragmentationRisk ?? 0) > 55) labels.push("fragmented_day");
  if ((input.recoveryScore ?? 100) < 60) labels.push("recovery_debt");
  if (numeric(input.today.exercise?.steps) < 3500) labels.push("activity_gap");
  if (!input.today.nutrition) labels.push("nutrition_unlogged");
  return labels;
}

function calculateConfidence(signals: Signal[], baseline: Baseline) {
  const maxWeight = 1;
  const coverage = clamp(signals.reduce((sum, item) => sum + item.weight, 0) / maxWeight, 0, 1);
  const history = clamp(baseline.observedDays / 14, 0, 1);
  const dataDepth = signals.length >= 5 ? 1 : signals.length / 5;
  return Number(clamp(0.14 + coverage * 0.48 + history * 0.28 + dataDepth * 0.1, 0.14, 0.96).toFixed(2));
}

function buildActions(input: {
  signals: Signal[];
  today: DailyRecord;
  baseline: Baseline;
  anomalyFlags: Array<{ code: string; severity: string; message: string }>;
  phaseShiftMinutes: number | null;
  recoveryScore: number | null;
}) {
  const byKey = new Map(input.signals.map((item) => [item.key, item]));
  const actions: string[] = [];
  if (input.anomalyFlags.some((item) => item.code === "low_spo2")) actions.push("血氧偏低时先复测并关注身体感受，必要时寻求专业帮助。");
  if (input.phaseShiftMinutes != null && input.phaseShiftMinutes > 60) actions.push("今晚把入睡准备提前 30 分钟，先稳定睡眠相位。");
  if (input.phaseShiftMinutes != null && input.phaseShiftMinutes < -60) actions.push("今天傍晚安排轻活动，避免过早困倦影响夜间连续睡眠。");
  if ((input.recoveryScore ?? 100) < 60) actions.push("恢复分偏低，今天优先低强度运动和补水。");
  if (!byKey.has("sleep")) actions.push("补齐昨晚睡眠，节律分会更可靠。");
  if (!byKey.has("activity") || (byKey.get("activity")?.score ?? 0) < 55) actions.push("安排 10 到 15 分钟轻步行，补足活动信号。");
  if (!byKey.has("nutrition")) actions.push("拍照记录一餐饮食，用摄入数据校准能量状态。");
  if (!byKey.has("mood")) actions.push("用 10 秒记录情绪，帮助判断压力波动。");
  if (!byKey.has("focus") || (byKey.get("focus")?.score ?? 0) < 45) actions.push("完成一个 25 分钟专注块，稳定今日节奏。");
  return [...new Set(actions)].slice(0, 4);
}

function firstByDate(rows: Record<string, unknown>[]) {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const date = String(row.record_date ?? "");
    if (date && !map.has(date)) map.set(date, row);
  }
  return map;
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

function emptyDay(date: string): DailyRecord {
  return { date, mood: null, sleep: null, exercise: null, nutrition: null, health: null, focusMinutes: 0, focusSessions: 0 };
}

function hasAnySignal(day: DailyRecord) {
  return Boolean(day.mood || day.sleep || day.exercise || day.nutrition || day.health || day.focusMinutes > 0);
}

function stats(values: number[]): MetricStats {
  const clean = values.filter(isNumber).sort((a, b) => a - b);
  if (clean.length === 0) return { count: 0, mean: null, median: null, sd: null, min: null, max: null };
  const mean = clean.reduce((sum, item) => sum + item, 0) / clean.length;
  const variance = clean.reduce((sum, item) => sum + (item - mean) ** 2, 0) / Math.max(1, clean.length - 1);
  return {
    count: clean.length,
    mean: Number(mean.toFixed(2)),
    median: Number(median(clean).toFixed(2)),
    sd: Number(Math.sqrt(variance).toFixed(2)),
    min: clean[0],
    max: clean[clean.length - 1],
  };
}

function circularStats(values: number[]): MetricStats {
  if (values.length === 0) return stats([]);
  const sorted = [...values].sort((a, b) => a - b);
  const med = circularMedian(sorted);
  const diffs = values.map((value) => signedCircularDiff(value, med));
  const sd = Math.sqrt(diffs.reduce((sum, value) => sum + value ** 2, 0) / Math.max(1, diffs.length - 1));
  return {
    count: values.length,
    mean: Number(circularMean(values).toFixed(2)),
    median: Number(med.toFixed(2)),
    sd: Number(sd.toFixed(2)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function shiftDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function eachDate(start: string, end: string) {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return dates;
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace("%", "").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
    const loose = Number.parseFloat(normalized);
    return Number.isFinite(loose) ? loose : 0;
  }
  return 0;
}

function optionalNumeric(value: unknown) {
  if (value == null || value === "") return null;
  return numeric(value);
}

function parseClock(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function sleepMidpoint(day: DailyRecord) {
  const start = parseClock(day.sleep?.sleep_start);
  const duration = numeric(day.sleep?.sleep_duration_minutes);
  if (start == null || duration <= 0) return null;
  return wrapMinutes(start + duration / 2);
}

function normalizeSpo2(value: unknown) {
  if (value == null) return null;
  const raw = numeric(value);
  if (!raw) return null;
  return raw <= 1 ? raw * 100 : raw;
}

function median(values: number[]) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function circularMean(values: number[]) {
  const radians = values.map((minute) => minute / 1440 * Math.PI * 2);
  const x = radians.reduce((sum, value) => sum + Math.cos(value), 0) / radians.length;
  const y = radians.reduce((sum, value) => sum + Math.sin(value), 0) / radians.length;
  const angle = Math.atan2(y, x);
  return wrapMinutes(angle / (Math.PI * 2) * 1440);
}

function circularMedian(values: number[]) {
  const candidates = values.map((value) => ({
    value,
    distance: values.reduce((sum, item) => sum + Math.abs(signedCircularDiff(item, value)), 0),
  }));
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.value ?? values[0];
}

function circularDiff(a: number, b: number) {
  return Math.abs(signedCircularDiff(a, b));
}

function signedCircularDiff(a: number, b: number) {
  let diff = wrapMinutes(a) - wrapMinutes(b);
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff;
}

function wrapMinutes(value: number) {
  return ((value % 1440) + 1440) % 1440;
}

function rounded(value: number) {
  return Math.round(clamp(value, 0, 100));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: number) {
  return value > 0;
}

function coefficientOfVariation(metric: MetricStats) {
  if (!metric.mean || !metric.sd) return 0.25;
  return Math.abs(metric.sd / metric.mean);
}

function isLow(value: number, metric: MetricStats, absoluteDelta: number, absoluteFloor: number) {
  if (value < absoluteFloor) return true;
  if (metric.mean == null) return false;
  const threshold = metric.sd ? metric.mean - Math.max(absoluteDelta, metric.sd * 1.35) : metric.mean - absoluteDelta;
  return value < threshold;
}

function isHigh(value: number, metric: MetricStats, absoluteDelta: number, absoluteCeiling: number) {
  if (value > absoluteCeiling) return true;
  if (metric.mean == null) return false;
  const threshold = metric.sd ? metric.mean + Math.max(absoluteDelta, metric.sd * 1.35) : metric.mean + absoluteDelta;
  return value > threshold;
}

function phaseShiftText(minutes: number) {
  if (Math.abs(minutes) < 20) return "入睡相位接近个人基线";
  return minutes > 0 ? `比个人基线推迟约 ${Math.round(minutes)} 分钟` : `比个人基线提前约 ${Math.abs(Math.round(minutes))} 分钟`;
}
