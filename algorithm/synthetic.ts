import type { DailyRecord, RhythmInputs } from "../supabase/functions/_shared/rhythm-core.ts";

export type SyntheticScenario =
  | "clean"
  | "random_missing"
  | "burst_missing"
  | "outliers"
  | "sensor_bias"
  | "gradual_decline"
  | "abrupt_shift"
  | "shift_worker"
  | "cold_start"
  | "conflicting_signals"
  | "jet_lag"
  | "illness_recovery"
  | "overtraining"
  | "weekend_rebound"
  | "travel_gap"
  | "low_adherence"
  | "high_adherence"
  | "seasonal_shift"
  | "chronic_debt_rebound"
  | "compensated_strain";

export type SyntheticCohort =
  | "consistent_sleeper"
  | "sedentary_office"
  | "active_athlete"
  | "shift_clinician"
  | "student_night_owl"
  | "new_parent"
  | "frequent_traveler"
  | "high_stress_founder"
  | "older_low_hrv"
  | "recovery_focused"
  | "manual_logger"
  | "low_adherence_user"
  | "weekend_social"
  | "metabolic_watch"
  | "outdoor_worker"
  | "remote_worker";

export type SyntheticTrajectory = {
  id: string;
  scenario: SyntheticScenario;
  cohort: SyntheticCohort;
  inputs: RhythmInputs;
  truthScore: number;
  truthLowState: boolean;
  truthFactors: [number, number, number, number];
  metadata: {
    profile: SyntheticProfile;
    observedDays: number;
    missingnessRate: number;
    dataDensity: "dense" | "mixed" | "sparse";
  };
};

type SyntheticProfile = {
  cohort: SyntheticCohort;
  chronotypeMinutes: number;
  sleepNeedMinutes: number;
  stepsMedian: number;
  hrvMedian: number;
  restingHeartRate: number;
  caloriesMean: number;
  adherence: number;
  manualLogging: number;
  sensorQuality: number;
  activityVariance: number;
  stressLoad: number;
  weekendShiftMinutes: number;
  shiftIntensity: number;
};

type Random = ReturnType<typeof seededRandom>;

const loadings = {
  sleep: [0.58, 0.32, 0.02, 0.08],
  activity: [0.08, 0.18, 0.7, 0.04],
  circadian: [0.82, 0.08, 0.08, 0.02],
  mood: [0.03, 0.12, 0.05, 0.8],
  nutrition: [0.05, 0.12, 0.72, 0.11],
  focus: [0.12, 0.03, 0.58, 0.27],
  recovery: [0.06, 0.82, 0.08, 0.04],
} as const;

const globalLoading = [0.3, 0.3, 0.22, 0.18] as const;

const scenarioWeights: Array<{ value: SyntheticScenario; weight: number }> = [
  { value: "clean", weight: 14 },
  { value: "random_missing", weight: 12 },
  { value: "burst_missing", weight: 7 },
  { value: "outliers", weight: 6 },
  { value: "sensor_bias", weight: 6 },
  { value: "gradual_decline", weight: 7 },
  { value: "abrupt_shift", weight: 5 },
  { value: "shift_worker", weight: 5 },
  { value: "cold_start", weight: 6 },
  { value: "conflicting_signals", weight: 5 },
  { value: "jet_lag", weight: 4 },
  { value: "illness_recovery", weight: 5 },
  { value: "overtraining", weight: 4 },
  { value: "weekend_rebound", weight: 6 },
  { value: "travel_gap", weight: 4 },
  { value: "low_adherence", weight: 5 },
  { value: "high_adherence", weight: 4 },
  { value: "seasonal_shift", weight: 5 },
  { value: "chronic_debt_rebound", weight: 4 },
  { value: "compensated_strain", weight: 4 },
];

