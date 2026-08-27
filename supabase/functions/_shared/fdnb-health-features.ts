import type { FdnbFeatureValue, FdnbHealthObservation, FdnbModule } from "./fdnb-health-core.ts";

export type FdnbSourceRecords = Record<string, unknown>;

type Row = Record<string, unknown>;

export function buildFdnbHealthObservations(
  records: FdnbSourceRecords,
  startDate: string,
  endDate: string,
) {
  const byTable = Object.fromEntries(Object.entries(records).map(([table, value]) => [table, rows(value)]));
  const observations: FdnbHealthObservation[] = [];
  for (const date of dateRange(startDate, endDate)) {
    const features: Record<string, FdnbFeatureValue> = {};
    const mood = latestForDate(byTable.mood_records, date);
    const sleep = latestForDate(byTable.sleep_records, date);
    const exercise = latestForDate(byTable.exercise_records, date);
    const nutrition = latestForDate(byTable.nutrition_records, date);
    const face = latestForDate(byTable.face_records, date);
    const healthRows = forDate(byTable.health_metric_snapshots, date);
    const focusRows = forDate(byTable.focus_records, date);
    const focusDistribution = latestForDate(byTable.focus_time_distribution, date);

    add(features, "mood.score", number(mood?.mood_score), "mood", 0.72, "manual");
    add(features, "mood.sentiment", number(mood?.diary_sentiment), "mood", 0.45, "text-derived");
    if (mood) add(features, "mood.factor_count", array(mood.factors).length, "mood", 0.55, "manual");

    const sleepDuration = number(sleep?.sleep_duration_minutes);
    add(features, "sleep.duration_minutes", sleepDuration, "sleep", sourceReliability(sleep?.device_type, 0.78), text(sleep?.device_type));
    const sleepStart = clockMinutes(text(sleep?.sleep_start));
    const sleepEnd = clockMinutes(text(sleep?.sleep_end));
    add(features, "sleep.midpoint_minutes", sleepMidpoint(sleepStart, sleepEnd), "sleep", sourceReliability(sleep?.device_type, 0.72), text(sleep?.device_type));
    add(features, "sleep.deep_ratio", ratio(number(sleep?.deep_sleep_minutes), sleepDuration), "sleep", sourceReliability(sleep?.device_type, 0.62), text(sleep?.device_type));
    add(features, "sleep.rem_ratio", ratio(number(sleep?.rem_minutes), sleepDuration), "sleep", sourceReliability(sleep?.device_type, 0.62), text(sleep?.device_type));
    add(features, "sleep.self_rating", number(sleep?.self_rating), "sleep", 0.5, "self-report");

    add(features, "activity.steps", number(exercise?.steps), "activity", sourceReliability(exercise?.device_type, 0.76), text(exercise?.device_type));
    add(features, "activity.minutes", number(exercise?.exercise_minutes), "activity", sourceReliability(exercise?.device_type, 0.72), text(exercise?.device_type));
    add(features, "activity.energy_kcal", number(exercise?.calories), "activity", sourceReliability(exercise?.device_type, 0.65), text(exercise?.device_type));
    add(features, "activity.self_rating", number(exercise?.self_rating), "activity", 0.45, "self-report");

    add(features, "nutrition.energy_kcal", number(nutrition?.total_calories), "nutrition", 0.58, "manual-or-ai");
    const mealItems = [
      ...array(nutrition?.breakfast_items),
      ...array(nutrition?.lunch_items),
      ...array(nutrition?.dinner_items),
      ...array(nutrition?.pantry_items),
    ].filter(isRow);
    if (nutrition) add(features, "nutrition.item_count", mealItems.length, "nutrition", 0.5, "manual-or-ai");
    add(features, "nutrition.protein_grams", number(nutrition?.protein_grams) ?? sumItem(mealItems, ["protein_grams", "protein_g"]), "nutrition", 0.5, "manual-or-ai");
    add(features, "nutrition.carbohydrate_grams", number(nutrition?.carbohydrate_grams) ?? sumItem(mealItems, ["carbohydrate_grams", "carbs_g"]), "nutrition", 0.5, "manual-or-ai");
    add(features, "nutrition.fat_grams", number(nutrition?.fat_grams) ?? sumItem(mealItems, ["fat_grams", "fat_g"]), "nutrition", 0.5, "manual-or-ai");
    add(features, "nutrition.hydration_ml", number(nutrition?.hydration_ml), "nutrition", 0.55, "manual");
    add(features, "nutrition.health_rating", number(nutrition?.health_rating), "nutrition", 0.45, "self-report");

    const focusMinutes = sum(focusRows.map((row) => number(row.total_minutes)));
    const focusSessions = sum(focusRows.map((row) => number(row.completed_sessions)));
    if (focusRows.length) {
      add(features, "focus.minutes", focusMinutes, "focus", 0.72, "timer");
      add(features, "focus.sessions", focusSessions, "focus", 0.7, "timer");
      add(features, "focus.interruptions", sum(focusRows.map((row) => number(row.interrupted_sessions))), "focus", 0.62, "timer");
    }
    if (focusDistribution) {
      const periods = ["period_0_6", "period_6_12", "period_12_18", "period_18_24"].map((key) => number(focusDistribution[key]) ?? 0);
      const total = sum(periods);
      if (total > 0) add(features, "focus.time_entropy", normalizedEntropy(periods), "focus", 0.64, "timer");
    }

    add(features, "face.state_score", number(face?.overall_score), "face", clamp(number(face?.analysis_confidence) ?? 0.45, 0.15, 0.75), "derived-only");
    add(features, "face.skin_age_reference", number(face?.skin_age), "face", clamp(number(face?.analysis_confidence) ?? 0.35, 0.1, 0.65), "derived-only");

    const mergedHealth = mergeHealthRows(healthRows);
    add(features, "recovery.resting_heart_rate", number(mergedHealth.resting_heart_rate), "recovery", 0.88, text(mergedHealth.source));
    add(features, "recovery.hrv_sdnn", number(mergedHealth.heart_rate_variability_sdnn), "recovery", 0.86, text(mergedHealth.source));
    add(features, "recovery.blood_oxygen", normalizeOxygen(number(mergedHealth.blood_oxygen)), "recovery", 0.74, text(mergedHealth.source));
    add(features, "sleep.efficiency", normalizeFraction(number(mergedHealth.sleep_efficiency)), "sleep", 0.82, text(mergedHealth.source));
    add(features, "activity.coverage_hours", number(mergedHealth.activity_coverage_hours), "activity", 0.78, text(mergedHealth.source));
    const bins = array(mergedHealth.activity_bins).filter(isRow);
    if (bins.length >= 6) {
      const hourly = Array.from({ length: 24 }, () => 0);
      bins.forEach((bin) => {
        const hour = Math.round(number(bin.hour) ?? -1);
        if (hour >= 0 && hour < 24) hourly[hour] += (number(bin.steps) ?? 0) + (number(bin.exerciseMinutes) ?? 0) * 80;
      });
      add(features, "activity.hourly_fragmentation", fragmentation(hourly), "activity", 0.74, text(mergedHealth.source));
      add(features, "activity.active_period_entropy", normalizedEntropy(hourly), "activity", 0.7, text(mergedHealth.source));
    }

    observations.push({ date, features });
  }
  return observations;
}

