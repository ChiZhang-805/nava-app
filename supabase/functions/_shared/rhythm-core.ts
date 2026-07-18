export type SignalKey = "sleep" | "activity" | "circadian" | "mood" | "nutrition" | "focus" | "recovery";

export type DailyRecord = {
  date: string;
  mood: Record<string, unknown> | null;
  sleep: Record<string, unknown> | null;
  exercise: Record<string, unknown> | null;
  nutrition: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  focusMinutes: number;
  focusSessions: number;
};

export type RhythmInputs = {
  date: string;
  today: DailyRecord;
  history: DailyRecord[];
};

export type RhythmSignal = {
  key: SignalKey;
  label: string;
  score: number;
  weight: number;
  reliability: number;
  reason: string;
  evidence: Record<string, unknown>;
};

export type RhythmConfig = {
  baselineWindowDays: number;
  minimumHistoryDays: number;
  studentDegreesOfFreedom: number;
  processNoise: [number, number, number, number];
  persistence: [number, number, number, number];
  changePointHazard: number;
  changePointMaxRunLength: number;
  scoreTemperature: number;
};

type FactorKey = "circadian" | "recovery" | "behavior" | "affect";
type Vector4 = [number, number, number, number];
type Matrix4 = [Vector4, Vector4, Vector4, Vector4];

type RobustMetric = {
  count: number;
  effectiveCount: number;
  mean: number | null;
  median: number | null;
  mad: number | null;
  scale: number | null;
  min: number | null;
  max: number | null;
};

type PersonalBaseline = {
  historyDays: number;
  observedDays: number;
  sleepDuration: RobustMetric;
  sleepStart: RobustMetric;
  sleepMidpoint: RobustMetric;
  steps: RobustMetric;
  exerciseMinutes: RobustMetric;
  activeCalories: RobustMetric;
  mood: RobustMetric;
  nutritionCalories: RobustMetric;
  focusMinutes: RobustMetric;
  latestHeartRate: RobustMetric;
  restingHeartRate: RobustMetric;
  hrvSdnn: RobustMetric;
};

type ActivityVector = {
  values: number[];
  observed: boolean[];
  observedHours: number;
  complete: boolean;
};

type ActivityRhythmFeatures = {
  available: boolean;
  partialDay: boolean;
  observedHours: number;
  todayRa: number | null;
  todayIv: number | null;
  historyIs: number | null;
  historyRa: number | null;
  m10: number | null;
  l5: number | null;
  m10StartHour: number | null;
  l5StartHour: number | null;
  cosinorR2: number | null;
  cosinorAmplitude: number | null;
  acrophaseHour: number | null;
  acrophaseDeviationMinutes: number | null;
  sleepRegularityIndex: number | null;
};

type DayAnalysis = {
  date: string;
  signals: RhythmSignal[];
  baseline: PersonalBaseline;
  activityRhythm: ActivityRhythmFeatures;
  phaseShiftMinutes: number | null;
  regularityScore: number | null;
  fragmentationRisk: number | null;
  validationFlags: AnomalyFlag[];
};

type FilterDay = {
  date: string;
  mean: Vector4;
  covariance: Matrix4;
  score: number;
  lower: number;
  upper: number;
  latent: number;
  slowLatent: number;
  factorRiskLatent: number;
  acuteLatent: number | null;
  acuteBlend: number;
  lowConsensus: number;
  highConsensus: number;
  trendPressure: number;
  observation: number | null;
  evidenceCount: number;
  robustWeights: Array<{ key: SignalKey; weight: number; innovation: number; standardizedInnovation: number }>;
};

type UtilityFusion = {
  latent: number;
  slowLatent: number;
  factorRiskLatent: number;
  acuteLatent: number | null;
  acuteBlend: number;
  lowConsensus: number;
  highConsensus: number;
  trendPressure: number;
  dispersion: number;
};

type AnomalyFlag = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  value?: number;
  baseline?: number | null;
  confidence?: number;
};

const factorKeys: FactorKey[] = ["circadian", "recovery", "behavior", "affect"];
const globalLoading: Vector4 = [0.3, 0.3, 0.22, 0.18];

const signalModels: Record<SignalKey, { loading: Vector4; variance: number; weight: number; label: string }> = {
  sleep: { loading: [0.58, 0.32, 0.02, 0.08], variance: 0.48, weight: 0.2, label: "睡眠" },
  activity: { loading: [0.08, 0.18, 0.7, 0.04], variance: 0.62, weight: 0.14, label: "活动" },
  circadian: { loading: [0.82, 0.08, 0.08, 0.02], variance: 0.42, weight: 0.2, label: "节律" },
  mood: { loading: [0.03, 0.12, 0.05, 0.8], variance: 0.72, weight: 0.14, label: "情绪" },
  nutrition: { loading: [0.05, 0.12, 0.72, 0.11], variance: 1.05, weight: 0.08, label: "饮食" },
  focus: { loading: [0.12, 0.03, 0.58, 0.27], variance: 0.92, weight: 0.08, label: "专注" },
  recovery: { loading: [0.06, 0.82, 0.08, 0.04], variance: 0.4, weight: 0.16, label: "恢复" },
};

export const rhythmSchemaVersion = "4.0.0";
export const rhythmModelVersion = "nava-chronostate-v4-2026-07";

export const defaultRhythmConfig: RhythmConfig = {
  baselineWindowDays: 42,
  minimumHistoryDays: 7,
  studentDegreesOfFreedom: 4,
  processNoise: [0.18, 0.28, 0.3, 0.35],
  persistence: [0.92, 0.76, 0.72, 0.68],
  changePointHazard: 1 / 28,
  changePointMaxRunLength: 42,
  scoreTemperature: 1.2,
};

export function calculateRhythm(inputs: RhythmInputs, config: RhythmConfig = defaultRhythmConfig) {
  const timeline = buildTimeline(inputs, config.baselineWindowDays);
  const analyses: DayAnalysis[] = [];

  for (let index = 0; index < timeline.length; index += 1) {
    const day = timeline[index];
    const prior = timeline.slice(Math.max(0, index - config.baselineWindowDays), index);
    analyses.push(analyzeDay(day, prior, config));
  }

  const filtered = robustStateFilter(analyses, config);
  const observations = filtered.map((item) => item.observation);
  const changePoints = bayesianOnlineChangePoints(observations, config.changePointHazard, config.changePointMaxRunLength);
  const current = analyses.at(-1) ?? analyzeDay(inputs.today, [], config);
  const state = filtered.at(-1) ?? initialFilterDay(inputs.date, config);
  const currentChangePoint = changePoints.at(-1) ?? 0;
  const recentChangePoint = Math.max(...changePoints.slice(-7), 0);
  const trendSlope = robustTrendSlope(filtered.slice(-7).map((item) => item.score));
  const anomalyFlags = detectAnomalies(current, state, currentChangePoint, recentChangePoint, trendSlope);
  const confidence = calculateConfidence(current, state, anomalyFlags, config);
  const recoveryScore = current.signals.find((signal) => signal.key === "recovery")?.score ?? null;
  const profileLabels = buildProfileLabels(current, state, currentChangePoint, trendSlope, recoveryScore);
  const actions = buildActions(current, anomalyFlags, trendSlope, recoveryScore);
  const reasons = [...current.signals.map((signal) => signal.reason), ...anomalyFlags.map((flag) => flag.message)];
  const factorState = Object.fromEntries(factorKeys.map((key, index) => [key, round(state.mean[index], 3)]));
  const factorScores = Object.fromEntries(factorKeys.map((key, index) => [key, Math.round(latentToScore(state.mean[index], config.scoreTemperature))]));
  const dataQuality = calculateDataQuality(current, state, config);

  return {
    schemaVersion: rhythmSchemaVersion,
    modelVersion: rhythmModelVersion,
    date: inputs.date,
    score: Math.round(state.score),
    confidence,
    scoreInterval: {
      level: 0.8,
      lower: Math.round(state.lower),
      upper: Math.round(state.upper),
      width: Math.round(state.upper - state.lower),
    },
    signals: current.signals,
    reasons,
    actions,
    phaseShiftMinutes: current.phaseShiftMinutes,
    regularityScore: current.regularityScore,
    fragmentationScore: current.fragmentationRisk,
    recoveryScore,
    anomalyFlags,
    profileLabels,
    baseline: current.baseline,
    fusion: {
      method: "nava-chronostate-v4-robust-dynamic-state-space",
      stateFactors: factorState,
      factorScores,
      posteriorCovariance: state.covariance.map((row) => row.map((value) => round(value, 4))),
      scoreInterval: { lower: Math.round(state.lower), upper: Math.round(state.upper), level: 0.8 },
      trendSlope: round(trendSlope, 3),
      changePointProbability: round(currentChangePoint, 4),
      recentChangePointProbability: round(recentChangePoint, 4),
      utilityFusion: {
        latent: round(state.latent, 4),
        slowLatent: round(state.slowLatent, 4),
        factorRiskLatent: round(state.factorRiskLatent, 4),
        acuteLatent: roundNullable(state.acuteLatent, 4),
        acuteBlend: round(state.acuteBlend, 4),
        lowConsensus: round(state.lowConsensus, 4),
        highConsensus: round(state.highConsensus, 4),
        trendPressure: round(state.trendPressure, 4),
      },
      evidenceCount: state.evidenceCount,
      robustObservationWeights: state.robustWeights,
      studentDegreesOfFreedom: config.studentDegreesOfFreedom,
      dataQuality,
    },
    features: {
      fusion: "four-factor robust Student-t state-space filter + Bayesian online change-point detection",
      components: Object.keys(signalModels),
      circadian: current.activityRhythm,
      recovery: {
        recoveryScore,
        hrvSdnn: validHrv(currentDayHealth(current)?.hrv),
        restingHeartRate: validRestingHeartRate(currentDayHealth(current)?.restingHeartRate),
      },
      baselineWindowDays: config.baselineWindowDays,
      observedHistoryDays: current.baseline.observedDays,
      dataQuality,
      complexity: {
        time: "O(D*S*F^2 + D*R + D*S*WlogW)",
        space: "O(D*F^2 + R + S*W)",
        bounds: { factors: 4, signals: 7, baselineWindow: config.baselineWindowDays, maxRunLength: config.changePointMaxRunLength },
      },
    },
  };
}