const cohortDefinitions: Array<{ value: SyntheticCohort; weight: number; profile: Omit<SyntheticProfile, "cohort"> }> = [
  { value: "consistent_sleeper", weight: 10, profile: { chronotypeMinutes: 23 * 60, sleepNeedMinutes: 465, stepsMedian: 7800, hrvMedian: 52, restingHeartRate: 62, caloriesMean: 1950, adherence: 0.92, manualLogging: 0.48, sensorQuality: 0.94, activityVariance: 0.72, stressLoad: 0.2, weekendShiftMinutes: 28, shiftIntensity: 0 } },
  { value: "sedentary_office", weight: 13, profile: { chronotypeMinutes: 23 * 60 + 35, sleepNeedMinutes: 445, stepsMedian: 4600, hrvMedian: 41, restingHeartRate: 69, caloriesMean: 2050, adherence: 0.78, manualLogging: 0.32, sensorQuality: 0.88, activityVariance: 0.85, stressLoad: 0.52, weekendShiftMinutes: 55, shiftIntensity: 0 } },
  { value: "active_athlete", weight: 6, profile: { chronotypeMinutes: 22 * 60 + 25, sleepNeedMinutes: 500, stepsMedian: 13500, hrvMedian: 78, restingHeartRate: 51, caloriesMean: 2550, adherence: 0.9, manualLogging: 0.42, sensorQuality: 0.9, activityVariance: 1.45, stressLoad: 0.28, weekendShiftMinutes: 20, shiftIntensity: 0 } },
  { value: "shift_clinician", weight: 5, profile: { chronotypeMinutes: 22 * 60 + 50, sleepNeedMinutes: 455, stepsMedian: 9300, hrvMedian: 44, restingHeartRate: 67, caloriesMean: 2100, adherence: 0.82, manualLogging: 0.27, sensorQuality: 0.86, activityVariance: 1.08, stressLoad: 0.74, weekendShiftMinutes: 95, shiftIntensity: 1 } },
  { value: "student_night_owl", weight: 8, profile: { chronotypeMinutes: 1 * 60 + 15, sleepNeedMinutes: 470, stepsMedian: 6400, hrvMedian: 57, restingHeartRate: 64, caloriesMean: 2050, adherence: 0.63, manualLogging: 0.36, sensorQuality: 0.82, activityVariance: 1.12, stressLoad: 0.55, weekendShiftMinutes: 105, shiftIntensity: 0.25 } },
  { value: "new_parent", weight: 5, profile: { chronotypeMinutes: 23 * 60 + 20, sleepNeedMinutes: 480, stepsMedian: 6800, hrvMedian: 35, restingHeartRate: 71, caloriesMean: 2150, adherence: 0.68, manualLogging: 0.3, sensorQuality: 0.86, activityVariance: 1.2, stressLoad: 0.82, weekendShiftMinutes: 35, shiftIntensity: 0.15 } },
  { value: "frequent_traveler", weight: 5, profile: { chronotypeMinutes: 23 * 60 + 10, sleepNeedMinutes: 450, stepsMedian: 8500, hrvMedian: 46, restingHeartRate: 66, caloriesMean: 2200, adherence: 0.72, manualLogging: 0.28, sensorQuality: 0.78, activityVariance: 1.35, stressLoad: 0.58, weekendShiftMinutes: 75, shiftIntensity: 0.45 } },
  { value: "high_stress_founder", weight: 7, profile: { chronotypeMinutes: 0 * 60 + 15, sleepNeedMinutes: 440, stepsMedian: 5200, hrvMedian: 34, restingHeartRate: 73, caloriesMean: 2150, adherence: 0.7, manualLogging: 0.38, sensorQuality: 0.84, activityVariance: 1.05, stressLoad: 0.88, weekendShiftMinutes: 85, shiftIntensity: 0.1 } },
  { value: "older_low_hrv", weight: 6, profile: { chronotypeMinutes: 22 * 60 + 15, sleepNeedMinutes: 430, stepsMedian: 5200, hrvMedian: 26, restingHeartRate: 70, caloriesMean: 1750, adherence: 0.84, manualLogging: 0.25, sensorQuality: 0.82, activityVariance: 0.7, stressLoad: 0.38, weekendShiftMinutes: 25, shiftIntensity: 0 } },
  { value: "recovery_focused", weight: 5, profile: { chronotypeMinutes: 22 * 60 + 40, sleepNeedMinutes: 500, stepsMedian: 9000, hrvMedian: 66, restingHeartRate: 56, caloriesMean: 2100, adherence: 0.94, manualLogging: 0.58, sensorQuality: 0.93, activityVariance: 0.78, stressLoad: 0.18, weekendShiftMinutes: 18, shiftIntensity: 0 } },
  { value: "manual_logger", weight: 5, profile: { chronotypeMinutes: 23 * 60 + 5, sleepNeedMinutes: 455, stepsMedian: 7000, hrvMedian: 48, restingHeartRate: 63, caloriesMean: 1900, adherence: 0.88, manualLogging: 0.86, sensorQuality: 0.82, activityVariance: 0.88, stressLoad: 0.35, weekendShiftMinutes: 45, shiftIntensity: 0 } },
  { value: "low_adherence_user", weight: 7, profile: { chronotypeMinutes: 0 * 60 + 5, sleepNeedMinutes: 445, stepsMedian: 6000, hrvMedian: 42, restingHeartRate: 68, caloriesMean: 2050, adherence: 0.38, manualLogging: 0.12, sensorQuality: 0.58, activityVariance: 1.05, stressLoad: 0.62, weekendShiftMinutes: 90, shiftIntensity: 0.2 } },
  { value: "weekend_social", weight: 6, profile: { chronotypeMinutes: 23 * 60 + 45, sleepNeedMinutes: 455, stepsMedian: 8200, hrvMedian: 50, restingHeartRate: 64, caloriesMean: 2250, adherence: 0.76, manualLogging: 0.3, sensorQuality: 0.84, activityVariance: 1.25, stressLoad: 0.42, weekendShiftMinutes: 150, shiftIntensity: 0.05 } },
  { value: "metabolic_watch", weight: 4, profile: { chronotypeMinutes: 23 * 60, sleepNeedMinutes: 450, stepsMedian: 5600, hrvMedian: 38, restingHeartRate: 72, caloriesMean: 2450, adherence: 0.82, manualLogging: 0.55, sensorQuality: 0.88, activityVariance: 0.92, stressLoad: 0.46, weekendShiftMinutes: 60, shiftIntensity: 0 } },
  { value: "outdoor_worker", weight: 4, profile: { chronotypeMinutes: 21 * 60 + 45, sleepNeedMinutes: 445, stepsMedian: 12500, hrvMedian: 45, restingHeartRate: 63, caloriesMean: 2600, adherence: 0.8, manualLogging: 0.18, sensorQuality: 0.74, activityVariance: 1.5, stressLoad: 0.36, weekendShiftMinutes: 30, shiftIntensity: 0.1 } },
  { value: "remote_worker", weight: 9, profile: { chronotypeMinutes: 23 * 60 + 50, sleepNeedMinutes: 455, stepsMedian: 5200, hrvMedian: 47, restingHeartRate: 66, caloriesMean: 1980, adherence: 0.76, manualLogging: 0.36, sensorQuality: 0.9, activityVariance: 0.8, stressLoad: 0.5, weekendShiftMinutes: 70, shiftIntensity: 0 } },
];

