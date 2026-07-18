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
  | "conflicting_signals";

export type SyntheticTrajectory = {
  id: string;
  scenario: SyntheticScenario;
  inputs: RhythmInputs;
  truthScore: number;
  truthLowState: boolean;
  truthFactors: [number, number, number, number];
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

export function generatePopulation(count: number, seed: number, scenarios: SyntheticScenario[] = allScenarios()) {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const scenario = scenarios[index % scenarios.length];
    return generateTrajectory(`synthetic-${seed}-${index}`, scenario, random.int(1, 2_147_483_646));
  });
}

export function generateTrajectory(id: string, scenario: SyntheticScenario, seed: number): SyntheticTrajectory {
  const random = seededRandom(seed);
  const totalDays = scenario === "cold_start" ? random.int(3, 7) : 43;
  const startDate = new Date(Date.UTC(2026, 5, 1));
  const chronotypeMinutes = random.normal(23 * 60 + 20, 75);
  const userSteps = clamp(random.logNormal(Math.log(7600), 0.28), 3500, 15000);
  const userHrv = clamp(random.logNormal(Math.log(48), 0.3), 18, 110);
  const userRhr = clamp(random.normal(64, 8), 42, 90);
  const userCalories = clamp(random.normal(1950, 260), 1400, 2800);
  const deviceBias = scenario === "sensor_bias" ? random.pick([0.62, 1.45]) : 1;
  const factors: Array<[number, number, number, number]> = [];
  let state: [number, number, number, number] = [random.normal(0.35, 0.65), random.normal(0.3, 0.65), random.normal(0.25, 0.7), random.normal(0.25, 0.75)];

  for (let day = 0; day < totalDays; day += 1) {
    const innovation: [number, number, number, number] = [random.normal(0, 0.28), random.normal(0, 0.34), random.normal(0, 0.38), random.normal(0, 0.44)];
    state = [
      0.94 * state[0] + innovation[0],
      0.88 * state[1] + innovation[1],
      0.84 * state[2] + innovation[2],
      0.78 * state[3] + innovation[3],
    ];
    if (scenario === "gradual_decline" && day >= totalDays - 14) {
      const decline = (day - (totalDays - 14) + 1) * 0.08;
      state = state.map((value, index) => value - decline * [0.8, 1, 0.7, 0.9][index]) as typeof state;
    }
    if (scenario === "abrupt_shift" && day >= totalDays - 5) state = state.map((value) => value - 1.15) as typeof state;
    if (scenario === "shift_worker" && Math.floor(day / 4) % 2 === 1) state[0] -= 0.85;
    factors.push(state.map((value) => clamp(value, -3.5, 3.5)) as typeof state);
  }

  const records = factors.map((factor, index) => {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + index);
    return buildDay(date.toISOString().slice(0, 10), factor, index, {
      random,
      scenario,
      chronotypeMinutes,
      userSteps,
      userHrv,
      userRhr,
      userCalories,
      deviceBias,
      totalDays,
    });
  });

  const truthFactors = factors.at(-1) ?? [0, 0, 0, 0];
  const truthLatent = dot(globalLoading, truthFactors);
  const truthScore = latentToScore(truthLatent);
  const today = records.at(-1) ?? emptyDay("2026-07-18");
  return {
    id,
    scenario,
    inputs: { date: today.date, today, history: records.slice(0, -1) },
    truthScore,
    truthLowState: truthScore < 38,
    truthFactors,
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
  return ["clean", "random_missing", "burst_missing", "outliers", "sensor_bias", "gradual_decline", "abrupt_shift", "shift_worker", "cold_start", "conflicting_signals"];
}

