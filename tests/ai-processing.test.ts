import assert from "node:assert/strict";
import test from "node:test";
import { AI_PROCESSING_STEP_MIN_MS, buildAiProcessingSteps } from "../src/services/aiProcessing.ts";

test("each visible processing step has a one-second minimum", () => {
  assert.equal(AI_PROCESSING_STEP_MIN_MS, 1_000);
});

test("young students get a one-pass cute processing sequence when personalization is authorized", () => {
  const steps = buildAiProcessingSteps({
    occupation: "student",
    age_group: "18_24",
    ai_personalization_consent: true,
  }, "zh");
  assert.equal(steps.length, 3);
  assert.ok(steps.every((step) => step.tone === "cute"));
  assert.match(steps[0].label, /小雷达/);
});

test("student role keeps the student tone across age groups", () => {
  const steps = buildAiProcessingSteps({ occupation: "student", age_group: "35_44", ai_personalization_consent: true }, "zh");
  assert.ok(steps.every((step) => step.tone === "cute"));
});

test("employees get practical language without a looping step", () => {
  const steps = buildAiProcessingSteps({
    occupation: "employee",
    age_group: "25_34",
    ai_personalization_consent: true,
  }, "zh");
  assert.deepEqual(steps.map((step) => step.id), ["practical-1", "practical-2", "practical-3"]);
  assert.match(steps[2].label, /执行/);
});

test("profile fields do not personalize processing copy without consent", () => {
  const steps = buildAiProcessingSteps({ occupation: "student", age_group: "18_24" }, "zh");
  assert.ok(steps.every((step) => step.tone === "neutral"));
});