function analyzeDay(day: DailyRecord, prior: DailyRecord[], config: RhythmConfig): DayAnalysis {
  const baseline = buildBaseline(prior, config.baselineWindowDays);
  const activityRhythm = calculateActivityRhythm(day, prior);
  const phaseShiftMinutes = calculatePhaseShift(day, baseline);
  const regularityScore = calculateRegularityScore(day, prior, baseline, activityRhythm);
  const fragmentationRisk = calculateFragmentationRisk(day, baseline, activityRhythm);
  const signals = [
    scoreSleep(day, baseline, prior),
    scoreActivity(day, baseline),
    scoreCircadian(day, baseline, activityRhythm, regularityScore, fragmentationRisk),
    scoreMood(day, baseline),
    scoreNutrition(day, baseline),
    scoreFocus(day, baseline),
    scoreRecovery(day, baseline),
  ].filter((item): item is RhythmSignal => item != null);

  return {
    date: day.date,
    signals,
    baseline,
    activityRhythm,
    phaseShiftMinutes,
    regularityScore,
    fragmentationRisk,
    validationFlags: validateDay(day),
  };
}

function scoreSleep(day: DailyRecord, baseline: PersonalBaseline, prior: DailyRecord[]): RhythmSignal | null {
  if (!day.sleep) return null;
  const duration = validSleepDuration(day.sleep.sleep_duration_minutes);
  const start = parseClock(day.sleep.sleep_start);
  const midpoint = sleepMidpoint(day);
  const stage = sleepStages(day);
  const rating = bounded(day.sleep.self_rating, 1, 5);
  if (duration == null && start == null && rating == null) return null;

  const personalTarget = baseline.sleepDuration.median ?? 450;
  const shrink = baseline.sleepDuration.count / (baseline.sleepDuration.count + 5);
  const target = 450 * (1 - shrink) + personalTarget * shrink;
  const durationDifference = duration == null ? null : duration - target;
  const durationScale = durationDifference != null && durationDifference < 0 ? 95 : 135;
  const durationScore = durationDifference == null ? 55 : 100 * Math.exp(-0.5 * (durationDifference / durationScale) ** 2);
  const phaseDifference = midpoint != null && baseline.sleepMidpoint.median != null
    ? signedCircularDiff(midpoint, baseline.sleepMidpoint.median)
    : null;
  const phaseScale = Math.max(55, baseline.sleepMidpoint.scale ?? 75);
  const phaseScore = phaseDifference == null ? 62 : 100 * Math.exp(-0.5 * (phaseDifference / phaseScale) ** 2);
  const stageScore = scoreSleepStages(stage, duration);
  const regularity = sleepRegularityIndex([...prior.slice(-14), day]);
  const regularityComponent = regularity == null ? 62 : regularity;
  const ratingScore = rating == null ? 62 : rating * 20;
  const available = [duration != null, phaseDifference != null, stage.total > 0, regularity != null, rating != null].filter(Boolean).length;
  const score = geometricMean([
    { value: durationScore, weight: 0.38 },
    { value: phaseScore, weight: 0.22 },
    { value: stageScore, weight: stage.total > 0 ? 0.18 : 0.06 },
    { value: regularityComponent, weight: regularity != null ? 0.15 : 0.07 },
    { value: ratingScore, weight: rating != null ? 0.07 : 0.03 },
  ]);
  const reliability = clamp(
    0.18 + (duration != null ? 0.28 : 0) + (phaseDifference != null ? 0.15 : 0) +
      (stage.total > 0 ? 0.18 : 0) + (regularity != null ? 0.12 : 0) + (rating != null ? 0.05 : 0),
    0.18,
    0.96,
  );

  return signal("sleep", score, reliability, duration == null
    ? "睡眠记录缺少有效时长，当前只使用相位或自评。"
    : `睡眠 ${Math.floor(duration / 60)} 小时 ${Math.round(duration % 60)} 分钟，个人动态目标约 ${Math.round(target)} 分钟。`, {
    duration,
    target: round(target, 1),
    durationDifference: roundNullable(durationDifference, 1),
    start,
    midpoint,
    phaseDifference: roundNullable(phaseDifference, 1),
    stage,
    sleepRegularityIndex: regularity,
    availableFeatures: available,
  });
}

function scoreActivity(day: DailyRecord, baseline: PersonalBaseline): RhythmSignal | null {
  if (!day.exercise) return null;
  const steps = bounded(day.exercise.steps, 0, 100000);
  const minutes = bounded(day.exercise.exercise_minutes, 0, 1440);
  const calories = bounded(day.exercise.calories, 0, 10000);
  if (steps == null && minutes == null && calories == null) return null;

  const progress = activityDayProgress(day);
  const stepTarget = clamp((baseline.steps.median ?? 8000) * 0.72 + 8000 * 0.28, 4500, 14000) * progress;
  const minuteTarget = clamp((baseline.exerciseMinutes.median ?? 35) * 0.65 + 35 * 0.35, 20, 90) * progress;
  const calorieTarget = clamp((baseline.activeCalories.median ?? 400) * 0.7 + 400 * 0.3, 180, 900) * progress;
  const components = [
    steps == null ? null : saturatingAchievement(steps, stepTarget),
    minutes == null ? null : saturatingAchievement(minutes, minuteTarget),
    calories == null ? null : saturatingAchievement(calories, calorieTarget),
  ];
  const score = weightedAvailableMean(components, [0.55, 0.28, 0.17], 50);
  const present = components.filter((value) => value != null).length;
  const reliability = clamp(0.18 + present * 0.18 + (baseline.steps.count >= 7 ? 0.1 : 0) + progress * 0.12, 0.2, 0.9);

  return signal("activity", score, reliability,
    `活动按当日 ${Math.round(progress * 100)}% 进度校准：${Math.round(steps ?? 0)} 步、${Math.round(minutes ?? 0)} 分钟。`, {
      steps,
      minutes,
      calories,
      progress: round(progress, 3),
      targets: { steps: round(stepTarget, 1), minutes: round(minuteTarget, 1), calories: round(calorieTarget, 1) },
    });
}

function scoreCircadian(
  day: DailyRecord,
  baseline: PersonalBaseline,
  features: ActivityRhythmFeatures,
  regularityScore: number | null,
  fragmentationRisk: number | null,
): RhythmSignal | null {
  const midpoint = sleepMidpoint(day);
  const hasSleepPhase = midpoint != null && baseline.sleepMidpoint.median != null;
  if (!features.available && !hasSleepPhase && regularityScore == null) return null;

  const components: Array<{ value: number; weight: number }> = [];
  if (features.todayRa != null) components.push({ value: clamp((features.todayRa - 0.18) / 0.62 * 100, 10, 100), weight: 0.2 });
  if (features.todayIv != null) components.push({ value: clamp(112 - features.todayIv * 48, 8, 100), weight: 0.16 });
  if (features.historyIs != null) components.push({ value: clamp(features.historyIs * 110, 8, 100), weight: 0.16 });
  if (features.cosinorR2 != null) components.push({ value: clamp(25 + features.cosinorR2 * 90, 15, 100), weight: 0.14 });
  if (features.acrophaseDeviationMinutes != null) {
    components.push({ value: 100 * Math.exp(-0.5 * (features.acrophaseDeviationMinutes / 120) ** 2), weight: 0.12 });
  }
  if (features.sleepRegularityIndex != null) components.push({ value: features.sleepRegularityIndex, weight: 0.12 });
  if (regularityScore != null) components.push({ value: regularityScore, weight: 0.06 });
  if (fragmentationRisk != null) components.push({ value: 100 - fragmentationRisk, weight: 0.04 });
  if (components.length === 0) components.push({ value: 55, weight: 1 });
  const score = geometricMean(components);
  const historyDepth = clamp(baseline.observedDays / 14, 0, 1);
  const reliability = clamp(
    0.2 + (features.available ? 0.27 : 0) + (hasSleepPhase ? 0.14 : 0) + historyDepth * 0.22 +
      (features.sleepRegularityIndex != null ? 0.08 : 0) - (features.partialDay ? 0.12 : 0),
    0.18,
    0.94,
  );

  return signal("circadian", score, reliability, features.available
    ? `节律融合 RA、IV、IS、双谐波拟合与睡眠规律性；活动覆盖 ${features.observedHours} 小时。`
    : "小时活动不足，节律估计主要依据睡眠相位和历史规律性。", { ...features });
}