export function generatePopulation(count: number, seed: number, scenarios: SyntheticScenario[] = allScenarios()) {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const profile = sampleProfile(random);
    const scenario = sampleScenario(random, scenarios, profile);
    return generateTrajectory(`synthetic-${seed}-${index}`, scenario, random.int(1, 2_147_483_646), profile);
  });
}

export function generateScenarioGrid(perScenario: number, seed: number) {
  const random = seededRandom(seed);
  const trajectories: SyntheticTrajectory[] = [];
  for (const scenario of allScenarios()) {
    for (let index = 0; index < perScenario; index += 1) {
      const profile = sampleProfile(random);
      trajectories.push(generateTrajectory(`grid-${seed}-${scenario}-${index}`, scenario, random.int(1, 2_147_483_646), profile));
    }
  }
  return trajectories;
}

export function generateTrajectory(id: string, scenario: SyntheticScenario, seed: number, suppliedProfile?: SyntheticProfile): SyntheticTrajectory {
  const random = seededRandom(seed);
  const profile = suppliedProfile ?? sampleProfile(random);
  const totalDays = scenario === "cold_start" ? random.int(3, 7) : random.int(43, 70);
  const startDate = new Date(Date.UTC(2026, 3, random.int(1, 18)));
  const deviceBias = scenario === "sensor_bias" ? random.pick([0.58, 0.68, 1.32, 1.48]) : 1;
  const factors: Array<[number, number, number, number]> = [];
  let state: [number, number, number, number] = [
    random.normal(0.28 - profile.shiftIntensity * 0.25, 0.62),
    random.normal(0.24 - profile.stressLoad * 0.24, 0.62),
    random.normal(0.2, 0.68),
    random.normal(0.24 - profile.stressLoad * 0.28, 0.72),
  ];

  for (let day = 0; day < totalDays; day += 1) {
    const weekday = (startDate.getUTCDay() + day) % 7;
    const weekend = weekday === 0 || weekday === 6;
    const seasonal = Math.sin(2 * Math.PI * day / 58);
    const innovation: [number, number, number, number] = [
      random.studentT(7) * 0.22,
      random.studentT(6) * 0.27,
      random.studentT(6) * 0.33,
      random.studentT(5) * 0.38,
    ];
    state = [
      0.94 * state[0] + innovation[0] + (weekend ? -profile.weekendShiftMinutes / 420 : 0) + seasonal * 0.04,
      0.88 * state[1] + innovation[1] - profile.stressLoad * 0.05,
      0.84 * state[2] + innovation[2] + (weekend ? 0.06 : -0.02),
      0.78 * state[3] + innovation[3] - profile.stressLoad * (weekend ? 0.01 : 0.07),
    ];
    state = applyScenarioState(state, scenario, day, totalDays, profile, random);
    factors.push(state.map((value) => clamp(value, -3.7, 3.7)) as typeof state);
  }

  const records = factors.map((factor, index) => {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + index);
    return buildDay(date.toISOString().slice(0, 10), factor, index, {
      random,
      scenario,
      profile,
      deviceBias,
      totalDays,
      startWeekday: startDate.getUTCDay(),
    });
  });

  const truthFactors = factors.at(-1) ?? [0, 0, 0, 0];
  const truthScore = latentToScore(dot(globalLoading, truthFactors));
  const today = records.at(-1) ?? emptyDay("2026-07-18");
  const observedDays = records.filter(hasAnySignal).length;
  const missingnessRate = records.reduce((sum, day) => sum + domainMissingRate(day), 0) / Math.max(1, records.length);
  return {
    id,
    scenario,
    cohort: profile.cohort,
    inputs: { date: today.date, today, history: records.slice(0, -1) },
    truthScore,
    truthLowState: truthScore < 38,
    truthFactors,
    metadata: {
      profile,
      observedDays,
      missingnessRate: round(missingnessRate, 3),
      dataDensity: missingnessRate < 0.24 ? "dense" : missingnessRate > 0.5 ? "sparse" : "mixed",
    },
  };
}

