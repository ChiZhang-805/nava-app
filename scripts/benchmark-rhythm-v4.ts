import { performance } from "node:perf_hooks";
import { calculateRhythm, defaultRhythmConfig, rhythmModelVersion, type RhythmConfig } from "../supabase/functions/_shared/rhythm-core.ts";
import { allCohorts, allScenarios, generatePopulation, legacyFusionProxy, type SyntheticTrajectory } from "../algorithm/synthetic.ts";

const tune = process.argv.includes("--tune");
const requested = Number(process.argv.find((item) => item.startsWith("--users="))?.split("=")[1] ?? (tune ? 240 : 1000));
const users = Number.isFinite(requested) ? Math.max(50, Math.min(5000, Math.round(requested))) : 1000;

if (tune) {
  const train = generatePopulation(users, 240718);
  const validation = generatePopulation(Math.max(200, users), 240719);
  const candidates = buildCandidates();
  const ranked = candidates.map((config, index) => {
    const report = evaluate(train, config);
    return { index, config, objective: objective(report), report };
  }).sort((left, right) => left.objective - right.objective);
  const finalists = ranked.slice(0, 8).map((candidate) => ({ ...candidate, validation: evaluate(validation, candidate.config) }));
  finalists.sort((left, right) => objective(left.validation) - objective(right.validation));
  console.log(JSON.stringify({ mode: "tune", trainUsers: train.length, validationUsers: validation.length, best: finalists[0], finalists }, null, 2));
} else {
  const population = generatePopulation(users, 240720);
  const report = evaluate(population, defaultRhythmConfig);
  console.log(JSON.stringify({ mode: "benchmark", users, model: rhythmModelVersion, config: defaultRhythmConfig, ...report }, null, 2));
}

type Prediction = {
  trajectory: SyntheticTrajectory;
  v4: number;
  legacy: number;
  lower: number;
  upper: number;
  confidence: number;
  changePoint: number;
};

function evaluate(population: SyntheticTrajectory[], config: RhythmConfig) {
  const started = performance.now();
  const predictions: Prediction[] = population.map((trajectory) => {
    const result = calculateRhythm(trajectory.inputs, config);
    return {
      trajectory,
      v4: result.score,
      legacy: legacyFusionProxy(trajectory.inputs),
      lower: result.scoreInterval.lower,
      upper: result.scoreInterval.upper,
      confidence: result.confidence,
      changePoint: result.fusion.changePointProbability,
    };
  });
  const elapsed = performance.now() - started;
  const scenarios = Object.fromEntries(allScenarios().map((scenario) => [scenario, metrics(predictions.filter((item) => item.trajectory.scenario === scenario))]));
  const cohorts = Object.fromEntries(allCohorts().map((cohort) => [cohort, metrics(predictions.filter((item) => item.trajectory.cohort === cohort))]));
  return {
    overall: metrics(predictions),
    scenarios,
    cohorts,
    dataProfile: summarizeDataProfile(population),
    performance: {
      totalMilliseconds: round(elapsed, 2),
      millisecondsPerUser: round(elapsed / population.length, 4),
      usersPerSecond: round(population.length / Math.max(0.001, elapsed / 1000), 1),
    },
  };
}