function scoreMood(day: DailyRecord, baseline: PersonalBaseline): RhythmSignal | null {
  if (!day.mood) return null;
  const mood = bounded(day.mood.mood_score, 0, 100);
  if (mood == null) return null;
  const center = baseline.mood.median;
  const deviation = center == null ? null : robustZ(mood, baseline.mood, 12);
  const personalAdjustment = deviation == null ? 0 : clamp(deviation * 3, -9, 9);
  const score = clamp(mood + personalAdjustment, 0, 100);
  const reliability = clamp(0.5 + (baseline.mood.count >= 7 ? 0.14 : 0) + (day.mood.diary_content ? 0.08 : 0), 0.5, 0.82);
  return signal("mood", score, reliability, center == null
    ? "情绪已记录，个体基线仍在建立。"
    : `情绪 ${Math.round(mood)} 分，相对个人中位数变化 ${Math.round(mood - center)} 分。`, {
      mood,
      personalMedian: center,
      robustDeviation: roundNullable(deviation, 3),
    });
}

function scoreNutrition(day: DailyRecord, baseline: PersonalBaseline): RhythmSignal | null {
  if (!day.nutrition) return null;
  const calories = bounded(day.nutrition.total_calories, 0, 12000);
  if (calories == null || calories === 0) return null;
  const personal = baseline.nutritionCalories.median ?? 1900;
  const shrink = baseline.nutritionCalories.count / (baseline.nutritionCalories.count + 10);
  const target = 1900 * (1 - shrink) + personal * shrink;
  const relativeError = Math.abs(calories - target) / Math.max(900, target);
  const score = clamp(100 - relativeError * 85, 20, 100);
  const itemCount = ["breakfast_items", "lunch_items", "dinner_items", "pantry_items"]
    .reduce((sum, key) => sum + (Array.isArray(day.nutrition?.[key]) ? (day.nutrition?.[key] as unknown[]).length : 0), 0);
  const reliability = clamp(0.28 + (itemCount > 0 ? 0.18 : 0) + (baseline.nutritionCalories.count >= 7 ? 0.12 : 0), 0.28, 0.65);
  return signal("nutrition", score, reliability,
    `摄入约 ${Math.round(calories)} kcal；由于缺少完整营养素和个体代谢信息，本信号保持低权重。`, {
      calories,
      target: round(target, 1),
      itemCount,
      limitation: "calories_only_without_macronutrients_or_energy_expenditure",
    });
}

function scoreFocus(day: DailyRecord, baseline: PersonalBaseline): RhythmSignal | null {
  if (!Number.isFinite(day.focusMinutes) || day.focusMinutes <= 0) return null;
  const progress = activityDayProgress(day);
  const target = clamp((baseline.focusMinutes.median ?? 75) * 0.7 + 75 * 0.3, 25, 180) * progress;
  const achievement = saturatingAchievement(day.focusMinutes, target);
  const overextension = day.focusMinutes > 360 ? clamp((day.focusMinutes - 360) / 6, 0, 25) : 0;
  const score = clamp(achievement - overextension, 10, 100);
  const reliability = clamp(0.42 + (baseline.focusMinutes.count >= 7 ? 0.14 : 0) + (day.focusSessions >= 2 ? 0.06 : 0), 0.42, 0.72);
  return signal("focus", score, reliability,
    `完成 ${Math.round(day.focusMinutes)} 分钟、${Math.round(day.focusSessions)} 次专注；该信号描述行为节奏，不等同于健康结论。`, {
      focusMinutes: day.focusMinutes,
      sessions: day.focusSessions,
      target: round(target, 1),
      overextension: round(overextension, 1),
    });
}

function scoreRecovery(day: DailyRecord, baseline: PersonalBaseline): RhythmSignal | null {
  const hrv = validHrv(day.health?.heart_rate_variability_sdnn);
  const restingHr = validRestingHeartRate(day.health?.resting_heart_rate);
  const latestHr = validHeartRate(day.health?.latest_heart_rate);
  const duration = validSleepDuration(day.sleep?.sleep_duration_minutes);
  if (hrv == null && restingHr == null && latestHr == null && duration == null) return null;

  const hrvZ = hrv == null ? null : robustZ(hrv, baseline.hrvSdnn, 10);
  const restingZ = restingHr == null ? null : -robustZ(restingHr, baseline.restingHeartRate, 6);
  const sleepTarget = baseline.sleepDuration.median ?? 450;
  const sleepZ = duration == null ? null : -Math.abs(duration - sleepTarget) / Math.max(60, baseline.sleepDuration.scale ?? 75);
  const components = [
    hrvZ == null ? null : latentToScore(clamp(hrvZ, -2.8, 2.8), 1.15),
    restingZ == null ? null : latentToScore(clamp(restingZ, -2.8, 2.8), 1.15),
    sleepZ == null ? null : latentToScore(clamp(sleepZ + 1.2, -2.8, 2.8), 1.15),
  ];
  const score = weightedAvailableMean(components, [0.43, 0.32, 0.25], 55);
  const present = components.filter((value) => value != null).length;
  const historySupport = clamp((baseline.hrvSdnn.count + baseline.restingHeartRate.count) / 14, 0, 1);
  const reliability = clamp(0.18 + present * 0.2 + historySupport * 0.16, 0.2, 0.94);
  return signal("recovery", score, reliability, hrv != null
    ? `HRV SDNN ${Math.round(hrv)} ms，结合静息心率、睡眠和个人鲁棒基线估计恢复。`
    : "缺少 HRV，恢复估计仅使用心率或睡眠，置信度已下调。", {
      hrv,
      restingHeartRate: restingHr,
      latestHeartRate: latestHr,
      sleepDuration: duration,
      robustDeviations: { hrv: roundNullable(hrvZ, 3), restingHeartRate: roundNullable(restingZ, 3), sleep: roundNullable(sleepZ, 3) },
    });
}

function robustStateFilter(days: DayAnalysis[], config: RhythmConfig): FilterDay[] {
  let mean: Vector4 = [0, 0, 0, 0];
  let covariance: Matrix4 = diagonal([1.5, 1.5, 1.6, 1.7]);
  const output: FilterDay[] = [];

  for (const day of days) {
    mean = multiplyDiagonalVector(config.persistence, mean);
    covariance = addMatrices(
      multiplyDiagonalBoth(config.persistence, covariance),
      diagonal(config.processNoise),
    );
    const robustWeights: FilterDay["robustWeights"] = [];

    const preview = day.signals.map((item) => {
      const model = signalModels[item.key];
      const observation = scoreToLatent(item.score, config.scoreTemperature);
      const innovation = observation - dot(model.loading, mean);
      const variance = quadratic(model.loading, covariance) + model.variance / Math.max(0.08, item.reliability ** 2);
      return { innovation, standardized: innovation / Math.sqrt(Math.max(1e-6, variance)) };
    });
    const positive = preview.filter((item) => item.standardized > 0.55).length;
    const negative = preview.filter((item) => item.standardized < -0.55).length;
    const consensusSign = preview.length >= 3 && Math.max(positive, negative) / preview.length >= 0.66
      ? (positive > negative ? 1 : -1)
      : 0;
    const consensusStrength = preview.length === 0 ? 0 : median(preview.map((item) => Math.abs(item.standardized)));
    if (consensusSign !== 0 && consensusStrength > 0.75) {
      const inflation = clamp((consensusStrength - 0.55) * 0.18, 0.04, 0.42);
      covariance = addMatrices(covariance, diagonal([inflation, inflation, inflation, inflation]));
    }

    for (const [updateIndex, item] of [...day.signals].sort((a, b) => b.reliability - a.reliability).entries()) {
      const model = signalModels[item.key];
      const observation = scoreToLatent(item.score, config.scoreTemperature);
      const predicted = dot(model.loading, mean);
      const innovation = observation - predicted;
      const projectedVariance = quadratic(model.loading, covariance);
      // Same-day domains are correlated. Increasing the variance for later
      // updates prevents false precision from counting shared evidence twice.
      const observationVariance = model.variance / Math.max(0.08, item.reliability ** 2) * (1 + updateIndex * 0.24);
      const innovationVariance = Math.max(1e-6, projectedVariance + observationVariance);
      const standardized = innovation / Math.sqrt(innovationVariance);
      let studentWeight = clamp(
        (config.studentDegreesOfFreedom + 1) / (config.studentDegreesOfFreedom + standardized ** 2),
        0.08,
        1,
      );
      if (consensusSign !== 0 && Math.sign(standardized) === consensusSign && Math.abs(standardized) < 4.5) {
        studentWeight = Math.max(studentWeight, 0.68);
      }
      const effectiveVariance = observationVariance / studentWeight;
      const gainDenominator = Math.max(1e-6, projectedVariance + effectiveVariance);
      const pHt = multiplyMatrixVector(covariance, model.loading);
      const gain = pHt.map((value) => value / gainDenominator) as Vector4;
      mean = mean.map((value, index) => value + gain[index] * innovation) as Vector4;
      covariance = josephUpdate(covariance, gain, model.loading, effectiveVariance);
      robustWeights.push({
        key: item.key,
        weight: round(studentWeight, 4),
        innovation: round(innovation, 4),
        standardizedInnovation: round(standardized, 4),
      });
    }

    const recentScoreSlope = robustTrendSlope(output.slice(-6).map((item) => item.score));
    const fusion = calculateUtilityFusion(mean, day.signals, robustWeights, recentScoreSlope, config);
    const residualVariance = robustWeights.length === 0
      ? 0.18
      : median(robustWeights.map((item) => Math.min(4, item.innovation ** 2))) * 0.08;
    const correlationGuard = day.signals.length > 1 ? 0.08 + (day.signals.length - 1) * 0.012 : 0.14;
    const utilityDisagreement = Math.abs(fusion.latent - fusion.slowLatent) * 0.1 + fusion.acuteBlend * fusion.dispersion * 0.05;
    const variance = Math.max(1e-6, quadratic(globalLoading, covariance) + residualVariance + correlationGuard + utilityDisagreement);
    const intervalDelta = 1.2816 * Math.sqrt(variance);
    output.push({
      date: day.date,
      mean: [...mean] as Vector4,
      covariance: cloneMatrix(covariance),
      score: latentToScore(fusion.latent, config.scoreTemperature),
      lower: latentToScore(fusion.latent - intervalDelta, config.scoreTemperature),
      upper: latentToScore(fusion.latent + intervalDelta, config.scoreTemperature),
      latent: fusion.latent,
      slowLatent: fusion.slowLatent,
      factorRiskLatent: fusion.factorRiskLatent,
      acuteLatent: fusion.acuteLatent,
      acuteBlend: fusion.acuteBlend,
      lowConsensus: fusion.lowConsensus,
      highConsensus: fusion.highConsensus,
      trendPressure: fusion.trendPressure,
      observation: aggregateObservation(day.signals, config.scoreTemperature),
      evidenceCount: day.signals.length,
      robustWeights,
    });
  }
  return output;
}