export function legacyFusionProxy(inputs: RhythmInputs) {
  const day = inputs.today;
  const values: Array<{ value: number; weight: number }> = [];
  const duration = numeric(day.sleep?.sleep_duration_minutes);
  if (duration > 0) values.push({ value: clamp(100 - Math.abs(duration - 450) / 3, 20, 100), weight: 0.28 });
  const steps = numeric(day.exercise?.steps);
  if (steps > 0) values.push({ value: clamp(steps / 8000 * 100, 0, 100), weight: 0.18 });
  const mood = numeric(day.mood?.mood_score);
  if (mood > 0) values.push({ value: clamp(mood, 0, 100), weight: 0.14 });
  const calories = numeric(day.nutrition?.total_calories);
  if (calories > 0) values.push({ value: clamp(100 - Math.abs(calories - 1900) / 18, 20, 100), weight: 0.12 });
  if (day.focusMinutes > 0) values.push({ value: clamp(day.focusMinutes / 90 * 100, 0, 100), weight: 0.12 });
  const hrv = numeric(day.health?.heart_rate_variability_sdnn);
  const rhr = numeric(day.health?.resting_heart_rate);
  if (hrv > 0 || rhr > 0) values.push({ value: clamp(55 + (hrv - 45) * 0.8 - (rhr - 65) * 1.8, 15, 100), weight: 0.16 });
  if (values.length === 0) return 50;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / values.reduce((sum, item) => sum + item.weight, 0);
}

export function allScenarios(): SyntheticScenario[] {
  return scenarioWeights.map((item) => item.value);
}

export function allCohorts(): SyntheticCohort[] {
  return cohortDefinitions.map((item) => item.value);
}

function sampleProfile(random: Random): SyntheticProfile {
  const definition = random.weighted(cohortDefinitions);
  const profile = definition.profile;
  return {
    cohort: definition.value,
    chronotypeMinutes: wrapMinutes(random.normal(profile.chronotypeMinutes, 42 + profile.weekendShiftMinutes * 0.08)),
    sleepNeedMinutes: clamp(random.normal(profile.sleepNeedMinutes, 28), 330, 580),
    stepsMedian: clamp(random.logNormal(Math.log(profile.stepsMedian), 0.2 + profile.activityVariance * 0.04), 1500, 22000),
    hrvMedian: clamp(random.logNormal(Math.log(profile.hrvMedian), 0.22), 8, 160),
    restingHeartRate: clamp(random.normal(profile.restingHeartRate, 4.5), 42, 95),
    caloriesMean: clamp(random.normal(profile.caloriesMean, 180), 1200, 3600),
    adherence: clamp(random.normal(profile.adherence, 0.07), 0.08, 0.98),
    manualLogging: clamp(random.normal(profile.manualLogging, 0.09), 0.03, 0.96),
    sensorQuality: clamp(random.normal(profile.sensorQuality, 0.08), 0.18, 0.99),
    activityVariance: clamp(random.normal(profile.activityVariance, 0.12), 0.45, 1.8),
    stressLoad: clamp(random.normal(profile.stressLoad, 0.12), 0, 1),
    weekendShiftMinutes: clamp(random.normal(profile.weekendShiftMinutes, 25), 0, 220),
    shiftIntensity: clamp(random.normal(profile.shiftIntensity, 0.12), 0, 1),
  };
}

