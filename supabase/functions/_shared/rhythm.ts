import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { asArray, assertNoError, clamp } from "./http.ts";

type SignalKey = "sleep" | "activity" | "circadian" | "mood" | "nutrition" | "focus" | "recovery";

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
  reliability: number;
  reason: string;
  evidence?: Record<string, unknown>;
};

type ActivityBin = {
  hour: number;
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
};

type ActivityRhythmFeatures = {
  available: boolean;
  todayRa: number | null;
  todayIv: number | null;
  historyIs: number | null;
  historyRa: number | null;
  m10: number | null;
  l5: number | null;
  m10StartHour: number | null;
  l5StartHour: number | null;
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

export const rhythmSchemaVersion = "3.0.0";
export const rhythmModelVersion = "nava-fusion-v3-2026-07";

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
  const activityRhythm = calculateActivityRhythm(today, inputs.history);
  const phaseShiftMinutes = calculatePhaseShift(today, baseline);
  const regularityScore = calculateRegularityScore(today, baseline, activityRhythm);
  const fragmentationRisk = calculateFragmentationRisk(today, baseline, activityRhythm);
  const signals = [
    scoreSleep(today, baseline),
    scoreActivity(today, baseline),
    scoreCircadian(today, baseline, activityRhythm, regularityScore, fragmentationRisk),
    scoreMood(today, baseline),
    scoreNutrition(today, baseline),
    scoreFocus(today, baseline),
    scoreRecovery(today, baseline),
  ].filter(Boolean) as Signal[];

  const recoveryScore = signals.find((item) => item.key === "recovery")?.score ?? null;
  const anomalyFlags = detectAnomalies(today, baseline, phaseShiftMinutes, activityRhythm);
  const fusion = fuseRhythmState(signals, anomalyFlags, regularityScore, fragmentationRisk);
  const profileLabels = buildProfileLabels({ today, baseline, phaseShiftMinutes, regularityScore, fragmentationRisk, recoveryScore, activityRhythm });
  const confidence = calculateConfidence(signals, baseline);
  const actions = buildActions({ signals, today, baseline, anomalyFlags, phaseShiftMinutes, recoveryScore });
  const reasons = [...signals.map((item) => item.reason), ...anomalyFlags.map((flag) => flag.message)];

  return {
    schemaVersion: rhythmSchemaVersion,
    modelVersion: rhythmModelVersion,
    date: inputs.date,
    score: fusion.score,
    confidence,
    signals,
    reasons,
    actions,
    fusion,
    phaseShiftMinutes,
    regularityScore,
    fragmentationScore: fragmentationRisk,
    recoveryScore,
    anomalyFlags,
    profileLabels,
    baseline,
    features: {
      fusion: "bayesian log-odds evidence + dempster-shafer belief mass + geometric bottleneck + anomaly risk gates",
      components: ["sleep", "activity", "circadian", "mood", "nutrition", "focus", "recovery"],
      circadian: {
        phaseShiftMinutes,
        regularityScore,
        fragmentationRisk,
        activityRhythm,
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
      fusionDiagnostics: fusion,
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
      fusion: result.fusion,
      phase_shift_minutes: result.phaseShiftMinutes,
      regularity_score: result.regularityScore,
      fragmentation_score: result.fragmentationScore,
      recovery_score: result.recoveryScore,
      circadian_score: result.signals.find((signal) => signal.key === "circadian")?.score ?? null,
      data_quality_score: Math.round(result.confidence * 100),
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
    reliability: clamp((duration > 0 ? 0.45 : 0.15) + (start != null ? 0.2 : 0) + (deep > 0 ? 0.15 : 0) + (rem > 0 ? 0.12 : 0) + (baseline.sleepDuration.count >= 7 ? 0.08 : 0), 0.2, 0.95),
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
    reliability: clamp((steps > 0 ? 0.42 : 0.12) + (minutes > 0 ? 0.22 : 0) + (calories > 0 ? 0.18 : 0) + (baseline.steps.count >= 7 ? 0.12 : 0), 0.18, 0.94),
    reason: `步数 ${Math.round(steps)}，运动 ${Math.round(minutes)} 分钟，目标按个人基线动态调整。`,
    evidence: { steps, minutes, calories, stepTarget, minuteTarget, calorieTarget },
  };
}

function scoreCircadian(
  day: DailyRecord,
  baseline: Baseline,
  activityRhythm: ActivityRhythmFeatures,
  regularityScore: number | null,
  fragmentationRisk: number | null,
): Signal | null {
  const midpoint = sleepMidpoint(day);
  const hasSleepPhase = midpoint != null && baseline.sleepMidpoint.median != null;
  if (!activityRhythm.available && !hasSleepPhase && regularityScore == null) return null;

  const raScore = activityRhythm.todayRa == null ? 62 : clamp(activityRhythm.todayRa * 100, 15, 100);
  const ivScore = activityRhythm.todayIv == null ? 64 : clamp(100 - activityRhythm.todayIv * 34, 10, 100);
  const isScore = activityRhythm.historyIs == null ? (regularityScore ?? 62) : clamp(activityRhythm.historyIs * 100, 10, 100);
  const fragmentScore = fragmentationRisk == null ? 65 : clamp(100 - fragmentationRisk, 0, 100);
  const score = rounded(geometricBlend([raScore, ivScore, isScore, fragmentScore]));

  return {
    key: "circadian",
    label: "节律",
    score,
    weight: 0.16,
    reliability: activityRhythm.available ? clamp(0.55 + (baseline.observedDays / 28) * 0.35, 0.55, 0.92) : 0.42,
    reason: activityRhythm.available
      ? `已用小时活动曲线计算 RA ${formatOptional(activityRhythm.todayRa)}、IV ${formatOptional(activityRhythm.todayIv)}、IS ${formatOptional(activityRhythm.historyIs)}。`
      : "当前缺少小时活动曲线，节律信号使用睡眠相位和活动稳定性代理计算。",
    evidence: activityRhythm as unknown as Record<string, unknown>,
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
    reliability: clamp(0.52 + (baseline.mood.count >= 7 ? 0.2 : 0) + (day.mood.diary_content ? 0.08 : 0), 0.52, 0.84),
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
    reliability: clamp((calories > 0 ? 0.58 : 0.32) + (baseline.nutritionCalories.count >= 5 ? 0.16 : 0), 0.32, 0.82),
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
    reliability: clamp(0.58 + (baseline.focusMinutes.count >= 5 ? 0.16 : 0), 0.58, 0.82),
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
    reliability: clamp(0.22 + (sleepDuration > 0 ? 0.25 : 0) + (hrv > 0 ? 0.26 : 0) + (hr > 0 ? 0.18 : 0) + (baseline.hrvSdnn.count >= 5 ? 0.08 : 0), 0.22, 0.96),
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

function calculateRegularityScore(day: DailyRecord, baseline: Baseline, activityRhythm: ActivityRhythmFeatures) {
  if (activityRhythm.available) {
    const isScore = activityRhythm.historyIs == null ? 62 : clamp(activityRhythm.historyIs * 100, 0, 100);
    const raScore = activityRhythm.todayRa == null ? 62 : clamp(activityRhythm.todayRa * 100, 0, 100);
    const ivScore = activityRhythm.todayIv == null ? 62 : clamp(100 - activityRhythm.todayIv * 34, 0, 100);
    return rounded(geometricBlend([isScore, raScore, ivScore]));
  }
  if (baseline.observedDays < 3) return null;
  const phaseShift = calculatePhaseShift(day, baseline);
  const sleepStartSd = baseline.sleepStart.sd ?? 90;
  const stepCv = coefficientOfVariation(baseline.steps);
  const phasePenalty = phaseShift == null ? 18 : Math.min(48, Math.abs(phaseShift) / 2.2);
  const variancePenalty = Math.min(30, sleepStartSd / 4) + Math.min(22, stepCv * 35);
  return rounded(100 - phasePenalty - variancePenalty);
}

function calculateFragmentationRisk(day: DailyRecord, baseline: Baseline, activityRhythm: ActivityRhythmFeatures) {
  const duration = numeric(day.sleep?.sleep_duration_minutes);
  const deep = numeric(day.sleep?.deep_sleep_minutes);
  const rem = numeric(day.sleep?.rem_minutes);
  const steps = numeric(day.exercise?.steps);
  const deepRisk = duration > 0 && deep > 0 ? clamp((0.16 - deep / duration) * 180, 0, 35) : 12;
  const remRisk = duration > 0 && rem > 0 ? clamp((0.18 - rem / duration) * 120, 0, 22) : 8;
  const activityRisk = baseline.steps.median && steps > 0 ? clamp((baseline.steps.median - steps) / baseline.steps.median * 35, 0, 35) : 10;
  const phaseShift = calculatePhaseShift(day, baseline);
  const phaseRisk = phaseShift == null ? 8 : clamp(Math.abs(phaseShift) / 6, 0, 25);
  const activityFragmentation = activityRhythm.todayIv == null ? 0 : clamp(activityRhythm.todayIv * 28, 0, 32);
  const weakAmplitudeRisk = activityRhythm.todayRa == null ? 0 : clamp((0.72 - activityRhythm.todayRa) * 42, 0, 30);
  return rounded(deepRisk + remRisk + activityRisk + phaseRisk + activityFragmentation + weakAmplitudeRisk);
}

function calculateActivityRhythm(today: DailyRecord, history: DailyRecord[]): ActivityRhythmFeatures {
  const todayVector = activityVector(today);
  const historyVectors = history.map(activityVector).filter((vector) => vector.length === 24 && vector.some((value) => value > 0));
  const available = todayVector.length === 24 && todayVector.some((value) => value > 0);
  if (!available) {
    return {
      available: false,
      todayRa: null,
      todayIv: null,
      historyIs: null,
      historyRa: null,
      m10: null,
      l5: null,
      m10StartHour: null,
      l5StartHour: null,
    };
  }

  const m10 = movingWindowExtreme(todayVector, 10, "max");
  const l5 = movingWindowExtreme(todayVector, 5, "min");
  const todayRa = m10.value + l5.value > 0 ? (m10.value - l5.value) / (m10.value + l5.value) : null;
  const todayIv = intradailyVariability(todayVector);
  const historyIs = historyVectors.length >= 3 ? interdailyStability([...historyVectors, todayVector]) : null;
  const historyRa = historyVectors.length >= 3
    ? median(historyVectors.map((vector) => {
      const hM10 = movingWindowExtreme(vector, 10, "max").value;
      const hL5 = movingWindowExtreme(vector, 5, "min").value;
      return hM10 + hL5 > 0 ? (hM10 - hL5) / (hM10 + hL5) : 0;
    }))
    : null;

  return {
    available: true,
    todayRa: todayRa == null ? null : Number(todayRa.toFixed(3)),
    todayIv: todayIv == null ? null : Number(todayIv.toFixed(3)),
    historyIs: historyIs == null ? null : Number(historyIs.toFixed(3)),
    historyRa: historyRa == null ? null : Number(historyRa.toFixed(3)),
    m10: Number(m10.value.toFixed(2)),
    l5: Number(l5.value.toFixed(2)),
    m10StartHour: m10.start,
    l5StartHour: l5.start,
  };
}

function fuseRhythmState(
  signals: Signal[],
  anomalyFlags: Array<{ severity: "info" | "warning" | "critical" }>,
  regularityScore: number | null,
  fragmentationRisk: number | null,
) {
  if (signals.length === 0) {
    return {
      method: "nava-fusion-v3",
      score: 50,
      posterior: 0.5,
      belief: 0.5,
      disbelief: 0,
      uncertainty: 1,
      geometric: 0.5,
      bottleneck: 0.5,
      riskGate: 1,
      evidenceMass: 0,
      conflict: 0,
      dsConflict: 0,
      evidence: [],
    };
  }

  const evidence = signals.map((signal) => {
    const p = clamp(signal.score / 100, 0.03, 0.97);
    const prior = signal.weight;
    const reliability = clamp(signal.reliability, 0.1, 0.98);
    const support = clamp(reliability * (0.65 + Math.sqrt(prior) * 0.35), 0.08, 0.98);
    return {
      key: signal.key,
      p,
      reliability,
      influence: Math.sqrt(prior) * reliability,
      mass: {
        stable: Number((p * support).toFixed(3)),
        strain: Number(((1 - p) * support).toFixed(3)),
        uncertainty: Number((1 - support).toFixed(3)),
      },
      logOdds: logit(p) * Math.sqrt(prior) * reliability,
    };
  });

  const evidenceMass = evidence.reduce((sum, item) => sum + item.influence, 0);
  const posterior = sigmoid(evidence.reduce((sum, item) => sum + item.logOdds, logit(0.56)) / Math.max(0.72, Math.sqrt(evidenceMass)));
  const beliefMass = evidence.reduce(
    (current, item) => combineEvidenceMasses(current, item.mass),
    { stable: 0, strain: 0, uncertainty: 1, conflict: 0 },
  );
  const belief = clamp(beliefMass.stable + beliefMass.uncertainty * 0.5, 0.03, 0.97);
  const bottleneck = Math.min(...evidence.map((item) => item.p));
  const geometric = Math.exp(evidence.reduce((sum, item) => sum + Math.log(item.p) * item.influence, 0) / Math.max(0.1, evidenceMass));
  const dispersion = standardDeviation(evidence.map((item) => item.p));
  const conflict = clamp(dispersion * 1.2 + beliefMass.conflict * 0.42, 0, 0.5);
  const warningCount = anomalyFlags.filter((flag) => flag.severity === "warning").length;
  const criticalCount = anomalyFlags.filter((flag) => flag.severity === "critical").length;
  const anomalyGate = Math.pow(0.91, warningCount) * Math.pow(0.74, criticalCount);
  const regularityGate = regularityScore == null ? 1 : clamp(0.72 + regularityScore / 360, 0.72, 1);
  const fragmentationGate = fragmentationRisk == null ? 1 : clamp(1 - fragmentationRisk / 260, 0.62, 1);
  const riskGate = Number((anomalyGate * regularityGate * fragmentationGate).toFixed(3));
  const probabilistic = Math.sqrt(posterior * belief);
  const fused = Math.min(probabilistic, geometric * 1.08) * 0.72 + bottleneck * 0.28;
  const score = rounded(fused * riskGate * (1 - conflict * 0.35) * 100);

  return {
    method: "nava-fusion-v3",
    score,
    posterior: Number(posterior.toFixed(3)),
    belief: Number(belief.toFixed(3)),
    disbelief: Number(beliefMass.strain.toFixed(3)),
    uncertainty: Number(beliefMass.uncertainty.toFixed(3)),
    geometric: Number(geometric.toFixed(3)),
    bottleneck: Number(bottleneck.toFixed(3)),
    riskGate,
    evidenceMass: Number(evidenceMass.toFixed(3)),
    conflict: Number(conflict.toFixed(3)),
    dsConflict: Number(beliefMass.conflict.toFixed(3)),
    evidence,
  };
}

function combineEvidenceMasses(
  left: { stable: number; strain: number; uncertainty: number; conflict: number },
  right: { stable: number; strain: number; uncertainty: number },
) {
  const rawConflict = left.stable * right.strain + left.strain * right.stable;
  const normalization = Math.max(0.001, 1 - rawConflict);
  return {
    stable: (left.stable * right.stable + left.stable * right.uncertainty + left.uncertainty * right.stable) / normalization,
    strain: (left.strain * right.strain + left.strain * right.uncertainty + left.uncertainty * right.strain) / normalization,
    uncertainty: (left.uncertainty * right.uncertainty) / normalization,
    conflict: clamp(left.conflict + rawConflict * (1 - left.conflict), 0, 1),
  };
}

function detectAnomalies(day: DailyRecord, baseline: Baseline, phaseShiftMinutes: number | null, activityRhythm: ActivityRhythmFeatures) {
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
  if (activityRhythm.todayRa != null && activityRhythm.todayRa < 0.45) {
    flags.push({ code: "weak_rest_activity_amplitude", severity: "warning", message: "日夜活动幅度偏弱，可能存在节律边界不清。", value: activityRhythm.todayRa, baseline: activityRhythm.historyRa });
  }
  if (activityRhythm.todayIv != null && activityRhythm.todayIv > 1.25) {
    flags.push({ code: "high_intradaily_variability", severity: "warning", message: "日内活动碎片化偏高，建议减少零散熬夜和不规律活动。", value: activityRhythm.todayIv, baseline: null });
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
  activityRhythm: ActivityRhythmFeatures;
}) {
  const labels: string[] = [];
  if ((input.phaseShiftMinutes ?? 0) > 60) labels.push("late_shift");
  if ((input.phaseShiftMinutes ?? 0) < -60) labels.push("early_shift");
  if ((input.regularityScore ?? 100) < 58) labels.push("irregular_rhythm");
  if ((input.fragmentationRisk ?? 0) > 55) labels.push("fragmented_day");
  if ((input.activityRhythm.todayRa ?? 1) < 0.45) labels.push("weak_day_night_boundary");
  if ((input.activityRhythm.todayIv ?? 0) > 1.25) labels.push("fragmented_activity");
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

function activityVector(day: DailyRecord) {
  const bins = extractActivityBins(day);
  if (!bins.length) return [];
  const vector = Array.from({ length: 24 }, () => 0);
  for (const bin of bins) {
    const hour = Math.max(0, Math.min(23, Math.round(bin.hour)));
    vector[hour] += (bin.steps ?? 0) + (bin.activeEnergyKcal ?? 0) * 14 + (bin.exerciseMinutes ?? 0) * 85;
  }
  return vector;
}

function extractActivityBins(day: DailyRecord): ActivityBin[] {
  const payload = day.health?.raw_payload as Record<string, unknown> | undefined;
  const bins = day.health?.activity_bins ?? payload?.activityBins ?? payload?.activity_bins;
  if (!Array.isArray(bins)) return [];
  return bins.map((item) => {
    const value = item as Record<string, unknown>;
    return {
      hour: inferHour(value),
      steps: numeric(value.steps),
      activeEnergyKcal: numeric(value.activeEnergyKcal ?? value.active_energy_kcal),
      exerciseMinutes: numeric(value.exerciseMinutes ?? value.exercise_minutes),
    };
  }).filter((item) => Number.isFinite(item.hour));
}

function inferHour(value: Record<string, unknown>) {
  if (typeof value.hour === "number") return value.hour;
  if (typeof value.start === "string") {
    const parsed = new Date(value.start);
    if (!Number.isNaN(parsed.getTime())) return parsed.getHours();
  }
  if (typeof value.startHour === "number") return value.startHour;
  return 0;
}

function movingWindowExtreme(values: number[], size: number, mode: "min" | "max") {
  let best = mode === "max" ? -Infinity : Infinity;
  let start = 0;
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    for (let offset = 0; offset < size; offset += 1) {
      sum += values[(i + offset) % values.length];
    }
    const mean = sum / size;
    if ((mode === "max" && mean > best) || (mode === "min" && mean < best)) {
      best = mean;
      start = i;
    }
  }
  return { value: best, start };
}

function intradailyVariability(values: number[]) {
  if (values.length < 2) return null;
  const meanValue = values.reduce((sum, item) => sum + item, 0) / values.length;
  const denominator = values.reduce((sum, item) => sum + (item - meanValue) ** 2, 0);
  if (denominator === 0) return null;
  const numerator = values.slice(1).reduce((sum, item, index) => sum + (item - values[index]) ** 2, 0);
  return (values.length * numerator) / ((values.length - 1) * denominator);
}

function interdailyStability(vectors: number[][]) {
  const flat = vectors.flat();
  if (flat.length === 0) return null;
  const meanValue = flat.reduce((sum, item) => sum + item, 0) / flat.length;
  const denominator = flat.reduce((sum, item) => sum + (item - meanValue) ** 2, 0);
  if (denominator === 0) return null;
  const hourlyMeans = Array.from({ length: 24 }, (_, hour) => {
    const values = vectors.map((vector) => vector[hour] ?? 0);
    return values.reduce((sum, item) => sum + item, 0) / values.length;
  });
  const numerator = vectors.length * hourlyMeans.reduce((sum, item) => sum + (item - meanValue) ** 2, 0);
  return clamp(numerator / denominator, 0, 1);
}

function geometricBlend(values: number[]) {
  const clean = values.filter(isNumber).map((value) => clamp(value, 1, 100) / 100);
  if (clean.length === 0) return 50;
  return Math.exp(clean.reduce((sum, value) => sum + Math.log(value), 0) / clean.length) * 100;
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function logit(value: number) {
  const p = clamp(value, 0.001, 0.999);
  return Math.log(p / (1 - p));
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const meanValue = values.reduce((sum, item) => sum + item, 0) / values.length;
  const variance = values.reduce((sum, item) => sum + (item - meanValue) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function formatOptional(value: number | null) {
  return value == null ? "NA" : value.toFixed(2);
}

function phaseShiftText(minutes: number) {
  if (Math.abs(minutes) < 20) return "入睡相位接近个人基线";
  return minutes > 0 ? `比个人基线推迟约 ${Math.round(minutes)} 分钟` : `比个人基线提前约 ${Math.abs(Math.round(minutes))} 分钟`;
}