function bayesianOnlineChangePoints(values: Array<number | null>, hazard: number, maxRunLength: number) {
  type Parameters = { mu: number; kappa: number; alpha: number; beta: number };
  const prior: Parameters = { mu: 0, kappa: 1, alpha: 2, beta: 1 };
  let logProbabilities = [0];
  let parameters = [prior];
  const probabilities: number[] = [];

  for (const value of values) {
    if (value == null || !Number.isFinite(value)) {
      probabilities.push(0);
      continue;
    }
    const priorPredictive = studentTLogPdf(value, prior);
    const predictive = parameters.map((item) => studentTLogPdf(value, item));
    const changeLog = logSumExp(logProbabilities) + Math.log(hazard) + priorPredictive;
    const growthLogs = logProbabilities.map((probability, index) => probability + Math.log(1 - hazard) + predictive[index]);
    const nextLogs = [changeLog, ...growthLogs].slice(0, maxRunLength + 1);
    const normalization = logSumExp(nextLogs);
    logProbabilities = nextLogs.map((item) => item - normalization);
    const nextParameters = [updateNormalInverseGamma(prior, value), ...parameters.map((item) => updateNormalInverseGamma(item, value))]
      .slice(0, maxRunLength + 1);
    parameters = nextParameters;
    probabilities.push(clamp(Math.exp(logProbabilities[0]), 0, 1));
  }
  return probabilities;
}

function calculateActivityRhythm(day: DailyRecord, history: DailyRecord[]): ActivityRhythmFeatures {
  const today = activityVector(day);
  const historyVectors = history.map(activityVector).filter((item) => item.complete && item.values.some((value) => value > 0));
  const sleepRegularity = sleepRegularityIndex([...history.slice(-14), day]);
  const empty: ActivityRhythmFeatures = {
    available: false,
    partialDay: today.observedHours > 0 && !today.complete,
    observedHours: today.observedHours,
    todayRa: null,
    todayIv: null,
    historyIs: historyVectors.length >= 3 ? round(interdailyStability(historyVectors.map((item) => item.values)) ?? 0, 3) : null,
    historyRa: historyVectors.length >= 3 ? round(median(historyVectors.map((item) => relativeAmplitude(item.values) ?? 0)), 3) : null,
    m10: null,
    l5: null,
    m10StartHour: null,
    l5StartHour: null,
    cosinorR2: null,
    cosinorAmplitude: null,
    acrophaseHour: null,
    acrophaseDeviationMinutes: null,
    sleepRegularityIndex: sleepRegularity,
  };
  if (!today.complete || !today.values.some((value) => value > 0)) return empty;

  const m10 = movingWindowExtreme(today.values, 10, "max");
  const l5 = movingWindowExtreme(today.values, 5, "min");
  const todayRa = relativeAmplitude(today.values);
  const todayIv = intradailyVariability(today.values);
  const cosinor = harmonicCircadianFit(today.values);
  const historyPhases = historyVectors.map((item) => harmonicCircadianFit(item.values).acrophaseHour).filter(isNumber);
  const phaseCenter = historyPhases.length >= 3 ? circularMedian(historyPhases.map((hour) => hour * 60), undefined) : null;
  const phaseDeviation = phaseCenter == null ? null : Math.abs(signedCircularDiff(cosinor.acrophaseHour * 60, phaseCenter));

  return {
    available: true,
    partialDay: false,
    observedHours: today.observedHours,
    todayRa: roundNullable(todayRa, 3),
    todayIv: roundNullable(todayIv, 3),
    historyIs: historyVectors.length >= 3 ? roundNullable(interdailyStability([...historyVectors.map((item) => item.values), today.values]), 3) : null,
    historyRa: historyVectors.length >= 3 ? round(median(historyVectors.map((item) => relativeAmplitude(item.values) ?? 0)), 3) : null,
    m10: round(m10.value, 4),
    l5: round(l5.value, 4),
    m10StartHour: m10.start,
    l5StartHour: l5.start,
    cosinorR2: round(cosinor.r2, 3),
    cosinorAmplitude: round(cosinor.relativeAmplitude, 3),
    acrophaseHour: round(cosinor.acrophaseHour, 2),
    acrophaseDeviationMinutes: roundNullable(phaseDeviation, 1),
    sleepRegularityIndex: sleepRegularity,
  };
}

function calculatePhaseShift(day: DailyRecord, baseline: PersonalBaseline) {
  const midpoint = sleepMidpoint(day);
  const target = baseline.sleepMidpoint.median;
  if (midpoint == null || target == null) return null;
  return Math.round(signedCircularDiff(midpoint, target));
}

function calculateRegularityScore(
  day: DailyRecord,
  history: DailyRecord[],
  baseline: PersonalBaseline,
  activity: ActivityRhythmFeatures,
) {
  const components: Array<{ value: number; weight: number }> = [];
  if (activity.historyIs != null) components.push({ value: clamp(activity.historyIs * 110, 0, 100), weight: 0.24 });
  if (activity.todayRa != null) components.push({ value: clamp((activity.todayRa - 0.15) / 0.7 * 100, 0, 100), weight: 0.2 });
  if (activity.todayIv != null) components.push({ value: clamp(112 - activity.todayIv * 48, 0, 100), weight: 0.18 });
  if (activity.sleepRegularityIndex != null) components.push({ value: activity.sleepRegularityIndex, weight: 0.22 });
  const phaseShift = calculatePhaseShift(day, baseline);
  if (phaseShift != null) components.push({ value: 100 * Math.exp(-0.5 * (phaseShift / 90) ** 2), weight: 0.16 });
  if (components.length === 0 && history.filter(hasAnySignal).length < 3) return null;
  if (components.length === 0) return 50;
  return Math.round(geometricMean(components));
}

function calculateFragmentationRisk(day: DailyRecord, baseline: PersonalBaseline, activity: ActivityRhythmFeatures) {
  const stage = sleepStages(day);
  const duration = validSleepDuration(day.sleep?.sleep_duration_minutes);
  const components: Array<{ value: number; weight: number }> = [];
  if (activity.todayIv != null) components.push({ value: clamp(activity.todayIv / 1.8 * 100, 0, 100), weight: 0.38 });
  if (activity.todayRa != null) components.push({ value: clamp((0.72 - activity.todayRa) / 0.55 * 100, 0, 100), weight: 0.22 });
  if (duration != null && stage.awake > 0) components.push({ value: clamp(stage.awake / Math.max(duration + stage.awake, 1) * 500, 0, 100), weight: 0.18 });
  const phaseShift = calculatePhaseShift(day, baseline);
  if (phaseShift != null) components.push({ value: clamp(Math.abs(phaseShift) / 180 * 100, 0, 100), weight: 0.12 });
  if (activity.cosinorR2 != null) components.push({ value: clamp((0.55 - activity.cosinorR2) / 0.55 * 100, 0, 100), weight: 0.1 });
  if (components.length === 0) return null;
  return Math.round(weightedMean(components));
}

