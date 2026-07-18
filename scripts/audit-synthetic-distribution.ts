import { calculateRhythm } from "../supabase/functions/_shared/rhythm-core.ts";
import { syntheticFieldExpectations, type SyntheticDataCategory } from "../algorithm/data-catalog.ts";
import { allCohorts, allScenarios, generatePopulation, legacyFusionProxy, type SyntheticTrajectory } from "../algorithm/synthetic.ts";

const minimumUsers = 5000;
const requestedUsers = Number(process.argv.find((item) => item.startsWith("--users="))?.split("=")[1] ?? minimumUsers);
const users = Number.isFinite(requestedUsers) ? Math.max(minimumUsers, Math.min(25000, Math.round(requestedUsers))) : minimumUsers;
const seed = Number(process.argv.find((item) => item.startsWith("--seed="))?.split("=")[1] ?? 240724);

const population = generatePopulation(users, seed);
const dayRecords = population.flatMap((trajectory) => [...trajectory.inputs.history, trajectory.inputs.today]);
const predictions = population.map((trajectory) => {
  const result = calculateRhythm(trajectory.inputs);
  return {
    trajectory,
    result,
    legacy: legacyFusionProxy(trajectory.inputs),
  };
});

type FieldStats = {
  key: string;
  label: string;
  category: SyntheticDataCategory;
  count: number;
  denominator: number;
  observedRate: number;
  min: number | null;
  p1: number | null;
  p5: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  mean: number | null;
  hardIssues: string[];
  warnings: string[];
};

const fields: FieldStats[] = syntheticFieldExpectations.map((expectation) => {
  const values = collectValues(expectation.key);
  const sorted = values.sort((left, right) => left - right);
  const denominator = denominatorFor(expectation.category);
  const stats: FieldStats = {
    key: expectation.key,
    label: expectation.label,
    category: expectation.category,
    count: sorted.length,
    denominator,
    observedRate: round(sorted.length / Math.max(1, denominator), 4),
    min: sorted.at(0) ?? null,
    p1: quantile(sorted, 0.01),
    p5: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max: sorted.at(-1) ?? null,
    mean: sorted.length === 0 ? null : round(mean(sorted), 3),
    hardIssues: [],
    warnings: [],
  };

  if (expectation.observedRateMin != null && stats.observedRate < expectation.observedRateMin) {
    stats.hardIssues.push(`observedRate ${stats.observedRate} < ${expectation.observedRateMin}`);
  }
  if (expectation.observedRateMax != null && stats.observedRate > expectation.observedRateMax) {
    stats.hardIssues.push(`observedRate ${stats.observedRate} > ${expectation.observedRateMax}`);
  }
  if (stats.min != null && stats.min < expectation.plausibleMin) {
    stats.hardIssues.push(`min ${stats.min} < plausibleMin ${expectation.plausibleMin}`);
  }
  if (stats.max != null && stats.max > expectation.plausibleMax) {
    stats.hardIssues.push(`max ${stats.max} > plausibleMax ${expectation.plausibleMax}`);
  }
  if (expectation.medianMin != null && stats.median != null && stats.median < expectation.medianMin) {
    stats.warnings.push(`median ${stats.median} < ${expectation.medianMin}`);
  }
  if (expectation.medianMax != null && stats.median != null && stats.median > expectation.medianMax) {
    stats.warnings.push(`median ${stats.median} > ${expectation.medianMax}`);
  }
  if (expectation.p1Min != null && stats.p1 != null && stats.p1 < expectation.p1Min) {
    stats.warnings.push(`p1 ${stats.p1} < ${expectation.p1Min}`);
  }
  if (expectation.p99Max != null && stats.p99 != null && stats.p99 > expectation.p99Max) {
    stats.warnings.push(`p99 ${stats.p99} > ${expectation.p99Max}`);
  }
  return stats;
});