function buildDay(
  date: string,
  factors: [number, number, number, number],
  dayIndex: number,
  context: {
    random: Random;
    scenario: SyntheticScenario;
    chronotypeMinutes: number;
    userSteps: number;
    userHrv: number;
    userRhr: number;
    userCalories: number;
    deviceBias: number;
    totalDays: number;
  },
): DailyRecord {
  const { random, scenario } = context;
  const signal = Object.fromEntries(Object.entries(loadings).map(([key, loading]) => [key, dot(loading, factors) + random.studentT(5) * 0.34])) as Record<keyof typeof loadings, number>;
  let phaseShift = -signal.circadian * 55 + random.normal(0, 18);
  if (scenario === "shift_worker" && Math.floor(dayIndex / 4) % 2 === 1) phaseShift += 310;
  const sleepStart = wrapMinutes(context.chronotypeMinutes + phaseShift);
  const duration = clamp(445 + signal.sleep * 60 + random.normal(0, 28), 150, 680);
  const sleepEnd = wrapMinutes(sleepStart + duration);
  const deepRatio = clamp(0.17 + signal.recovery * 0.018 + random.normal(0, 0.018), 0.08, 0.28);
  const remRatio = clamp(0.21 + signal.sleep * 0.014 + random.normal(0, 0.018), 0.1, 0.32);
  let steps = clamp(context.userSteps * Math.exp(signal.activity * 0.42 + random.normal(0, 0.12)) * context.deviceBias, 100, 42000);
  const exerciseMinutes = clamp(34 + signal.activity * 16 + random.normal(0, 8), 0, 150);
  const activeCalories = clamp(360 + signal.activity * 100 + random.normal(0, 45), 30, 1500);
  const mood = clamp(58 + signal.mood * 15 + random.normal(0, 6), 5, 98);
  const focus = clamp(65 + signal.focus * 24 + random.normal(0, 12), 1, 360);
  const calorieDeviation = Math.abs(random.normal(0, 210)) + Math.max(0, -signal.nutrition) * 340;
  const calories = clamp(context.userCalories + random.pick([-1, 1]) * calorieDeviation, 600, 5000);
  let hrv = clamp(context.userHrv * Math.exp(signal.recovery * 0.16 + random.normal(0, 0.08)), 8, 220);
  let rhr = clamp(context.userRhr - signal.recovery * 3.5 + random.normal(0, 2), 36, 125);
  let activityBins = createActivityBins(date, steps, activeCalories, exerciseMinutes, sleepStart, signal.circadian, random);

  const missing = missingDomains(scenario, dayIndex, context.totalDays, random);
  if (scenario === "outliers" && random.next() < 0.12) {
    const target = random.pick(["steps", "hrv", "rhr", "sleep"] as const);
    if (target === "steps") steps = random.pick([40, 85000]);
    if (target === "hrv") hrv = random.pick([2, 360]);
    if (target === "rhr") rhr = random.pick([32, 155]);
    if (target === "sleep") activityBins = activityBins.map((item) => ({ ...item, steps: random.int(0, 2000) }));
  }
  if (scenario === "conflicting_signals" && dayIndex >= context.totalDays - 3) {
    steps = 18000;
    hrv = 18;
    rhr = 96;
  }

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
      self_rating: clamp(Math.round(3 + signal.sleep * 0.7), 1, 5),
    },
    exercise: missing.has("activity") ? null : {
      record_date: date,
      steps: Math.round(steps),
      exercise_minutes: Math.round(exerciseMinutes),
      calories: Math.round(activeCalories),
    },
    mood: missing.has("mood") ? null : { record_date: date, mood_score: Math.round(mood), diary_content: random.next() < 0.35 ? "synthetic diary" : null },
    nutrition: missing.has("nutrition") ? null : { record_date: date, total_calories: Math.round(calories), lunch_items: [{ name: "synthetic meal", calories: Math.round(calories * 0.35) }] },
    health: missing.has("health") ? null : {
      record_date: date,
      resting_heart_rate: round(rhr, 1),
      heart_rate_variability_sdnn: round(hrv, 1),
      activity_bins: missing.has("bins") ? [] : activityBins,
      sleep_stage_minutes: { deep: Math.round(duration * deepRatio), rem: Math.round(duration * remRatio), core: Math.round(duration * (1 - deepRatio - remRatio)), awake: Math.round(clamp(24 - signal.sleep * 4, 2, 70)) },
    },
    focusMinutes: missing.has("focus") ? 0 : Math.round(focus),
    focusSessions: missing.has("focus") ? 0 : Math.max(1, Math.round(focus / 30)),
  };
}

function createActivityBins(date: string, totalSteps: number, totalCalories: number, exerciseMinutes: number, sleepStart: number, circadian: number, random: Random) {
  const phaseHour = wrapMinutes(sleepStart + 12 * 60 - circadian * 15) / 60;
  const raw = Array.from({ length: 24 }, (_, hour) => {
    const distance = circularHourDistance(hour, phaseHour);
    const primary = Math.exp(-0.5 * (distance / 4.2) ** 2);
    const secondary = 0.35 * Math.exp(-0.5 * (circularHourDistance(hour, (phaseHour + 7) % 24) / 2.2) ** 2);
    const fragmentation = Math.max(0, -circadian) * random.next() * 0.32;
    return Math.max(0.001, primary + secondary + fragmentation + random.next() * 0.035);
  });
  const sum = raw.reduce((total, value) => total + value, 0);
  const exerciseHour = Math.round((phaseHour + 4) % 24);
  return raw.map((value, hour) => ({
    hour,
    start: `${date}T${String(hour).padStart(2, "0")}:00:00+08:00`,
    end: `${date}T${String((hour + 1) % 24).padStart(2, "0")}:00:00+08:00`,
    steps: Math.round(totalSteps * value / sum),
    activeEnergyKcal: round(totalCalories * value / sum, 2),
    exerciseMinutes: hour === exerciseHour ? round(exerciseMinutes, 1) : 0,
  }));
}

function missingDomains(scenario: SyntheticScenario, day: number, totalDays: number, random: Random) {
  const missing = new Set<string>();
  let probability = scenario === "random_missing" ? 0.42 : 0.06;
  if (scenario === "cold_start") probability = 0.28;
  for (const key of ["sleep", "activity", "mood", "nutrition", "health", "focus", "bins"]) if (random.next() < probability) missing.add(key);
  if (scenario === "burst_missing" && day >= totalDays - 7 && day <= totalDays - 3) {
    ["sleep", "mood", "nutrition", "health", "bins"].forEach((key) => missing.add(key));
  }
  return missing;
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
    logNormal: (mean: number, sd: number) => Math.exp(normal(mean, sd)),
    studentT: (degrees: number) => normal() / Math.sqrt((gamma(degrees / 2) * 2) / degrees),
  };
}

function latentToScore(value: number) {
  // A latent value of zero represents a physiologically ordinary day. The
  // broader temperature avoids declaring an extreme health state from a
  // synthetic latent variable that no consumer wearable directly observes.
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