function detectAnomalies(
  current: DayAnalysis,
  state: FilterDay,
  changePoint: number,
  recentChangePoint: number,
  trendSlope: number,
) {
  const flags = [...current.validationFlags];
  const sleep = current.signals.find((item) => item.key === "sleep");
  const recovery = current.signals.find((item) => item.key === "recovery");
  const activity = current.signals.find((item) => item.key === "activity");
  const mood = current.signals.find((item) => item.key === "mood");

  if (sleep && sleep.score < 38) flags.push(flag("sleep_strain", "warning", "睡眠相对个人基线和规律性明显偏弱。", sleep.score, 50));
  if (recovery && recovery.score < 38) flags.push(flag("recovery_strain", "warning", "恢复信号持续偏弱，请降低今日负荷。", recovery.score, 50));
  if (activity && activity.score < 30 && Number(activity.evidence.progress ?? 1) > 0.7) flags.push(flag("low_activity", "warning", "活动量在当前日进度下明显不足。", activity.score, 50));
  if (mood && mood.score < 35) flags.push(flag("low_mood", "warning", "情绪记录明显偏低。", mood.score, 50));
  if (current.phaseShiftMinutes != null && Math.abs(current.phaseShiftMinutes) >= 120) {
    flags.push(flag("phase_shift", "warning", current.phaseShiftMinutes > 0 ? "睡眠相位明显推迟。" : "睡眠相位明显提前。", current.phaseShiftMinutes, 0));
  }
  if (current.activityRhythm.todayRa != null && current.activityRhythm.todayRa < 0.35) {
    flags.push(flag("weak_rest_activity_amplitude", "warning", "日夜活动边界偏弱。", current.activityRhythm.todayRa, current.activityRhythm.historyRa));
  }
  if (current.activityRhythm.todayIv != null && current.activityRhythm.todayIv > 1.35) {
    flags.push(flag("high_intradaily_variability", "warning", "日内活动碎片化较高。", current.activityRhythm.todayIv, null));
  }
  const rejected = state.robustWeights.filter((item) => item.weight < 0.32);
  if (rejected.length > 0) {
    flags.push({
      code: "sensor_conflict",
      severity: "info",
      message: `检测到 ${rejected.length} 个与其余信号冲突的观测，已自动降低影响。`,
      value: rejected.length,
      confidence: 1 - Math.min(...rejected.map((item) => item.weight)),
    });
  }
  if (changePoint >= 0.45 || recentChangePoint >= 0.62) {
    flags.push({
      code: "regime_change",
      severity: "warning",
      message: "近期状态可能发生结构性变化，算法已开始重建个人基线。",
      value: Math.max(changePoint, recentChangePoint),
      confidence: Math.max(changePoint, recentChangePoint),
    });
  }
  if (trendSlope <= -3) flags.push(flag("sustained_decline", "warning", "过去一周的节律状态呈持续下降趋势。", trendSlope, 0));
  return dedupeFlags(flags);
}

function calculateConfidence(current: DayAnalysis, state: FilterDay, flags: AnomalyFlag[], config: RhythmConfig) {
  const coverage = current.signals.reduce((sum, item) => sum + signalModels[item.key].weight * item.reliability, 0);
  const history = clamp(current.baseline.observedDays / Math.max(config.minimumHistoryDays * 2, 1), 0, 1);
  const evidenceDepth = clamp(current.signals.length / 3, 0, 1);
  const precision = clamp(1 - (state.upper - state.lower) / 70, 0, 1) * evidenceDepth;
  const invalidPenalty = flags.filter((item) => item.code.startsWith("invalid_")).length * 0.06;
  return round(clamp(0.08 + coverage * 0.42 + history * 0.2 + precision * 0.3 - invalidPenalty, 0.08, 0.97), 2);
}

function calculateDataQuality(current: DayAnalysis, state: FilterDay, config: RhythmConfig) {
  const sourceCoverage = current.signals.reduce((sum, item) => sum + signalModels[item.key].weight, 0);
  const weightedReliability = current.signals.length === 0
    ? 0
    : current.signals.reduce((sum, item) => sum + item.reliability * signalModels[item.key].weight, 0) / Math.max(0.01, sourceCoverage);
  const historyDepth = clamp(current.baseline.observedDays / Math.max(config.minimumHistoryDays * 2, 1), 0, 1);
  const consistency = state.robustWeights.length === 0
    ? 0
    : state.robustWeights.reduce((sum, item) => sum + item.weight, 0) / state.robustWeights.length;
  return {
    score: Math.round(clamp(sourceCoverage * 0.35 + weightedReliability * 0.3 + historyDepth * 0.2 + consistency * 0.15, 0, 1) * 100),
    sourceCoverage: round(sourceCoverage, 3),
    weightedReliability: round(weightedReliability, 3),
    historyDepth: round(historyDepth, 3),
    crossSignalConsistency: round(consistency, 3),
    observedHistoryDays: current.baseline.observedDays,
  };
}

function buildProfileLabels(
  current: DayAnalysis,
  state: FilterDay,
  changePoint: number,
  trendSlope: number,
  recoveryScore: number | null,
) {
  const labels: string[] = [];
  if ((current.phaseShiftMinutes ?? 0) > 90) labels.push("late_shift");
  if ((current.phaseShiftMinutes ?? 0) < -90) labels.push("early_shift");
  if ((current.regularityScore ?? 100) < 55) labels.push("irregular_rhythm");
  if ((current.fragmentationRisk ?? 0) > 58) labels.push("fragmented_day");
  if ((current.activityRhythm.todayRa ?? 1) < 0.35) labels.push("weak_day_night_boundary");
  if ((recoveryScore ?? 100) < 50) labels.push("recovery_debt");
  if (changePoint >= 0.45) labels.push("regime_transition");
  if (trendSlope <= -3) labels.push("declining_week");
  if (state.upper - state.lower > 35) labels.push("high_uncertainty");
  if (current.signals.length < 3) labels.push("sparse_data");
  return labels;
}

function buildActions(current: DayAnalysis, flags: AnomalyFlag[], trendSlope: number, recoveryScore: number | null) {
  const byKey = new Map(current.signals.map((item) => [item.key, item]));
  const actions: string[] = [];
  if (flags.some((item) => item.code === "invalid_spo2" || item.code === "low_spo2")) actions.push("血氧异常时先静坐复测；如伴随不适，请及时寻求专业帮助。");
  if ((current.phaseShiftMinutes ?? 0) > 90) actions.push("今晚把入睡准备提前 20 到 30 分钟，避免一次性大幅调整。");
  if ((current.phaseShiftMinutes ?? 0) < -90) actions.push("傍晚安排轻活动和充足光照，避免过早困倦。");
  if ((recoveryScore ?? 100) < 50) actions.push("今天降低运动强度，优先补水、规律进餐和完整睡眠。");
  if (trendSlope <= -3) actions.push("连续下降比单日低分更重要：今天只选一项最容易恢复的习惯执行。");
  if (!byKey.has("sleep")) actions.push("补齐昨晚睡眠起止时间，算法才能判断相位与规律性。");
  if (!byKey.has("activity")) actions.push("同步 Apple 健康的小时活动数据，补齐日内节律曲线。");
  if (!byKey.has("mood")) actions.push("用 10 秒记录情绪，补充可穿戴设备无法直接观察的主观状态。");
  return [...new Set(actions)].slice(0, 4);
}

function validateDay(day: DailyRecord) {
  const flags: AnomalyFlag[] = [];
  const rawSleep = optionalNumeric(day.sleep?.sleep_duration_minutes);
  const rawSteps = optionalNumeric(day.exercise?.steps);
  const rawRhr = optionalNumeric(day.health?.resting_heart_rate);
  const rawHrv = optionalNumeric(day.health?.heart_rate_variability_sdnn);
  const rawSpo2 = normalizeSpo2(day.health?.blood_oxygen ?? day.exercise?.spo2);
  if (rawSleep != null && (rawSleep < 0 || rawSleep > 1200)) flags.push(flag("invalid_sleep_duration", "warning", "睡眠时长超出可接受范围，已从计算中排除。", rawSleep, null));
  if (rawSteps != null && (rawSteps < 0 || rawSteps > 100000)) flags.push(flag("invalid_steps", "warning", "步数超出可接受范围，已从计算中排除。", rawSteps, null));
  if (rawRhr != null && (rawRhr < 30 || rawRhr > 160)) flags.push(flag("invalid_resting_heart_rate", "warning", "静息心率超出可接受范围，已从计算中排除。", rawRhr, null));
  if (rawHrv != null && (rawHrv <= 0 || rawHrv > 400)) flags.push(flag("invalid_hrv", "warning", "HRV 超出可接受范围，已从计算中排除。", rawHrv, null));
  if (rawSpo2 != null && (rawSpo2 < 70 || rawSpo2 > 100)) flags.push(flag("invalid_spo2", "critical", "血氧读数异常，请先确认设备佩戴与读数。", rawSpo2, null));
  if (rawSpo2 != null && rawSpo2 >= 70 && rawSpo2 < 94) flags.push(flag("low_spo2", "critical", "血氧读数偏低，请复测并结合身体感受判断。", rawSpo2, null));
  const stage = sleepStages(day);
  const duration = validSleepDuration(day.sleep?.sleep_duration_minutes);
  if (duration != null && stage.total > duration * 1.08) flags.push(flag("invalid_sleep_stages", "warning", "睡眠阶段总和超过总睡眠时长，阶段数据已降低可信度。", stage.total, duration));
  return flags;
}

function buildBaseline(history: DailyRecord[], windowDays: number): PersonalBaseline {
  const days = history.slice(-windowDays);
  const observed = days.filter(hasAnySignal);
  return {
    historyDays: windowDays,
    observedDays: observed.length,
    sleepDuration: robustMetric(days, (day) => validSleepDuration(day.sleep?.sleep_duration_minutes)),
    sleepStart: robustMetric(days, (day) => parseClock(day.sleep?.sleep_start), true),
    sleepMidpoint: robustMetric(days, sleepMidpoint, true),
    steps: robustMetric(days, (day) => bounded(day.exercise?.steps, 0, 100000)),
    exerciseMinutes: robustMetric(days, (day) => bounded(day.exercise?.exercise_minutes, 0, 1440)),
    activeCalories: robustMetric(days, (day) => bounded(day.exercise?.calories, 0, 10000)),
    mood: robustMetric(days, (day) => bounded(day.mood?.mood_score, 0, 100)),
    nutritionCalories: robustMetric(days, (day) => bounded(day.nutrition?.total_calories, 0, 12000)),
    focusMinutes: robustMetric(days, (day) => day.focusMinutes > 0 ? bounded(day.focusMinutes, 1, 1440) : null),
    latestHeartRate: robustMetric(days, (day) => validHeartRate(day.health?.latest_heart_rate ?? day.exercise?.heart_rate)),
    restingHeartRate: robustMetric(days, (day) => validRestingHeartRate(day.health?.resting_heart_rate)),
    hrvSdnn: robustMetric(days, (day) => validHrv(day.health?.heart_rate_variability_sdnn)),
  };
}