const scoreErrors = predictions.map((item) => item.result.score - item.trajectory.truthScore);
const legacyErrors = predictions.map((item) => item.legacy - item.trajectory.truthScore);
const clinicalClassCounts = countBy(population.map((item) => item.metadata.oneTimeProfile.clinicalClass));
const categoryCounts = Object.fromEntries(
  ["apple_watch_auto", "one_time_profile", "daily_user_report", "algorithm_derived"].map((category) => [
    category,
    fields.filter((item) => item.category === category).length,
  ]),
);
const densityCounts = countBy(population.map((item) => item.metadata.dataDensity));
const scenarioCounts = countBy(population.map((item) => item.scenario));
const cohortCounts = countBy(population.map((item) => item.cohort));
const sexCounts = countBy(population.map((item) => item.metadata.oneTimeProfile.sex));
const chronotypeCounts = countBy(population.map((item) => item.metadata.oneTimeProfile.chronotype));
const distributionIssues = auditDistribution({
  densityCounts,
  scenarioCounts,
  cohortCounts,
  clinicalClassCounts,
  sexCounts,
  chronotypeCounts,
});

const report = {
  generatedAt: new Date().toISOString(),
  users: population.length,
  dayRecords: dayRecords.length,
  seed,
  fieldCategories: categoryCounts,
  coverage: {
    cohortsSeen: Object.keys(countBy(population.map((item) => item.cohort))).length,
    cohortsExpected: allCohorts().length,
    scenariosSeen: Object.keys(countBy(population.map((item) => item.scenario))).length,
    scenariosExpected: allScenarios().length,
  },
  mix: {
    densityCounts,
    scenarioCounts,
    cohortCounts,
    clinicalClassCounts,
    sexCounts,
    chronotypeCounts,
  },
  distributionTargets: {
    minimumUsers,
    minimumScenarioUsers: 50,
    minimumCohortUsers: 80,
    densityShare: {
      dense: [0.03, 0.12],
      mixed: [0.78, 0.95],
      sparse: [0.02, 0.12],
    },
    clinicalClassShare: {
      healthy: [0.18, 0.36],
      sleep_disrupted: [0.12, 0.28],
      metabolic_risk: [0.1, 0.22],
      travel_disrupted: [0.04, 0.12],
      low_adherence: [0.03, 0.1],
      high_stress: [0.03, 0.1],
      older_low_hrv: [0.03, 0.1],
      athletic: [0.03, 0.1],
      shift_work: [0.02, 0.08],
      cardio_rehab: [0.015, 0.07],
    },
  },
  algorithmBenchmark: {
    model: predictions[0]?.result.modelVersion,
    mae: round(mean(scoreErrors.map(Math.abs)), 3),
    rmse: round(Math.sqrt(mean(scoreErrors.map((value) => value ** 2))), 3),
    bias: round(mean(scoreErrors), 3),
    legacyMae: round(mean(legacyErrors.map(Math.abs)), 3),
    improvementPercent: round((1 - mean(scoreErrors.map(Math.abs)) / Math.max(1e-9, mean(legacyErrors.map(Math.abs)))) * 100, 2),
  },
  fieldStats: fields,
  hardIssues: [
    ...(population.length < minimumUsers ? [`user count ${population.length} < ${minimumUsers}`] : []),
    ...(Object.keys(countBy(population.map((item) => item.cohort))).length < Math.min(18, allCohorts().length) ? ["cohort coverage below target"] : []),
    ...(Object.keys(countBy(population.map((item) => item.scenario))).length < allScenarios().length ? ["scenario coverage below target"] : []),
    ...distributionIssues.hardIssues,
    ...fields.flatMap((item) => item.hardIssues.map((issue) => `${item.key}: ${issue}`)),
  ],
  warnings: [
    ...distributionIssues.warnings,
    ...fields.flatMap((item) => item.warnings.map((warning) => `${item.key}: ${warning}`)),
  ],
};

console.log(JSON.stringify(report, null, 2));
if (report.hardIssues.length > 0) process.exitCode = 1;