function sampleScenario(random: Random, allowed: SyntheticScenario[], profile: SyntheticProfile) {
  const adjusted = scenarioWeights
    .filter((item) => allowed.includes(item.value))
    .map((item) => {
      let weight = item.weight;
      if (profile.cohort === "shift_clinician" && item.value === "shift_worker") weight *= 5;
      if (profile.cohort === "frequent_traveler" && (item.value === "jet_lag" || item.value === "travel_gap")) weight *= 4;
      if (profile.cohort === "active_athlete" && item.value === "overtraining") weight *= 3.5;
      if (profile.cohort === "low_adherence_user" && item.value === "low_adherence") weight *= 4;
      if (profile.cohort === "weekend_social" && item.value === "weekend_rebound") weight *= 3.5;
      if (profile.adherence > 0.88 && item.value === "high_adherence") weight *= 2.4;
      return { ...item, weight };
    });
  return random.weighted(adjusted).value;
}

function applyScenarioState(
  state: [number, number, number, number],
  scenario: SyntheticScenario,
  day: number,
  totalDays: number,
  profile: SyntheticProfile,
  random: Random,
): [number, number, number, number] {
  const result = [...state] as [number, number, number, number];
  if (scenario === "gradual_decline" && day >= totalDays - 18) {
    const decline = (day - (totalDays - 18) + 1) * 0.055;
    return result.map((value, index) => value - decline * [0.75, 1, 0.62, 0.85][index]) as typeof result;
  }
  if (scenario === "chronic_debt_rebound" && day >= totalDays - 20) {
    const decline = (day - (totalDays - 20) + 1) * 0.048;
    result[0] -= decline * 0.7;
    result[1] -= decline * 1.05;
    result[2] -= decline * 0.38;
    result[3] -= decline * 0.64;
    if (day >= totalDays - 5) {
      const rebound = (day - (totalDays - 5) + 1) * 0.16;
      result[0] += 0.18 + rebound * 0.18;
      result[2] += 0.58 + rebound * 0.5;
      result[3] += 0.36 + rebound * 0.28;
      result[1] += 0.1 + rebound * 0.08;
    }
  }
  if (scenario === "abrupt_shift" && day >= totalDays - 6) return result.map((value) => value - 1.05) as typeof result;
  if (scenario === "shift_worker" && (Math.floor(day / 4) % 2 === 1 || profile.shiftIntensity > 0.72)) result[0] -= 0.72 + profile.shiftIntensity * 0.34;
  if (scenario === "jet_lag" && day >= totalDays - 8 && day <= totalDays - 3) {
    result[0] -= 0.9;
    result[1] -= 0.45;
    result[3] -= 0.35;
  }
  if (scenario === "illness_recovery" && day >= totalDays - 11 && day <= totalDays - 5) {
    result[1] -= 1.25;
    result[2] -= 0.7;
    result[3] -= 0.55;
  }
  if (scenario === "overtraining" && day >= totalDays - 10) {
    result[2] += 0.5 + random.next() * 0.4;
    result[1] -= 0.95;
    result[3] -= 0.35;
  }
  if (scenario === "compensated_strain" && day >= totalDays - 6) {
    const pressure = 0.72 + random.next() * 0.28;
    result[2] += 1.05 + pressure * 0.28;
    result[3] += 0.34 + pressure * 0.18;
    result[1] -= 0.68 + pressure * 0.28;
    result[0] -= 0.22 + pressure * 0.16;
  }
  if (scenario === "weekend_rebound" && day >= totalDays - 3) {
    result[0] -= 0.65;
    result[2] += 0.25;
  }
  if (scenario === "seasonal_shift" && day > totalDays / 2) result[0] -= (day - totalDays / 2) / totalDays * 0.85;
  if (scenario === "conflicting_signals" && day >= totalDays - 3) {
    result[2] += 1.05;
    result[1] -= 1.05;
  }
  return result;
}