function robustMetric(days: DailyRecord[], extractor: (day: DailyRecord) => number | null, circular = false): RobustMetric {
  const samples = days.map((day, index) => ({ value: extractor(day), age: days.length - index - 1 }))
    .filter((item): item is { value: number; age: number } => item.value != null && Number.isFinite(item.value));
  if (samples.length === 0) return { count: 0, effectiveCount: 0, mean: null, median: null, mad: null, scale: null, min: null, max: null };
  const weighted = samples.map((item) => ({ value: item.value, weight: Math.exp(-Math.log(2) * item.age / 14) }));
  const center = circular
    ? circularMedian(weighted.map((item) => item.value), weighted.map((item) => item.weight))
    : weightedMedian(weighted);
  const deviations = weighted.map((item) => ({
    value: circular ? Math.abs(signedCircularDiff(item.value, center)) : Math.abs(item.value - center),
    weight: item.weight,
  }));
  const mad = weightedMedian(deviations);
  const values = samples.map((item) => item.value);
  const sumWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const sumWeightSquared = weighted.reduce((sum, item) => sum + item.weight ** 2, 0);
  return {
    count: samples.length,
    effectiveCount: round(sumWeight ** 2 / Math.max(1e-6, sumWeightSquared), 2),
    mean: round(circular ? circularMean(values) : values.reduce((sum, value) => sum + value, 0) / values.length, 2),
    median: round(center, 2),
    mad: round(mad, 2),
    scale: round(Math.max(mad * 1.4826, 1e-3), 2),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function activityVector(day: DailyRecord): ActivityVector {
  const bins = extractActivityBins(day);
  const values = Array.from({ length: 24 }, () => 0);
  const observed = Array.from({ length: 24 }, () => false);
  if (bins.length === 0) return { values, observed, observedHours: 0, complete: false };

  const totals = {
    steps: bins.reduce((sum, item) => sum + item.steps, 0),
    energy: bins.reduce((sum, item) => sum + item.activeEnergyKcal, 0),
    exercise: bins.reduce((sum, item) => sum + item.exerciseMinutes, 0),
  };
  for (const bin of bins) {
    const hour = clamp(Math.floor(bin.hour), 0, 23);
    observed[hour] = true;
    const channels = [
      totals.steps > 0 ? bin.steps / totals.steps : null,
      totals.energy > 0 ? bin.activeEnergyKcal / totals.energy : null,
      totals.exercise > 0 ? bin.exerciseMinutes / totals.exercise : null,
    ].filter(isNumber);
    if (channels.length > 0) values[hour] += channels.reduce((sum, value) => sum + value, 0) / channels.length;
  }
  const observedHours = observed.filter(Boolean).length;
  return { values, observed, observedHours, complete: observedHours >= 20 };
}

function extractActivityBins(day: DailyRecord) {
  const payload = day.health?.raw_payload as Record<string, unknown> | undefined;
  const raw = day.health?.activity_bins ?? payload?.activityBins ?? payload?.activity_bins;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const value = item as Record<string, unknown>;
    return {
      hour: inferHour(value),
      steps: bounded(value.steps, 0, 100000) ?? 0,
      activeEnergyKcal: bounded(value.activeEnergyKcal ?? value.active_energy_kcal, 0, 2000) ?? 0,
      exerciseMinutes: bounded(value.exerciseMinutes ?? value.exercise_minutes, 0, 60) ?? 0,
    };
  }).filter((item) => item.hour >= 0 && item.hour <= 23);
}

function inferHour(value: Record<string, unknown>) {
  const explicit = bounded(value.hour ?? value.startHour, 0, 23);
  if (explicit != null) return Math.floor(explicit);
  if (typeof value.start === "string") {
    const parsed = new Date(value.start);
    if (!Number.isNaN(parsed.getTime())) return parsed.getHours();
  }
  return -1;
}

function activityDayProgress(day: DailyRecord) {
  const vector = activityVector(day);
  if (vector.observedHours === 0 || vector.complete) return 1;
  const typical = Array.from({ length: 24 }, (_, hour) => {
    if (hour < 6 || hour >= 23) return 0.01;
    if (hour < 9) return 0.05;
    if (hour < 12) return 0.08;
    if (hour < 14) return 0.1;
    if (hour < 18) return 0.08;
    if (hour < 21) return 0.11;
    return 0.05;
  });
  const total = typical.reduce((sum, value) => sum + value, 0);
  const observed = typical.reduce((sum, value, hour) => sum + (vector.observed[hour] ? value : 0), 0);
  return clamp(observed / total, 0.12, 1);
}

function harmonicCircadianFit(values: number[]) {
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, n);
  let a1 = 0;
  let b1 = 0;
  let a2 = 0;
  let b2 = 0;
  for (let hour = 0; hour < n; hour += 1) {
    const angle = 2 * Math.PI * hour / 24;
    a1 += values[hour] * Math.cos(angle);
    b1 += values[hour] * Math.sin(angle);
    a2 += values[hour] * Math.cos(2 * angle);
    b2 += values[hour] * Math.sin(2 * angle);
  }
  a1 *= 2 / n;
  b1 *= 2 / n;
  a2 *= 2 / n;
  b2 *= 2 / n;
  const fitted = values.map((_, hour) => {
    const angle = 2 * Math.PI * hour / 24;
    return mean + a1 * Math.cos(angle) + b1 * Math.sin(angle) + a2 * Math.cos(2 * angle) + b2 * Math.sin(2 * angle);
  });
  const totalVariance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const residual = values.reduce((sum, value, index) => sum + (value - fitted[index]) ** 2, 0);
  const amplitude = Math.sqrt(a1 ** 2 + b1 ** 2);
  const phaseRadians = Math.atan2(b1, a1);
  return {
    r2: totalVariance <= 1e-12 ? 0 : clamp(1 - residual / totalVariance, 0, 1),
    relativeAmplitude: mean <= 1e-12 ? 0 : amplitude / mean,
    acrophaseHour: ((phaseRadians / (2 * Math.PI) * 24) % 24 + 24) % 24,
  };
}

function sleepRegularityIndex(days: DailyRecord[]) {
  const profiles = days.map(sleepWakeProfile).filter((item): item is boolean[] => item != null);
  if (profiles.length < 3) return null;
  let same = 0;
  let comparisons = 0;
  for (let day = 1; day < profiles.length; day += 1) {
    for (let bin = 0; bin < 48; bin += 1) {
      if (profiles[day][bin] === profiles[day - 1][bin]) same += 1;
      comparisons += 1;
    }
  }
  return Math.round(clamp((same / comparisons * 200) - 100, 0, 100));
}

function sleepWakeProfile(day: DailyRecord) {
  const start = parseClock(day.sleep?.sleep_start);
  const duration = validSleepDuration(day.sleep?.sleep_duration_minutes);
  if (start == null || duration == null) return null;
  const profile = Array.from({ length: 48 }, () => false);
  const startBin = Math.floor(start / 30);
  const bins = Math.min(40, Math.ceil(duration / 30));
  for (let offset = 0; offset < bins; offset += 1) profile[(startBin + offset) % 48] = true;
  return profile;
}

function sleepStages(day: DailyRecord) {
  const healthStages = day.health?.sleep_stage_minutes as Record<string, unknown> | undefined;
  const deep = bounded(day.sleep?.deep_sleep_minutes ?? healthStages?.deep, 0, 1000) ?? 0;
  const rem = bounded(day.sleep?.rem_minutes ?? healthStages?.rem, 0, 1000) ?? 0;
  const core = bounded(day.sleep?.light_sleep_minutes ?? healthStages?.core, 0, 1000) ?? 0;
  const unspecified = bounded(healthStages?.asleep, 0, 1000) ?? 0;
  const awake = bounded(healthStages?.awake, 0, 1000) ?? 0;
  return { deep, rem, core, unspecified, awake, total: deep + rem + core + unspecified };
}

function scoreSleepStages(stage: ReturnType<typeof sleepStages>, duration: number | null) {
  if (stage.total <= 0 || duration == null || duration <= 0) return 60;
  const deepRatio = stage.deep / duration;
  const remRatio = stage.rem / duration;
  const awakeRatio = stage.awake / Math.max(1, duration + stage.awake);
  const deepScore = 100 * Math.exp(-0.5 * ((deepRatio - 0.18) / 0.1) ** 2);
  const remScore = 100 * Math.exp(-0.5 * ((remRatio - 0.22) / 0.12) ** 2);
  const continuityScore = clamp(100 - awakeRatio * 260, 15, 100);
  return weightedMean([{ value: deepScore, weight: 0.36 }, { value: remScore, weight: 0.34 }, { value: continuityScore, weight: 0.3 }]);
}

