import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { allCohorts, allScenarios, legacyFusionProxy, type SyntheticTrajectory } from "../algorithm/synthetic.ts";
import type { RhythmConfig, RhythmInputs } from "../supabase/functions/_shared/rhythm-core.ts";

type RhythmResult = {
  score: number;
  scoreInterval: {
    lower: number;
    upper: number;
  };
  confidence: number;
  fusion: {
    changePointProbability: number;
  };
};

type ModelModule = {
  calculateRhythm: (inputs: RhythmInputs, config?: RhythmConfig) => RhythmResult;
  defaultRhythmConfig?: RhythmConfig;
  rhythmModelVersion?: string;
};

type Prediction = {
  trajectory: SyntheticTrajectory;
  current: number;
  legacy: number;
  lower: number;
  upper: number;
  confidence: number;
  changePoint: number;
};

const fixedDatasetPath = "Z:\\nava-app-data\\synthetic-population\\nava-synthetic-users-5000-seed-240724.jsonl";
const localArtifactDatasetPath = join("artifacts", "synthetic-population", "nava-synthetic-users-5000-seed-240724.jsonl");
const datasetPath = resolve(argumentValue("--dataset") ?? process.env.NAVA_FIXED_DATASET ?? defaultDatasetPath());
const reportDirectory = resolve(argumentValue("--report-dir") ?? process.env.NAVA_BENCHMARK_REPORT_DIR ?? join(dirname(datasetPath), "benchmarks"));
const modelModulePath = argumentValue("--model-module");
const modelModule = await importModel(modelModulePath);
const modelLabel = modelModule.rhythmModelVersion ?? (modelModulePath ? basename(modelModulePath) : "current-rhythm-model");
const reportName = sanitizeReportName(argumentValue("--report-name") ?? modelLabel);

if (!existsSync(datasetPath)) {
  throw new Error(`Fixed benchmark dataset not found: ${datasetPath}`);
}

const report = await evaluateFixedDataset(datasetPath, modelModule, modelLabel, modelModulePath);
mkdirSync(reportDirectory, { recursive: true });
const reportPath = join(reportDirectory, `${reportName}.json`);
writeFileSync(reportPath, `${JSON.stringify({ ...report, reportPath }, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ ...report, reportPath }, null, 2));

async function evaluateFixedDataset(path: string, model: ModelModule, label: string, modulePath?: string) {
  const fileStats = statSync(path);
  const stream = createReadStream(path);
  const hash = createHash("sha256");
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  const predictions: Prediction[] = [];
  const densityValues: string[] = [];
  const scenarioValues: string[] = [];
  const cohortValues: string[] = [];
  const missingnessRates: number[] = [];
  const observedDays: number[] = [];
  let lineNumber = 0;
  const started = performance.now();

  stream.on("data", (chunk) => hash.update(chunk));

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    lineNumber += 1;

    let trajectory: SyntheticTrajectory;
    try {
      trajectory = JSON.parse(trimmed) as SyntheticTrajectory;
    } catch (error) {
      throw new Error(`Failed to parse fixed dataset line ${lineNumber}: ${String(error)}`);
    }

    const result = model.calculateRhythm(trajectory.inputs, model.defaultRhythmConfig);
    predictions.push({
      trajectory,
      current: result.score,
      legacy: legacyFusionProxy(trajectory.inputs),
      lower: result.scoreInterval.lower,
      upper: result.scoreInterval.upper,
      confidence: result.confidence,
      changePoint: result.fusion.changePointProbability,
    });
    densityValues.push(trajectory.metadata.dataDensity);
    scenarioValues.push(trajectory.scenario);
    cohortValues.push(trajectory.cohort);
    missingnessRates.push(trajectory.metadata.missingnessRate);
    observedDays.push(trajectory.metadata.observedDays);
  }

  const elapsed = performance.now() - started;
  const sha256 = hash.digest("hex");
  const scenarios = Object.fromEntries(
    allScenarios().map((scenario) => [scenario, metrics(predictions.filter((item) => item.trajectory.scenario === scenario))]),
  );
  const cohorts = Object.fromEntries(
    allCohorts().map((cohort) => [cohort, metrics(predictions.filter((item) => item.trajectory.cohort === cohort))]),
  );

  return {
    mode: "fixed-dataset-benchmark",
    model: label,
    modelModule: modulePath ? resolve(modulePath) : "supabase/functions/_shared/rhythm-core.ts",
    config: model.defaultRhythmConfig ?? null,
    fixedDataset: {
      path,
      sha256,
      bytes: fileStats.size,
      users: predictions.length,
    },
    overall: metrics(predictions),
    scenarios,
    cohorts,
    dataProfile: {
      densityCounts: countBy(densityValues),
      scenarioCounts: countBy(scenarioValues),
      cohortCounts: countBy(cohortValues),
      meanMissingnessRate: round(mean(missingnessRates), 3),
      observedDays: {
        min: Math.min(...observedDays),
        median: round(median(observedDays), 1),
        max: Math.max(...observedDays),
      },
    },
    performance: {
      totalMilliseconds: round(elapsed, 2),
      millisecondsPerUser: round(elapsed / Math.max(1, predictions.length), 4),
      usersPerSecond: round(predictions.length / Math.max(0.001, elapsed / 1000), 1),
    },
  };
}

async function importModel(modulePath?: string): Promise<ModelModule> {
  const specifier = modulePath
    ? pathToFileURL(resolve(modulePath)).href
    : new URL("../supabase/functions/_shared/rhythm-core.ts", import.meta.url).href;
  const module = await import(specifier) as ModelModule;
  if (typeof module.calculateRhythm !== "function") {
    throw new Error(`Model module does not export calculateRhythm: ${specifier}`);
  }
  return module;
}

function defaultDatasetPath() {
  return existsSync(fixedDatasetPath) ? fixedDatasetPath : localArtifactDatasetPath;
}

function argumentValue(name: string) {
  return process.argv.find((item) => item.startsWith(`${name}=`))?.split("=").slice(1).join("=");
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1]));
}

function metrics(predictions: Prediction[]) {
  const truth = predictions.map((item) => item.trajectory.truthScore);
  const current = predictions.map((item) => item.current);
  const legacy = predictions.map((item) => item.legacy);
  const currentErrors = current.map((value, index) => value - truth[index]);
  const legacyErrors = legacy.map((value, index) => value - truth[index]);
  const coverage = predictions.filter((item) => item.trajectory.truthScore >= item.lower && item.trajectory.truthScore <= item.upper).length / Math.max(1, predictions.length);
  const labels = predictions.map((item) => item.trajectory.truthLowState);
  return {
    count: predictions.length,
    current: {
      mae: round(mean(currentErrors.map(Math.abs)), 3),
      rmse: round(Math.sqrt(mean(currentErrors.map((value) => value ** 2))), 3),
      bias: round(mean(currentErrors), 3),
      spearman: round(spearman(truth, current), 4),
      lowStateAuroc: round(auroc(labels, current.map((value) => -value)), 4),
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
      maePercent: round((1 - mean(currentErrors.map(Math.abs)) / Math.max(1e-9, mean(legacyErrors.map(Math.abs)))) * 100, 2),
      rmsePercent: round((1 - Math.sqrt(mean(currentErrors.map((value) => value ** 2))) / Math.max(1e-9, Math.sqrt(mean(legacyErrors.map((value) => value ** 2))))) * 100, 2),
    },
  };
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

function sanitizeReportName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "fixed-benchmark";
}
