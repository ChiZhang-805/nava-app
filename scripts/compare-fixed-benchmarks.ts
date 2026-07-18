import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type MetricGroup = {
  count: number;
  current: {
    mae: number;
    rmse: number;
    bias: number;
    spearman: number;
    lowStateAuroc: number;
    intervalCoverage80?: number;
    meanIntervalWidth?: number;
    meanConfidence?: number;
    meanChangePointProbability?: number;
  };
  legacy?: {
    mae: number;
    rmse: number;
    bias: number;
    spearman: number;
    lowStateAuroc: number;
  };
};

type FixedBenchmarkReport = {
  model: string;
  fixedDataset: {
    path: string;
    sha256: string;
    bytes: number;
    users: number;
  };
  overall: MetricGroup;
  scenarios: Record<string, MetricGroup>;
  cohorts: Record<string, MetricGroup>;
};

const defaultReportDirectory = "Z:\\nava-app-data\\synthetic-population\\benchmarks";
const leftPath = resolve(argumentValue("--left") ?? join(defaultReportDirectory, "nava-chronostate-v4.8-2026-07.json"));
const rightPath = resolve(argumentValue("--right") ?? join(defaultReportDirectory, "nava-chronostate-v4.9-2026-07.json"));
const allowMismatch = process.argv.includes("--allow-dataset-mismatch");

if (!existsSync(leftPath)) throw new Error(`Left benchmark report not found: ${leftPath}`);
if (!existsSync(rightPath)) throw new Error(`Right benchmark report not found: ${rightPath}`);

const left = JSON.parse(readFileSync(leftPath, "utf8")) as FixedBenchmarkReport;
const right = JSON.parse(readFileSync(rightPath, "utf8")) as FixedBenchmarkReport;
const sameDataset = left.fixedDataset.sha256 === right.fixedDataset.sha256
  && left.fixedDataset.bytes === right.fixedDataset.bytes
  && left.fixedDataset.users === right.fixedDataset.users;

if (!sameDataset && !allowMismatch) {
  throw new Error(`Benchmark reports do not use the same fixed dataset: ${left.fixedDataset.sha256} vs ${right.fixedDataset.sha256}`);
}

const scenarioDeltas = compareGroupMap(left.scenarios, right.scenarios);
const cohortDeltas = compareGroupMap(left.cohorts, right.cohorts);
const comparison = {
  mode: "fixed-benchmark-comparison",
  left: {
    model: left.model,
    report: leftPath,
    dataset: left.fixedDataset,
  },
  right: {
    model: right.model,
    report: rightPath,
    dataset: right.fixedDataset,
  },
  sameDataset,
  overall: compareMetricGroup(left.overall, right.overall),
  scenarioDeltas,
  cohortDeltas,
  strongestScenarioImprovements: scenarioDeltas.filter((item) => item.maeDelta < -0.15).slice(0, 8),
  materialScenarioRegressions: scenarioDeltas.filter((item) => item.maeDelta > 0.15).sort((leftItem, rightItem) => rightItem.maeDelta - leftItem.maeDelta),
  strongestCohortImprovements: cohortDeltas.filter((item) => item.maeDelta < -0.15).slice(0, 8),
  materialCohortRegressions: cohortDeltas.filter((item) => item.maeDelta > 0.15).sort((leftItem, rightItem) => rightItem.maeDelta - leftItem.maeDelta),
};

const outputPath = resolve(argumentValue("--out") ?? join(dirname(rightPath), `comparison-${sanitize(left.model)}-to-${sanitize(right.model)}.json`));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ ...comparison, outputPath }, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ ...comparison, outputPath }, null, 2));

function compareGroupMap(leftGroups: Record<string, MetricGroup>, rightGroups: Record<string, MetricGroup>) {
  return Object.entries(rightGroups)
    .map(([key, rightGroup]) => compareMetricGroup(leftGroups[key], rightGroup, key))
    .sort((leftItem, rightItem) => leftItem.maeDelta - rightItem.maeDelta);
}

function compareMetricGroup(leftGroup: MetricGroup | undefined, rightGroup: MetricGroup, key = "overall") {
  const base = leftGroup ?? emptyMetricGroup();
  return {
    key,
    count: rightGroup.count,
    left: base.current,
    right: rightGroup.current,
    maeDelta: round(rightGroup.current.mae - base.current.mae, 3),
    rmseDelta: round(rightGroup.current.rmse - base.current.rmse, 3),
    biasAbsDelta: round(Math.abs(rightGroup.current.bias) - Math.abs(base.current.bias), 3),
    spearmanDelta: round(rightGroup.current.spearman - base.current.spearman, 4),
    lowStateAurocDelta: round(rightGroup.current.lowStateAuroc - base.current.lowStateAuroc, 4),
    maeReductionPercent: round((1 - rightGroup.current.mae / Math.max(1e-9, base.current.mae)) * 100, 2),
    rmseReductionPercent: round((1 - rightGroup.current.rmse / Math.max(1e-9, base.current.rmse)) * 100, 2),
  };
}

function emptyMetricGroup(): MetricGroup {
  return {
    count: 0,
    current: {
      mae: 0,
      rmse: 0,
      bias: 0,
      spearman: 0,
      lowStateAuroc: 0,
    },
  };
}

function argumentValue(name: string) {
  return process.argv.find((item) => item.startsWith(`${name}=`))?.split("=").slice(1).join("=");
}

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sanitize(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
}