function buildDay(
  date: string,
  factors: [number, number, number, number],
  dayIndex: number,
  context: {
    random: Random;
    scenario: SyntheticScenario;
    profile: SyntheticProfile;
    deviceBias: number;
    totalDays: number;
    startWeekday: number;
  },
): DailyRecord {
  const { random, scenario, profile } = context;
  const weekday = (context.startWeekday + dayIndex) % 7;
  const weekend = weekday === 0 || weekday === 6;
  const signal = Object.fromEntries(Object.entries(loadings).map(([key, loading]) => [key, dot(loading, factors) + random.studentT(5) * 0.32])) as Record<keyof typeof loadings, number>;
  let phaseShift = -signal.circadian * 55 + random.normal(0, 18 + profile.weekendShiftMinutes * 0.08);
  if (weekend) phaseShift += profile.weekendShiftMinutes;
  if (scenario === "shift_worker" && Math.floor(dayIndex / 4) % 2 === 1) phaseShift += 300 + profile.shiftIntensity * 90;
  if (scenario === "jet_lag" && dayIndex >= context.totalDays - 8 && dayIndex <= context.totalDays - 3) phaseShift += random.pick([-1, 1]) * random.normal(260, 55);
  if (scenario === "weekend_rebound" && weekend) phaseShift += 120;

  const sleepStart = wrapMinutes(profile.chronotypeMinutes + phaseShift);
  const sleepDebt = Math.max(0, -signal.recovery) * 35 + profile.stressLoad * 18;
  const duration = clamp(profile.sleepNeedMinutes + signal.sleep * 58 - sleepDebt + random.normal(0, 28 + profile.stressLoad * 18), 120, 720);
  const sleepEnd = wrapMinutes(sleepStart + duration);
  const deepRatio = clamp(0.17 + signal.recovery * 0.018 - profile.stressLoad * 0.015 + random.normal(0, 0.018), 0.06, 0.31);
  const remRatio = clamp(0.21 + signal.sleep * 0.014 + random.normal(0, 0.018), 0.08, 0.34);
  let steps = clamp(profile.stepsMedian * Math.exp(signal.activity * 0.42 + random.normal(0, 0.13 * profile.activityVariance)) * context.deviceBias, 50, 52000);
  let exerciseMinutes = clamp(32 + signal.activity * 17 + random.normal(0, 8 * profile.activityVariance), 0, 220);
  let activeCalories = clamp(profile.caloriesMean * 0.2 + signal.activity * 105 + random.normal(0, 50 * profile.activityVariance), 20, 1800);
  let mood = clamp(58 + signal.mood * 15 - profile.stressLoad * 9 + random.normal(0, 6), 3, 99);
  let focus = clamp(55 + signal.focus * 28 + random.normal(0, 18), 0, 420);
  const calorieDeviation = Math.abs(random.normal(0, 230)) + Math.max(0, -signal.nutrition) * 380;
  const calories = clamp(profile.caloriesMean + random.pick([-1, 1]) * calorieDeviation + (weekend ? 180 : 0), 450, 5800);
  let hrv = clamp(profile.hrvMedian * Math.exp(signal.recovery * 0.16 + random.normal(0, 0.08)), 4, 240);
  let rhr = clamp(profile.restingHeartRate - signal.recovery * 3.5 + profile.stressLoad * 2 + random.normal(0, 2.2), 34, 135);
  let activityBins = createActivityBins(date, steps, activeCalories, exerciseMinutes, sleepStart, signal.circadian, profile, random);

  if (scenario === "outliers" && random.next() < 0.12) {
    const target = random.pick(["steps", "hrv", "rhr", "sleep", "bins"] as const);
    if (target === "steps") steps = random.pick([25, 92000]);
    if (target === "hrv") hrv = random.pick([2, 360]);
    if (target === "rhr") rhr = random.pick([31, 155]);
    if (target === "sleep") activityBins = activityBins.map((item) => ({ ...item, steps: random.int(0, 2600) }));
    if (target === "bins") activityBins = activityBins.map((item) => ({ ...item, activeEnergyKcal: random.next() < 0.2 ? 0 : item.activeEnergyKcal }));
  }
  if (scenario === "conflicting_signals" && dayIndex >= context.totalDays - 3) {
    steps = clamp(profile.stepsMedian * 2.5, 12000, 30000);
    exerciseMinutes = clamp(exerciseMinutes + 85, 90, 220);
    activeCalories = clamp(activeCalories + 620, 700, 1800);
    hrv = clamp(profile.hrvMedian * 0.42, 5, 38);
    rhr = clamp(profile.restingHeartRate + 24, 82, 125);
  }
  if (scenario === "overtraining" && dayIndex >= context.totalDays - 5) {
    steps = clamp(profile.stepsMedian * 1.9, 10000, 36000);
    exerciseMinutes = clamp(exerciseMinutes + 65, 80, 220);
    hrv = clamp(hrv * 0.62, 6, 90);
    rhr = clamp(rhr + 10, 55, 125);
  }
  if (scenario === "chronic_debt_rebound" && dayIndex >= context.totalDays - 5) {
    steps = clamp(profile.stepsMedian * 1.18 + random.normal(0, 800), 5600, 22000);
    exerciseMinutes = clamp(exerciseMinutes + 24, 24, 130);
    activeCalories = clamp(activeCalories + 180, 240, 1300);
    mood = clamp(mood + 9, 12, 99);
    focus = clamp(focus + 46, 25, 420);
    hrv = clamp(hrv * 0.78, 5, 90);
    rhr = clamp(rhr + 6, 45, 128);
  }
  if (scenario === "compensated_strain" && dayIndex >= context.totalDays - 5) {
    steps = clamp(profile.stepsMedian * 2.05, 11000, 38000);
    exerciseMinutes = clamp(exerciseMinutes + 82, 92, 220);
    activeCalories = clamp(activeCalories + 680, 740, 1800);
    mood = clamp(mood + 6, 10, 99);
    focus = clamp(focus + 92, 90, 420);
    hrv = clamp(hrv * 0.58, 5, 82);
    rhr = clamp(rhr + 12, 56, 130);
  }

  const missing = missingDomains(scenario, dayIndex, context.totalDays, profile, random);
  return {
    date,
    sleep: missing.has("sleep") ? null : {
      record_date: date,
      sleep_start: clock(sleepStart),
      sleep_end: clock(sleepEnd),
      sleep_duration_minutes: Math.round(duration),
      deep_sleep_minutes: Math.round(duration * deepRatio),
      light_sleep_minutes: Math.round(duration * Math.max(0, 1 - deepRatio - remRatio)),
      rem_minutes: Math.round(duration * remRatio),
      self_rating: clamp(Math.round(3 + signal.sleep * 0.7 - profile.stressLoad * 0.35), 1, 5),
    },
    exercise: missing.has("activity") ? null : {
      record_date: date,
      steps: Math.round(steps),
      exercise_minutes: Math.round(exerciseMinutes),
      calories: Math.round(activeCalories),
    },
    mood: missing.has("mood") ? null : { record_date: date, mood_score: Math.round(mood), diary_content: random.next() < 0.42 ? "synthetic diary" : null },
    nutrition: missing.has("nutrition") ? null : { record_date: date, total_calories: Math.round(calories), lunch_items: [{ name: "synthetic meal", calories: Math.round(calories * 0.35) }] },
    health: missing.has("health") ? null : {
      record_date: date,
      resting_heart_rate: round(rhr, 1),
      heart_rate_variability_sdnn: round(hrv, 1),
      activity_bins: missing.has("bins") ? [] : activityBins,
      sleep_stage_minutes: { deep: Math.round(duration * deepRatio), rem: Math.round(duration * remRatio), core: Math.round(duration * (1 - deepRatio - remRatio)), awake: Math.round(clamp(22 - signal.sleep * 4 + profile.stressLoad * 6, 2, 82)) },
    },
    focusMinutes: missing.has("focus") ? 0 : Math.round(focus),
    focusSessions: missing.has("focus") ? 0 : Math.max(1, Math.round(focus / 30)),
  };
}