function relativeAmplitude(values: number[]) {
  if (values.length !== 24) return null;
  const m10 = movingWindowExtreme(values, 10, "max").value;
  const l5 = movingWindowExtreme(values, 5, "min").value;
  return m10 + l5 <= 1e-12 ? null : clamp((m10 - l5) / (m10 + l5), 0, 1);
}

function movingWindowExtreme(values: number[], size: number, mode: "min" | "max") {
  let rolling = values.slice(0, size).reduce((sum, value) => sum + value, 0);
  let best = rolling;
  let start = 0;
  for (let index = 1; index < values.length; index += 1) {
    rolling += values[(index + size - 1) % values.length] - values[index - 1];
    if ((mode === "max" && rolling > best) || (mode === "min" && rolling < best)) {
      best = rolling;
      start = index;
    }
  }
  return { value: best / size, start };
}

function intradailyVariability(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const denominator = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  if (denominator <= 1e-12) return null;
  const numerator = values.slice(1).reduce((sum, value, index) => sum + (value - values[index]) ** 2, 0);
  return values.length * numerator / ((values.length - 1) * denominator);
}

function interdailyStability(vectors: number[][]) {
  if (vectors.length < 2) return null;
  const flat = vectors.flat();
  const mean = flat.reduce((sum, value) => sum + value, 0) / flat.length;
  const denominator = flat.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  if (denominator <= 1e-12) return null;
  const hourlyMeans = Array.from({ length: 24 }, (_, hour) => vectors.reduce((sum, vector) => sum + vector[hour], 0) / vectors.length);
  const numerator = vectors.length * hourlyMeans.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return clamp(numerator / denominator, 0, 1);
}

function buildTimeline(inputs: RhythmInputs, windowDays: number) {
  const byDate = new Map<string, DailyRecord>();
  for (const day of inputs.history) if (day.date <= inputs.date) byDate.set(day.date, day);
  byDate.set(inputs.date, { ...inputs.today, date: inputs.date });
  const start = shiftDate(inputs.date, -windowDays);
  return eachDate(start, inputs.date).map((date) => byDate.get(date) ?? emptyDay(date));
}

function aggregateObservation(signals: RhythmSignal[], temperature: number) {
  if (signals.length === 0) return null;
  return weightedMedian(signals.map((item) => ({
    value: scoreToLatent(item.score, temperature),
    weight: signalModels[item.key].weight * item.reliability,
  })));
}

function calculateUtilityFusion(
  mean: Vector4,
  signals: RhythmSignal[],
  robustWeights: FilterDay["robustWeights"],
  recentScoreSlope: number,
  config: RhythmConfig,
): UtilityFusion {
  const slowLatent = dot(globalLoading, mean);
  const factorRiskLatent = entropicLowerUtility(mean.map((value, index) => ({
    value,
    weight: globalLoading[index],
  })), 0.72);

  if (signals.length === 0) {
    return {
      latent: slowLatent,
      slowLatent,
      factorRiskLatent,
      acuteLatent: null,
      acuteBlend: 0,
      lowConsensus: 0,
      highConsensus: 0,
      trendPressure: 0,
      dispersion: 0,
    };
  }

  const robustWeightByKey = new Map(robustWeights.map((item) => [item.key, item.weight]));
  const observations = signals.map((item) => {
    const model = signalModels[item.key];
    const robustWeight = robustWeightByKey.get(item.key) ?? 1;
    return {
      value: scoreToLatent(item.score, config.scoreTemperature),
      score: item.score,
      weight: model.weight * item.reliability * robustWeight,
    };
  }).filter((item) => Number.isFinite(item.value) && item.weight > 0);

  if (observations.length === 0) {
    return {
      latent: slowLatent,
      slowLatent,
      factorRiskLatent,
      acuteLatent: null,
      acuteBlend: 0,
      lowConsensus: 0,
      highConsensus: 0,
      trendPressure: 0,
      dispersion: 0,
    };
  }

  const totalWeight = observations.reduce((sum, item) => sum + item.weight, 0);
  const rawLowConsensus = observations.reduce((sum, item) => sum + (item.score < 46 ? item.weight : 0), 0) / totalWeight;
  const lowDomainShare = observations.filter((item) => item.score < 50).length / observations.length;
  const lowConsensus = clamp(rawLowConsensus + (lowDomainShare >= 0.55 ? 0.1 : 0), 0, 1);
  const highConsensus = observations.reduce((sum, item) => sum + (item.score > 70 ? item.weight : 0), 0) / totalWeight;
  const medianLatent = weightedMedian(observations);
  const lowerTail = weightedQuantile(observations, lowConsensus >= 0.52 ? 0.16 : 0.3);
  const upperTail = weightedQuantile(observations, 0.7);
  const lowerRisk = entropicLowerUtility(observations, 0.58);
  const bottomTail = unweightedTailMean(observations, 0.25);
  const deepLowShare = observations.filter((item) => item.score <= 25).length / observations.length;
  const dispersion = weightedMean(observations.map((item) => ({
    value: Math.abs(item.value - medianLatent),
    weight: item.weight,
  })));

  let acuteLatent = 0.58 * lowerRisk + 0.42 * medianLatent;
  if (lowConsensus >= 0.52) {
    const bottomTailWeight = clamp((lowDomainShare - 0.45) * 0.75 + deepLowShare * 0.42, 0, 0.32);
    acuteLatent = (1 - bottomTailWeight) * (0.25 * lowerRisk + 0.75 * lowerTail) + bottomTailWeight * bottomTail;
  }
  if (highConsensus >= 0.62) acuteLatent = 0.62 * medianLatent + 0.38 * upperTail;

  const consensus = Math.max(lowConsensus, highConsensus);
  const trendPressure = lowConsensus >= 0.48
    ? clamp((-recentScoreSlope - 2.2) / 8, 0, 0.2)
    : 0;
  const directionalPressure = lowConsensus >= highConsensus
    ? clamp((slowLatent - acuteLatent) / 2.6, 0, 0.16)
    : clamp((acuteLatent - slowLatent) / 3.2, 0, 0.08);
  const baseBlend = lowConsensus >= 0.52
    ? 0.22 + Math.max(0, lowConsensus - 0.52) * 1.28
    : 0.1 + Math.max(0, consensus - 0.42) * 0.9;
  const acuteBlend = observations.length < 3
    ? 0.06
    : clamp(baseBlend + directionalPressure + trendPressure, 0.08, lowConsensus >= 0.52 ? 0.72 : 0.5);
  const riskWeight = lowConsensus < 0.32 && highConsensus > 0.34 ? 0.18 : 0.4;
  const posteriorRiskLatent = (1 - riskWeight) * slowLatent + riskWeight * factorRiskLatent;
  const latent = clamp((1 - acuteBlend) * posteriorRiskLatent + acuteBlend * acuteLatent - trendPressure * 0.28, -4.5, 4.5);

  return {
    latent,
    slowLatent,
    factorRiskLatent,
    acuteLatent,
    acuteBlend,
    lowConsensus,
    highConsensus,
    trendPressure,
    dispersion,
  };
}

function robustTrendSlope(values: number[]) {
  if (values.length < 3) return 0;
  const slopes: number[] = [];
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) slopes.push((values[right] - values[left]) / (right - left));
  }
  return median(slopes);
}

function studentTLogPdf(value: number, parameters: { mu: number; kappa: number; alpha: number; beta: number }) {
  const degrees = 2 * parameters.alpha;
  const scaleSquared = parameters.beta * (parameters.kappa + 1) / (parameters.alpha * parameters.kappa);
  const normalized = (value - parameters.mu) ** 2 / Math.max(1e-9, degrees * scaleSquared);
  return logGamma((degrees + 1) / 2) - logGamma(degrees / 2) -
    0.5 * Math.log(degrees * Math.PI * scaleSquared) - (degrees + 1) / 2 * Math.log1p(normalized);
}

function updateNormalInverseGamma(parameters: { mu: number; kappa: number; alpha: number; beta: number }, value: number) {
  const kappa = parameters.kappa + 1;
  return {
    mu: (parameters.kappa * parameters.mu + value) / kappa,
    kappa,
    alpha: parameters.alpha + 0.5,
    beta: parameters.beta + parameters.kappa * (value - parameters.mu) ** 2 / (2 * kappa),
  };
}

function logGamma(value: number): number {
  const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const shifted = value - 1;
  let series = 0.9999999999998099;
  for (let index = 0; index < coefficients.length; index += 1) series += coefficients[index] / (shifted + index + 1);
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
}

function logSumExp(values: number[]) {
  const max = Math.max(...values);
  return max + Math.log(values.reduce((sum, value) => sum + Math.exp(value - max), 0));
}

function signal(key: SignalKey, rawScore: number, reliability: number, reason: string, evidence: Record<string, unknown>): RhythmSignal {
  const model = signalModels[key];
  return {
    key,
    label: model.label,
    score: Math.round(clamp(rawScore, 0, 100)),
    weight: model.weight,
    reliability: round(clamp(reliability, 0.05, 0.99), 3),
    reason,
    evidence,
  };
}

function scoreToLatent(score: number, temperature: number) {
  const probability = clamp(score / 100, 0.015, 0.985);
  return clamp(Math.log(probability / (1 - probability)) * temperature, -4.5, 4.5);
}

function latentToScore(latent: number, temperature: number) {
  return clamp(100 / (1 + Math.exp(-latent / temperature)), 0, 100);
}

