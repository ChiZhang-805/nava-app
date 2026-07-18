import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { syntheticFieldExpectations } from "../algorithm/data-catalog.ts";
import { allCohorts, allScenarios, generatePopulation } from "../algorithm/synthetic.ts";

const minimumUsers = 5000;
const requestedUsers = Number(argumentValue("--users") ?? minimumUsers);
const users = Number.isFinite(requestedUsers) ? Math.max(minimumUsers, Math.min(25000, Math.round(requestedUsers))) : minimumUsers;
const seed = Number(argumentValue("--seed") ?? 240724);
const outputDirectory = argumentValue("--out") ?? process.env.NAVA_SYNTHETIC_DATASET_DIR ?? join("artifacts", "synthetic-population");

mkdirSync(outputDirectory, { recursive: true });

const population = generatePopulation(users, seed);
const dayRecords = population.flatMap((trajectory) => [...trajectory.inputs.history, trajectory.inputs.today]);
const jsonlFile = join(outputDirectory, `nava-synthetic-users-${users}-seed-${seed}.jsonl`);
const manifestFile = join(outputDirectory, `nava-synthetic-users-${users}-seed-${seed}.manifest.json`);
const stream = createWriteStream(jsonlFile, { encoding: "utf8" });

for (const trajectory of population) {
  stream.write(`${JSON.stringify({
    id: trajectory.id,
    scenario: trajectory.scenario,
    cohort: trajectory.cohort,
    truthScore: trajectory.truthScore,
    truthLowState: trajectory.truthLowState,
    truthFactors: trajectory.truthFactors,
    metadata: {
      oneTimeProfile: trajectory.metadata.oneTimeProfile,
      observedDays: trajectory.metadata.observedDays,
      missingnessRate: trajectory.metadata.missingnessRate,
      dataDensity: trajectory.metadata.dataDensity,
      generatorProfile: trajectory.metadata.profile,
    },
    inputs: trajectory.inputs,
  })}\n`);
}

stream.end();

const manifest = {
  generatedAt: new Date().toISOString(),
  schema: "nava-synthetic-population-v1",
  users,
  seed,
  dayRecords: dayRecords.length,
  files: {
    jsonl: jsonlFile,
    manifest: manifestFile,
  },
  coverage: {
    scenariosSeen: Object.keys(countBy(population.map((item) => item.scenario))).length,
    scenariosExpected: allScenarios().length,
    cohortsSeen: Object.keys(countBy(population.map((item) => item.cohort))).length,
    cohortsExpected: allCohorts().length,
  },
  mix: {
    densityCounts: countBy(population.map((item) => item.metadata.dataDensity)),
    scenarioCounts: countBy(population.map((item) => item.scenario)),
    cohortCounts: countBy(population.map((item) => item.cohort)),
    clinicalClassCounts: countBy(population.map((item) => item.metadata.oneTimeProfile.clinicalClass)),
    sexCounts: countBy(population.map((item) => item.metadata.oneTimeProfile.sex)),
    chronotypeCounts: countBy(population.map((item) => item.metadata.oneTimeProfile.chronotype)),
  },
  dataCategories: Object.fromEntries(
    ["apple_watch_auto", "one_time_profile", "daily_user_report", "algorithm_derived"].map((category) => [
      category,
      syntheticFieldExpectations.filter((field) => field.category === category).map((field) => ({
        key: field.key,
        label: field.label,
        unit: field.unit ?? null,
      })),
    ]),
  ),
  truthScore: summarize(population.map((item) => item.truthScore)),
  observedDays: summarize(population.map((item) => item.metadata.observedDays)),
  missingnessRate: summarize(population.map((item) => item.metadata.missingnessRate)),
};

writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  users,
  seed,
  dayRecords: dayRecords.length,
  jsonlFile,
  manifestFile,
  scenariosSeen: manifest.coverage.scenariosSeen,
  cohortsSeen: manifest.coverage.cohortsSeen,
}, null, 2));

function argumentValue(name: string) {
  return process.argv.find((item) => item.startsWith(`${name}=`))?.split("=").slice(1).join("=");
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1]));
}

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: sorted.at(0) ?? null,
    p5: quantile(sorted, 0.05),
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    max: sorted.at(-1) ?? null,
    mean: round(mean(sorted), 4),
  };
}

function quantile(sorted: number[], probability: number) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return round(sorted[lower] * (1 - weight) + sorted[upper] * weight, 4);
}

function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