function createActivityBins(date: string, totalSteps: number, totalCalories: number, exerciseMinutes: number, sleepStart: number, circadian: number, profile: SyntheticProfile, random: Random) {
  const phaseHour = wrapMinutes(sleepStart + 12 * 60 - circadian * 15) / 60;
  const raw = Array.from({ length: 24 }, (_, hour) => {
    const distance = circularHourDistance(hour, phaseHour);
    const primary = Math.exp(-0.5 * (distance / (4 + profile.activityVariance * 0.45)) ** 2);
    const commute = profile.cohort === "sedentary_office" || profile.cohort === "remote_worker"
      ? 0.16 * Math.exp(-0.5 * (circularHourDistance(hour, 8.5) / 1.2) ** 2) + 0.16 * Math.exp(-0.5 * (circularHourDistance(hour, 18.5) / 1.3) ** 2)
      : 0;
    const secondary = 0.32 * Math.exp(-0.5 * (circularHourDistance(hour, (phaseHour + 7) % 24) / 2.2) ** 2);
    const fragmentation = Math.max(0, -circadian) * random.next() * 0.34 + profile.stressLoad * random.next() * 0.05;
    return Math.max(0.001, primary + secondary + commute + fragmentation + random.next() * 0.035);
  });
  const sum = raw.reduce((total, value) => total + value, 0);
  const exerciseHour = Math.round((phaseHour + random.pick([3, 4, 5])) % 24);
  return raw.map((value, hour) => ({
    hour,
    start: `${date}T${String(hour).padStart(2, "0")}:00:00+08:00`,
    end: `${date}T${String((hour + 1) % 24).padStart(2, "0")}:00:00+08:00`,
    steps: Math.round(totalSteps * value / sum),
    activeEnergyKcal: round(totalCalories * value / sum, 2),
    exerciseMinutes: hour === exerciseHour ? round(exerciseMinutes, 1) : 0,
  }));
}