function summarizeDataProfile(population: SyntheticTrajectory[]) {
  const densityCounts = countBy(population.map((item) => item.metadata.dataDensity));
  const scenarioCounts = countBy(population.map((item) => item.scenario));
  const cohortCounts = countBy(population.map((item) => item.cohort));
  return {
    densityCounts,
    scenarioCounts,
    cohortCounts,
    meanMissingnessRate: round(mean(population.map((item) => item.metadata.missingnessRate)), 3),
    observedDays: {
      min: Math.min(...population.map((item) => item.metadata.observedDays)),
      median: round(median(population.map((item) => item.metadata.observedDays)), 1),
      max: Math.max(...population.map((item) => item.metadata.observedDays)),
    },
  };
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function metrics(predictions: Prediction[]) {
  const truth = predictions.map((item) => item.trajectory.truthScore);
  const v4 = predictions.map((item) => item.v4);
  const legacy = predictions.map((item) => item.legacy);
  const v4Errors = v4.map((value, index) => value - truth[index]);
  const legacyErrors = legacy.map((value, index) => value - truth[index]);
  const coverage = predictions.filter((item) => item.trajectory.truthScore >= item.lower && item.trajectory.truthScore <= item.upper).length / Math.max(1, predictions.length);
  const labels = predictions.map((item) => item.trajectory.truthLowState);
  return {
    count: predictions.length,
    v4: {
      mae: round(mean(v4Errors.map(Math.abs)), 3),
      rmse: round(Math.sqrt(mean(v4Errors.map((value) => value ** 2))), 3),
      bias: round(mean(v4Errors), 3),
      spearman: round(spearman(truth, v4), 4),
      lowStateAuroc: round(auroc(labels, v4.map((value) => -value)), 4),
      intervalCoverage80: round(coverage, 4),
      meanIntervalWidth: round(mean(predictions.map((item) => item.upper - item.lower)), 3),
      meanConfidence: round(mean(predictions.map((item) => item.confidence)), 3),
      meanChangePointProbability: round(mean(predictions.map((item) => item.changePoint)), 4),
    },
    legacy: {
      mae: round(mean(legacyErrors.map(Math.abs)), 3),
      rmse: round(Math.sqrt(mean(legacyErrors.map((value) => value ** 2))), 3),
      bias: round(mean(legacyErrors), 3),
      spearman: round(spearman(truth, legacy), 4),
      lowStateAuroc: round(auroc(labels, legacy.map((value) => -value)), 4),
    },
    improvement: {
      maePercent: round((1 - mean(v4Errors.map(Math.abs)) / Math.max(1e-9, mean(legacyErrors.map(Math.abs)))) * 100, 2),
      rmsePercent: round((1 - Math.sqrt(mean(v4Errors.map((value) => value ** 2))) / Math.max(1e-9, Math.sqrt(mean(legacyErrors.map((value) => value ** 2))))) * 100, 2),
    },
  };
}

function objective(report: ReturnType<typeof evaluate>) {
  const metric = report.overall.v4;
  return metric.mae + metric.rmse * 0.35 + Math.abs(metric.intervalCoverage80 - 0.8) * 12 + Math.max(0, metric.meanIntervalWidth - 34) * 0.04;
}

function buildCandidates() {
  const candidates: RhythmConfig[] = [];
  for (const degrees of [3, 4, 6, 10]) {
    for (const temperature of [0.95, 1.1, 1.2, 1.35]) {
      for (const processScale of [0.7, 1, 1.35]) {
        for (const persistenceShift of [-0.03, 0, 0.025]) {
          candidates.push({
            ...defaultRhythmConfig,
            studentDegreesOfFreedom: degrees,
            scoreTemperature: temperature,
            processNoise: defaultRhythmConfig.processNoise.map((value) => value * processScale) as RhythmConfig["processNoise"],
            persistence: defaultRhythmConfig.persistence.map((value) => clamp(value + persistenceShift, 0.72, 0.99)) as RhythmConfig["persistence"],
          });
        }
      }
    }
  }
  return candidates;
}

function spearman(left: number[], right: number[]) {
  return pearson(ranks(left), ranks(right));
}

function ranks(values: number[]) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const output = Array.from({ length: values.length }, () => 0);
  let start = 0;
  while (start < sorted.length) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end += 1;
    const rank = (start + end - 1) / 2 + 1;
    for (let index = start; index < end; index += 1) output[sorted[index].index] = rank;
    start = end;
  }
  return output;
}

function pearson(left: number[], right: number[]) {
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) * right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return denominator <= 1e-12 ? 0.5 : numerator / denominator;
}

function auroc(labels: boolean[], scores: number[]) {
  const positive = labels.filter(Boolean).length;
  const negative = labels.length - positive;
  if (positive === 0 || negative === 0) return 0.5;
  const ranked = ranks(scores);
  const positiveRankSum = ranked.reduce((sum, rank, index) => sum + (labels[index] ? rank : 0), 0);
  return (positiveRankSum - positive * (positive + 1) / 2) / (positive * negative);
}

function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
