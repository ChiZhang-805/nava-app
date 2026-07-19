import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAcceleration, normalizeOrientationDelta } from "../src/services/backgroundMotion.ts";
import {
  BUBBLE_ENERGY_THRESHOLD,
  BUBBLE_PHASE_DURATION_MS,
  bubbleSplitAmount,
  gestureEnergy,
  nextBubblePhase,
} from "../src/services/launchBubbleModel.ts";

function closeTo(actual: number, expected: number, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);
}

test("keeps tiny orientation noise inside the motion dead zone", () => {
  const motion = normalizeOrientationDelta(0.4, 0.4);
  assert.equal(motion.intensity, 0);
  assert.equal(motion.x, 0);
  assert.equal(motion.y, 0);
});

test("maps portrait tilt to a directional response and caps its strength", () => {
  const moderate = normalizeOrientationDelta(0, 9);
  assert.equal(moderate.x, 1);
  assert.equal(moderate.y, 0);
  assert.ok(moderate.intensity > 0.45 && moderate.intensity < 0.5);

  const maximum = normalizeOrientationDelta(0, 40);
  assert.equal(maximum.x, 1);
  assert.equal(maximum.intensity, 1);
});

test("rotates the sensor vector with the screen orientation", () => {
  const portrait = normalizeOrientationDelta(0, 9, 0);
  const landscape = normalizeOrientationDelta(0, 9, 90);
  closeTo(portrait.x, 1);
  closeTo(portrait.y, 0);
  closeTo(landscape.x, 0);
  closeTo(landscape.y, 1);
  closeTo(landscape.intensity, portrait.intensity);
});

test("ignores tiny acceleration and normalizes a deliberate impulse", () => {
  const noise = normalizeAcceleration(0.05, 0.04, 0.03);
  assert.equal(noise.intensity, 0);

  const impulse = normalizeAcceleration(1.92, 0, 0);
  assert.equal(impulse.x, 1);
  assert.equal(impulse.y, 0);
  closeTo(impulse.intensity, 1);
});

test("turns deliberate swipes into bounded bubble interaction energy", () => {
  const tap = gestureEnergy(2, 20);
  const swipe = gestureEnergy(150, 1600);
  const extreme = gestureEnergy(900, 12000);
  assert.ok(tap >= 0.08 && tap < 0.1);
  assert.ok(swipe > 0.8 && swipe < 1);
  assert.equal(extreme, 1.05);
  assert.ok(swipe * 3 >= BUBBLE_ENERGY_THRESHOLD);
});

test("animates a complete split, separation, merge, and settle cycle", () => {
  assert.equal(bubbleSplitAmount("idle", 1000), 0);
  assert.equal(bubbleSplitAmount("splitting", 0), 0);
  assert.equal(bubbleSplitAmount("splitting", BUBBLE_PHASE_DURATION_MS.splitting), 1);
  assert.equal(nextBubblePhase("splitting"), "separated");
  assert.equal(bubbleSplitAmount("separated", 500), 1);
  assert.equal(nextBubblePhase("separated"), "merging");
  assert.equal(bubbleSplitAmount("merging", 0), 1);
  assert.equal(bubbleSplitAmount("merging", BUBBLE_PHASE_DURATION_MS.merging), 0);
  assert.equal(nextBubblePhase("merging"), "settling");
  assert.equal(bubbleSplitAmount("settling", 300), 0);
  assert.equal(nextBubblePhase("settling"), "idle");
});