function missingDomains(scenario: SyntheticScenario, day: number, totalDays: number, profile: SyntheticProfile, random: Random) {
  const missing = new Set<string>();
  const sensorDrop = (1 - profile.sensorQuality) * 0.34 + (scenario === "random_missing" ? 0.18 : 0) + (scenario === "low_adherence" ? 0.16 : 0);
  const manualDrop = (1 - profile.manualLogging) * 0.5 + (scenario === "random_missing" ? 0.2 : 0) + (scenario === "low_adherence" ? 0.25 : 0);
  const probabilities: Record<string, number> = {
    sleep: 0.05 + (1 - profile.adherence) * 0.1 + sensorDrop * 0.2,
    activity: 0.03 + sensorDrop * 0.45,
    health: 0.07 + sensorDrop * 0.65,
    bins: 0.08 + sensorDrop * 0.85,
    mood: 0.34 + manualDrop * 0.72,
    nutrition: 0.44 + manualDrop * 0.8,
    focus: 0.28 + manualDrop * 0.48,
  };
  if (scenario === "high_adherence") {
    Object.keys(probabilities).forEach((key) => probabilities[key] *= 0.32);
  }
  for (const [key, probability] of Object.entries(probabilities)) if (random.next() < clamp(probability, 0, 0.95)) missing.add(key);
  if (scenario === "burst_missing" && day >= totalDays - 8 && day <= totalDays - 3) {
    ["sleep", "mood", "nutrition", "health", "bins"].forEach((key) => missing.add(key));
  }
  if (scenario === "travel_gap" && day >= totalDays - 10 && day <= totalDays - 6) {
    ["activity", "health", "bins", "nutrition"].forEach((key) => missing.add(key));
  }
  if ((scenario === "conflicting_signals" || scenario === "overtraining" || scenario === "compensated_strain") && day >= totalDays - 4) {
    ["activity", "health", "bins"].forEach((key) => missing.delete(key));
  }
  if ((scenario === "gradual_decline" || scenario === "chronic_debt_rebound") && day >= totalDays - 5) {
    ["sleep", "activity", "health"].forEach((key) => missing.delete(key));
  }
  if (scenario === "cold_start" && random.next() < 0.38) ["mood", "nutrition", "focus"].forEach((key) => missing.add(key));
  return missing;
}

function domainMissingRate(day: DailyRecord) {
  const present = [
    day.sleep != null,
    day.exercise != null,
    day.health != null,
    day.mood != null,
    day.nutrition != null,
    day.focusMinutes > 0,
  ].filter(Boolean).length;
  return 1 - present / 6;
}

function hasAnySignal(day: DailyRecord) {
  return day.sleep != null || day.exercise != null || day.mood != null || day.nutrition != null || day.health != null || day.focusMinutes > 0;
}

function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  let spare: number | null = null;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const normal = (mean = 0, sd = 1) => {
    if (spare != null) {
      const value = spare;
      spare = null;
      return mean + value * sd;
    }
    const u = Math.max(1e-12, next());
    const v = next();
    const radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return mean + radius * Math.cos(2 * Math.PI * v) * sd;
  };
  const gamma = (shape: number): number => {
    if (shape < 1) return gamma(shape + 1) * next() ** (1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
      const x = normal();
      const v = (1 + c * x) ** 3;
      if (v <= 0) continue;
      const u = next();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x ** 2 + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  return {
    next,
    normal,
    int: (minimum: number, maximum: number) => Math.floor(next() * (maximum - minimum + 1)) + minimum,
    pick: <T>(values: readonly T[]) => values[Math.floor(next() * values.length)],
    weighted: <T>(items: readonly { value: T; weight: number }[]) => {
      const total = items.reduce((sum, item) => sum + item.weight, 0);
      let cursor = next() * total;
      for (const item of items) {
        cursor -= item.weight;
        if (cursor <= 0) return item;
      }
      return items[items.length - 1];
    },
    logNormal: (mean: number, sd: number) => Math.exp(normal(mean, sd)),
    studentT: (degrees: number) => normal() / Math.sqrt((gamma(degrees / 2) * 2) / degrees),
  };
}

function latentToScore(value: number) {
  return 100 / (1 + Math.exp(-(value + 1.25) / 1.55));
}

function dot(left: readonly number[], right: readonly number[]) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function circularHourDistance(left: number, right: number) {
  const difference = Math.abs(left - right) % 24;
  return Math.min(difference, 24 - difference);
}

function wrapMinutes(value: number) {
  return ((value % 1440) + 1440) % 1440;
}

function clock(value: number) {
  const minutes = Math.round(wrapMinutes(value));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyDay(date: string): DailyRecord {
  return { date, mood: null, sleep: null, exercise: null, nutrition: null, health: null, focusMinutes: 0, focusSessions: 0 };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