function add(
  target: Record<string, FdnbFeatureValue>,
  key: string,
  value: number | undefined,
  module: FdnbModule,
  reliability: number,
  source?: string,
) {
  if (value == null || !Number.isFinite(value)) return;
  target[key] = { value, module, reliability: clamp(reliability, 0, 1), source };
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

function isRow(value: unknown): value is Row {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function forDate(value: Row[] | undefined, date: string) {
  return (value ?? []).filter((row) => text(row.record_date)?.slice(0, 10) === date);
}

function latestForDate(value: Row[] | undefined, date: string) {
  return forDate(value, date).sort((a, b) => text(b.updated_at)?.localeCompare(text(a.updated_at) ?? "") ?? 0)[0];
}

function mergeHealthRows(value: Row[]) {
  return value.reduce<Row>((output, row) => {
    Object.entries(row).forEach(([key, item]) => {
      if (item != null && item !== "" && (!(key in output) || key === "activity_bins")) output[key] = item;
    });
    return output;
  }, {});
}

function sourceReliability(source: unknown, fallback: number) {
  const value = text(source)?.toLowerCase() ?? "";
  if (/apple|watch|health|device/.test(value)) return Math.max(fallback, 0.86);
  return fallback;
}

function sumItem(items: Row[], keys: string[]) {
  const values = items.map((item) => keys.map((key) => number(item[key])).find((value) => value != null));
  return values.some((value) => value != null) ? sum(values) : undefined;
}

function sleepMidpoint(start?: number, end?: number) {
  if (start == null || end == null) return undefined;
  let adjustedEnd = end;
  if (adjustedEnd <= start) adjustedEnd += 24 * 60;
  return ((start + adjustedEnd) / 2) % (24 * 60);
}

function clockMinutes(value?: string) {
  if (!value || !/^\d{1,2}:\d{2}/.test(value)) return undefined;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

function ratio(numerator?: number, denominator?: number) {
  if (numerator == null || denominator == null || denominator <= 0) return undefined;
  return numerator / denominator;
}

function normalizeFraction(value?: number) {
  if (value == null) return undefined;
  return value > 1.5 ? value / 100 : value;
}

function normalizeOxygen(value?: number) {
  if (value == null) return undefined;
  return value <= 1.2 ? value * 100 : value;
}

function fragmentation(values: number[]) {
  const transitions = values.slice(1).map((value, index) => Math.abs(value - values[index]));
  const total = sum(values);
  return total > 0 ? sum(transitions) / total : 0;
}

function normalizedEntropy(values: number[]) {
  const positive = values.map((value) => Math.max(0, value));
  const total = sum(positive);
  if (total <= 0) return 0;
  const entropy = positive.reduce((output, value) => {
    const probability = value / total;
    return probability > 0 ? output - probability * Math.log(probability) : output;
  }, 0);
  return entropy / Math.log(Math.max(2, positive.length));
}

function dateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const values: string[] = [];
  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) values.push(date.toISOString().slice(0, 10));
  return values;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sum(values: Array<number | undefined>) {
  return values.reduce<number>((output, value) => output + (Number.isFinite(value) ? Number(value) : 0), 0);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