function robustZ(value: number, metric: RobustMetric, scaleFloor: number) {
  if (metric.median == null) return 0;
  return (value - metric.median) / Math.max(scaleFloor, metric.scale ?? scaleFloor);
}

function saturatingAchievement(value: number, target: number) {
  if (target <= 0) return 50;
  return clamp(112 * (1 - Math.exp(-2.2 * value / target)), 0, 100);
}

function geometricMean(values: Array<{ value: number; weight: number }>) {
  const total = values.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return 50;
  return Math.exp(values.reduce((sum, item) => sum + Math.log(clamp(item.value, 1, 100) / 100) * item.weight, 0) / total) * 100;
}

function weightedMean(values: Array<{ value: number; weight: number }>) {
  const total = values.reduce((sum, item) => sum + item.weight, 0);
  return total <= 0 ? 50 : values.reduce((sum, item) => sum + item.value * item.weight, 0) / total;
}

function weightedAvailableMean(values: Array<number | null>, weights: number[], fallback: number) {
  const present = values.map((value, index) => ({ value, weight: weights[index] })).filter((item): item is { value: number; weight: number } => item.value != null);
  return present.length === 0 ? fallback : weightedMean(present);
}

function weightedMedian(values: Array<{ value: number; weight: number }>) {
  const sorted = values.filter((item) => Number.isFinite(item.value) && item.weight > 0).sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return 0;
  const half = sorted.reduce((sum, item) => sum + item.weight, 0) / 2;
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= half) return item.value;
  }
  return sorted.at(-1)?.value ?? 0;
}

function weightedQuantile(values: Array<{ value: number; weight: number }>, quantile: number) {
  const sorted = values.filter((item) => Number.isFinite(item.value) && item.weight > 0).sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return 0;
  const target = sorted.reduce((sum, item) => sum + item.weight, 0) * clamp(quantile, 0, 1);
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= target) return item.value;
  }
  return sorted.at(-1)?.value ?? 0;
}

function entropicLowerUtility(values: Array<{ value: number; weight: number }>, lambda: number) {
  const usable = values.filter((item) => Number.isFinite(item.value) && item.weight > 0);
  if (usable.length === 0) return 0;
  const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  const logs = usable.map((item) => Math.log(item.weight / totalWeight) - lambda * item.value);
  return -logSumExp(logs) / lambda;
}

function unweightedTailMean(values: Array<{ value: number }>, fraction: number) {
  const sorted = values.map((item) => item.value).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const count = clamp(Math.ceil(sorted.length * fraction), 1, sorted.length);
  return sorted.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
}

function diagonal(values: Vector4): Matrix4 {
  return values.map((value, row) => values.map((_, column) => row === column ? value : 0)) as Matrix4;
}

function multiplyDiagonalVector(diagonalValues: Vector4, vector: Vector4): Vector4 {
  return vector.map((value, index) => value * diagonalValues[index]) as Vector4;
}

function multiplyDiagonalBoth(diagonalValues: Vector4, matrix: Matrix4): Matrix4 {
  return matrix.map((row, rowIndex) => row.map((value, columnIndex) => value * diagonalValues[rowIndex] * diagonalValues[columnIndex])) as Matrix4;
}

function addMatrices(left: Matrix4, right: Matrix4): Matrix4 {
  return left.map((row, rowIndex) => row.map((value, columnIndex) => value + right[rowIndex][columnIndex])) as Matrix4;
}

function multiplyMatrixVector(matrix: Matrix4, vector: Vector4): Vector4 {
  return matrix.map((row) => dot(row, vector)) as Vector4;
}

function quadratic(vector: Vector4, matrix: Matrix4) {
  return dot(vector, multiplyMatrixVector(matrix, vector));
}

function josephUpdate(covariance: Matrix4, gain: Vector4, loading: Vector4, variance: number): Matrix4 {
  const identityMinusKh = covariance.map((_, row) => covariance.map((__, column) => (row === column ? 1 : 0) - gain[row] * loading[column])) as Matrix4;
  const left = multiplyMatrices(multiplyMatrices(identityMinusKh, covariance), transpose(identityMinusKh));
  const noise = gain.map((row) => gain.map((column) => row * column * variance)) as Matrix4;
  const updated = addMatrices(left, noise);
  return updated.map((row, rowIndex) => row.map((value, columnIndex) => {
    const symmetric = (value + updated[columnIndex][rowIndex]) / 2;
    return rowIndex === columnIndex ? Math.max(1e-6, symmetric) : symmetric;
  })) as Matrix4;
}

function multiplyMatrices(left: Matrix4, right: Matrix4): Matrix4 {
  return left.map((row) => right[0].map((_, column) => row.reduce((sum, value, index) => sum + value * right[index][column], 0))) as Matrix4;
}

function transpose(matrix: Matrix4): Matrix4 {
  return matrix[0].map((_, column) => matrix.map((row) => row[column])) as Matrix4;
}

function cloneMatrix(matrix: Matrix4): Matrix4 {
  return matrix.map((row) => [...row]) as Matrix4;
}

function dot(left: Vector4, right: Vector4) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function initialFilterDay(date: string, config: RhythmConfig): FilterDay {
  const covariance = diagonal([1.5, 1.5, 1.6, 1.7]);
  const variance = quadratic(globalLoading, covariance);
  const delta = 1.2816 * Math.sqrt(variance);
  return {
    date,
    mean: [0, 0, 0, 0],
    covariance,
    score: 50,
    lower: latentToScore(-delta, config.scoreTemperature),
    upper: latentToScore(delta, config.scoreTemperature),
    latent: 0,
    slowLatent: 0,
    factorRiskLatent: 0,
    acuteLatent: null,
    acuteBlend: 0,
    lowConsensus: 0,
    highConsensus: 0,
    trendPressure: 0,
    observation: null,
    evidenceCount: 0,
    robustWeights: [],
  };
}

function currentDayHealth(analysis: DayAnalysis) {
  const recovery = analysis.signals.find((item) => item.key === "recovery");
  return recovery?.evidence as Record<string, unknown> | undefined;
}

function sleepMidpoint(day: DailyRecord) {
  const start = parseClock(day.sleep?.sleep_start);
  const duration = validSleepDuration(day.sleep?.sleep_duration_minutes);
  if (start == null || duration == null) return null;
  return wrapMinutes(start + duration / 2);
}

function parseClock(value: unknown) {
  if (typeof value !== "string") return null;
  const iso = new Date(value);
  if (value.includes("T") && !Number.isNaN(iso.getTime())) return iso.getHours() * 60 + iso.getMinutes();
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function validSleepDuration(value: unknown) {
  return bounded(value, 60, 1200);
}

function validHeartRate(value: unknown) {
  return bounded(value, 30, 220);
}

function validRestingHeartRate(value: unknown) {
  return bounded(value, 30, 160);
}

function validHrv(value: unknown) {
  return bounded(value, 1, 400);
}

function bounded(value: unknown, minimum: number, maximum: number) {
  const parsed = optionalNumeric(value);
  if (parsed == null || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

function optionalNumeric(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace("%", "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSpo2(value: unknown) {
  const parsed = optionalNumeric(value);
  if (parsed == null) return null;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function circularMedian(values: number[], weights?: number[]) {
  if (values.length === 0) return 0;
  const candidates = values.map((value, index) => ({
    value,
    distance: values.reduce((sum, item, itemIndex) => sum + Math.abs(signedCircularDiff(item, value)) * (weights?.[itemIndex] ?? 1), 0),
    weight: weights?.[index] ?? 1,
  }));
  candidates.sort((a, b) => a.distance - b.distance || b.weight - a.weight);
  return candidates[0].value;
}

function circularMean(values: number[]) {
  const radians = values.map((minute) => minute / 1440 * Math.PI * 2);
  const x = radians.reduce((sum, value) => sum + Math.cos(value), 0) / radians.length;
  const y = radians.reduce((sum, value) => sum + Math.sin(value), 0) / radians.length;
  return wrapMinutes(Math.atan2(y, x) / (Math.PI * 2) * 1440);
}

function signedCircularDiff(left: number, right: number) {
  let difference = wrapMinutes(left) - wrapMinutes(right);
  if (difference > 720) difference -= 1440;
  if (difference < -720) difference += 1440;
  return difference;
}

function wrapMinutes(value: number) {
  return ((value % 1440) + 1440) % 1440;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function flag(code: string, severity: AnomalyFlag["severity"], message: string, value?: number | null, baseline?: number | null): AnomalyFlag {
  return { code, severity, message, ...(value == null ? {} : { value }), ...(baseline === undefined ? {} : { baseline }) };
}

function dedupeFlags(flags: AnomalyFlag[]) {
  const seen = new Set<string>();
  return flags.filter((item) => {
    if (seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  });
}

function hasAnySignal(day: DailyRecord) {
  return Boolean(day.mood || day.sleep || day.exercise || day.nutrition || day.health || day.focusMinutes > 0);
}

function emptyDay(date: string): DailyRecord {
  return { date, mood: null, sleep: null, exercise: null, nutrition: null, health: null, focusMinutes: 0, focusSessions: 0 };
}

function shiftDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function eachDate(start: string, end: string) {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = shiftDate(cursor, 1)) dates.push(cursor);
  return dates;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundNullable(value: number | null, digits: number) {
  return value == null ? null : round(value, digits);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