function collectValues(key: string) {
  const values: number[] = [];
  if (key === "age_years") return population.map((item) => item.metadata.oneTimeProfile.ageYears);
  if (key === "bmi") return population.map((item) => item.metadata.oneTimeProfile.bmi);
  if (key === "baseline_steps_median") return population.map((item) => item.metadata.oneTimeProfile.baselineStepsMedian);
  if (key === "baseline_hrv_sdnn") return population.map((item) => item.metadata.oneTimeProfile.baselineHrvSdnn);
  if (key === "baseline_resting_heart_rate") return population.map((item) => item.metadata.oneTimeProfile.baselineRestingHeartRate);
  if (key === "rhythm_score") return predictions.map((item) => item.result.score);
  if (key === "rhythm_confidence") return predictions.map((item) => item.result.confidence);
  if (key === "data_quality_score") return predictions.map((item) => numeric(item.result.fusion.dataQuality.score)).filter(isNumber);
  if (key === "circadian_drift_pressure") return predictions.map((item) => numeric(item.result.fusion.utilityFusion.circadianDriftPressure)).filter(isNumber);
  if (key === "physiology_lead_pressure") return predictions.map((item) => numeric(item.result.fusion.utilityFusion.physiologyLeadPressure)).filter(isNumber);
  if (key === "presenteeism_strain_pressure") return predictions.map((item) => numeric(item.result.fusion.utilityFusion.presenteeismStrainPressure)).filter(isNumber);
  if (key === "masked_strain_pressure") return predictions.map((item) => numeric(item.result.fusion.utilityFusion.maskedStrainPressure)).filter(isNumber);
  if (key === "functional_overreach_relief") return predictions.map((item) => numeric(item.result.fusion.utilityFusion.functionalOverreachRelief)).filter(isNumber);
  if (key === "phase_adaptation_relief") return predictions.map((item) => numeric(item.result.fusion.utilityFusion.phaseAdaptationRelief)).filter(isNumber);
  if (key === "recovery_rebound_relief") return predictions.map((item) => numeric(item.result.fusion.utilityFusion.recoveryReboundRelief)).filter(isNumber);

  for (const day of dayRecords) {
    const value = valueFromDay(key, day);
    if (value != null) values.push(value);
  }
  return values;
}

function valueFromDay(key: string, day: SyntheticTrajectory["inputs"]["today"]) {
  const sleepDuration = numeric(day.sleep?.sleep_duration_minutes);
  if (key === "sleep_duration_minutes") return sleepDuration;
  if (key === "deep_sleep_ratio") {
    const deep = numeric(day.sleep?.deep_sleep_minutes ?? day.health?.sleep_stage_minutes?.deep);
    return sleepDuration && deep != null ? deep / sleepDuration : null;
  }
  if (key === "rem_sleep_ratio") {
    const rem = numeric(day.sleep?.rem_minutes ?? day.health?.sleep_stage_minutes?.rem);
    return sleepDuration && rem != null ? rem / sleepDuration : null;
  }
  if (key === "steps") return numeric(day.exercise?.steps);
  if (key === "exercise_minutes") return numeric(day.exercise?.exercise_minutes);
  if (key === "active_calories") return numeric(day.exercise?.calories);
  if (key === "latest_heart_rate") return numeric(day.health?.latest_heart_rate ?? day.exercise?.heart_rate);
  if (key === "resting_heart_rate") return numeric(day.health?.resting_heart_rate);
  if (key === "hrv_sdnn") return numeric(day.health?.heart_rate_variability_sdnn);
  if (key === "blood_oxygen_percent") {
    const value = numeric(day.health?.blood_oxygen ?? day.exercise?.spo2);
    return value == null ? null : value <= 1 ? value * 100 : value;
  }
  if (key === "activity_coverage_hours") {
    if (!day.health) return null;
    return Array.isArray(day.health.activity_bins) ? day.health.activity_bins.length : 0;
  }
  if (key === "mood_score") return numeric(day.mood?.mood_score);
  if (key === "nutrition_calories") return numeric(day.nutrition?.total_calories);
  if (key === "focus_minutes") return day.focusMinutes > 0 ? day.focusMinutes : null;
  if (key === "sleep_self_rating") return numeric(day.sleep?.self_rating);
  return null;
}

function denominatorFor(category: SyntheticDataCategory) {
  return category === "one_time_profile" || category === "algorithm_derived" ? population.length : dayRecords.length;
}

