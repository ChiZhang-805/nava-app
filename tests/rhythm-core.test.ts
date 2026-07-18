import assert from "node:assert/strict";
import test from "node:test";
import { calculateRhythm, type RhythmInputs } from "../supabase/functions/_shared/rhythm-core.ts";
import { allCohorts, allScenarios, generatePopulation, generateScenarioGrid, legacyFusionProxy } from "../algorithm/synthetic.ts";

test("returns a conservative cold score when no usable data exists", () => {
  const inputs: RhythmInputs = {
    date: "2026-07-18",
    today: {
      date: "2026-07-18",
      mood: null,
      sleep: null,
      exercise: null,
      nutrition: null,
      health: null,
      focusMinutes: 0,
      focusSessions: 0,
    },
    history: [],
  };

  const result = calculateRhythm(inputs);
  assert.equal(result.score, 50);
  assert.equal(result.confidence, 0.08);
  assert.equal(result.fusion.evidenceCount, 0);
  assert.equal(result.fusion.utilityFusion.acuteLatent, null);
  assert.equal(result.fusion.utilityFusion.phaseTurbulencePressure, 0);
  assert.equal(result.fusion.utilityFusion.circadianDriftPressure, 0);
  assert.equal(result.fusion.utilityFusion.physiologyLeadPressure, 0);
  assert.equal(result.fusion.utilityFusion.presenteeismStrainPressure, 0);
  assert.equal(result.fusion.utilityFusion.endpointCalibrationPressure, 0);
  assert.equal(result.fusion.utilityFusion.tailOverreactionRelief, 0);
  assert.equal(result.features.complexity.bounds.factors, 4);
});

test("keeps invalid wearable values out of the score and exposes data flags", () => {
  const inputs: RhythmInputs = {
    date: "2026-07-18",
    today: {
      date: "2026-07-18",
      mood: { mood_score: 72 },
      sleep: { sleep_duration_minutes: 1600, sleep_start: "23:50", self_rating: 4 },
      exercise: { steps: 180000 },
      nutrition: { total_calories: 1900 },
      health: { resting_heart_rate: 220, heart_rate_variability_sdnn: 600, blood_oxygen: 62 },
      focusMinutes: 90,
      focusSessions: 3,
    },
    history: [],
  };

  const result = calculateRhythm(inputs);
  const codes = result.anomalyFlags.map((item) => item.code);
  assert.ok(codes.includes("invalid_sleep_duration"));
  assert.ok(codes.includes("invalid_steps"));
  assert.ok(codes.includes("invalid_resting_heart_rate"));
  assert.ok(codes.includes("invalid_hrv"));
  assert.ok(codes.includes("invalid_spo2"));
  assert.ok(result.score >= 0 && result.score <= 100);
});

test("beats the legacy single-day proxy on heterogeneous synthetic users", () => {
  const population = generatePopulation(160, 240721);
  const v4Errors: number[] = [];
  const legacyErrors: number[] = [];

  for (const trajectory of population) {
    const result = calculateRhythm(trajectory.inputs);
    v4Errors.push(Math.abs(result.score - trajectory.truthScore));
    legacyErrors.push(Math.abs(legacyFusionProxy(trajectory.inputs) - trajectory.truthScore));
    assert.ok(result.scoreInterval.lower <= result.score);
    assert.ok(result.score <= result.scoreInterval.upper);
    assert.ok(result.fusion.utilityFusion.lowConsensus >= 0);
    assert.ok(result.fusion.utilityFusion.highConsensus >= 0);
    assert.ok(result.fusion.utilityFusion.phaseTurbulencePressure >= 0);
    assert.ok(result.fusion.utilityFusion.circadianDriftPressure >= 0);
    assert.ok(result.fusion.utilityFusion.physiologyLeadPressure >= 0);
    assert.ok(result.fusion.utilityFusion.presenteeismStrainPressure >= 0);
    assert.ok(result.fusion.utilityFusion.endpointCalibrationPressure >= 0);
    assert.ok(result.fusion.utilityFusion.tailOverreactionRelief >= 0);
  }

  const v4Mae = mean(v4Errors);
  const legacyMae = mean(legacyErrors);
  assert.ok(v4Mae < 8.5, `V4 MAE was ${v4Mae}`);
  assert.ok(v4Mae < legacyMae * 0.84, `V4 MAE ${v4Mae} did not beat legacy ${legacyMae}`);
  assert.ok(legacyMae - v4Mae > 1.25, `V4 absolute gain ${legacyMae - v4Mae} was too small`);
});

test("covers every synthetic stress scenario", () => {
  const population = generateScenarioGrid(4, 240722);
  const byScenario = new Map(allScenarios().map((scenario) => [scenario, 0]));
  for (const trajectory of population) byScenario.set(trajectory.scenario, (byScenario.get(trajectory.scenario) ?? 0) + 1);
  for (const [scenario, count] of byScenario) assert.equal(count, 4, `${scenario} count`);
});

test("generates broad non-uniform cohorts and realistic data density", () => {
  const population = generatePopulation(600, 240723);
  const cohorts = new Set(population.map((item) => item.cohort));
  const densities = new Set(population.map((item) => item.metadata.dataDensity));
  const scenarios = new Set(population.map((item) => item.scenario));
  const missingness = population.map((item) => item.metadata.missingnessRate);
  assert.ok(cohorts.size >= Math.min(12, allCohorts().length), `cohort coverage ${cohorts.size}`);
  assert.ok(scenarios.size >= Math.min(14, allScenarios().length), `scenario coverage ${scenarios.size}`);
  assert.ok(densities.has("dense") && densities.has("mixed") && densities.has("sparse"));
  assert.ok(Math.min(...missingness) < 0.28);
  assert.ok(Math.max(...missingness) > 0.55);
});

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