function auditDistribution(counts: {
  densityCounts: Record<string, number>;
  scenarioCounts: Record<string, number>;
  cohortCounts: Record<string, number>;
  clinicalClassCounts: Record<string, number>;
  sexCounts: Record<string, number>;
  chronotypeCounts: Record<string, number>;
}) {
  const hardIssues: string[] = [];
  const warnings: string[] = [];
  const total = population.length;
  for (const scenario of allScenarios()) {
    const count = counts.scenarioCounts[scenario] ?? 0;
    if (count < 50) hardIssues.push(`scenario ${scenario} count ${count} < 50`);
  }
  for (const cohort of allCohorts()) {
    const count = counts.cohortCounts[cohort] ?? 0;
    if (count < 80) hardIssues.push(`cohort ${cohort} count ${count} < 80`);
  }
  checkShare("density dense", counts.densityCounts.dense ?? 0, total, 0.03, 0.12, hardIssues);
  checkShare("density mixed", counts.densityCounts.mixed ?? 0, total, 0.78, 0.95, hardIssues);
  checkShare("density sparse", counts.densityCounts.sparse ?? 0, total, 0.02, 0.12, hardIssues);
  checkShare("clinical healthy", counts.clinicalClassCounts.healthy ?? 0, total, 0.18, 0.36, hardIssues);
  checkShare("clinical sleep_disrupted", counts.clinicalClassCounts.sleep_disrupted ?? 0, total, 0.12, 0.28, hardIssues);
  checkShare("clinical metabolic_risk", counts.clinicalClassCounts.metabolic_risk ?? 0, total, 0.1, 0.22, hardIssues);
  checkShare("clinical travel_disrupted", counts.clinicalClassCounts.travel_disrupted ?? 0, total, 0.04, 0.12, hardIssues);
  checkShare("clinical low_adherence", counts.clinicalClassCounts.low_adherence ?? 0, total, 0.03, 0.1, hardIssues);
  checkShare("clinical high_stress", counts.clinicalClassCounts.high_stress ?? 0, total, 0.03, 0.1, hardIssues);
  checkShare("clinical older_low_hrv", counts.clinicalClassCounts.older_low_hrv ?? 0, total, 0.03, 0.1, hardIssues);
  checkShare("clinical athletic", counts.clinicalClassCounts.athletic ?? 0, total, 0.03, 0.1, hardIssues);
  checkShare("clinical shift_work", counts.clinicalClassCounts.shift_work ?? 0, total, 0.02, 0.08, hardIssues);
  checkShare("clinical cardio_rehab", counts.clinicalClassCounts.cardio_rehab ?? 0, total, 0.015, 0.07, hardIssues);
  checkShare("sex female", counts.sexCounts.female ?? 0, total, 0.42, 0.56, hardIssues);
  checkShare("sex male", counts.sexCounts.male ?? 0, total, 0.4, 0.55, hardIssues);
  checkShare("sex other", counts.sexCounts.other ?? 0, total, 0.002, 0.03, warnings);
  checkShare("chronotype intermediate", counts.chronotypeCounts.intermediate ?? 0, total, 0.34, 0.56, hardIssues);
  checkShare("chronotype early", counts.chronotypeCounts.early ?? 0, total, 0.22, 0.42, hardIssues);
  checkShare("chronotype irregular", counts.chronotypeCounts.irregular ?? 0, total, 0.08, 0.22, hardIssues);
  checkShare("chronotype late", counts.chronotypeCounts.late ?? 0, total, 0.05, 0.18, hardIssues);
  return { hardIssues, warnings };
}

function checkShare(label: string, count: number, total: number, minimum: number, maximum: number, issues: string[]) {
  const share = count / Math.max(1, total);
  if (share < minimum || share > maximum) issues.push(`${label} share ${round(share, 4)} outside ${minimum}-${maximum}`);
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1]));
}

function quantile(sorted: number[], probability: number) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return round(sorted[lower] * (1 - weight) + sorted[upper] * weight, 3);
}

function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function numeric(value: unknown) {
  if (value == null) return null;
  const parsed = Number(String(value).replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isNumber(value: number | null): value is number {
  return value != null && Number.isFinite(value);
}

function round(value: number, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
