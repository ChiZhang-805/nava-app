import assert from "node:assert/strict";
import test from "node:test";
import { sampleWardrobeMascotMotion, wardrobeMascotMotions, wardrobeMascotTransform } from "../src/services/wardrobeMascotMotion.ts";
import { sampleWardrobeClothMotion } from "../src/services/wardrobeClothMotion.ts";

test("every wardrobe action starts and ends on the exact still transform", () => {
  assert.equal(wardrobeMascotMotions.length, 4);
  for (const action of wardrobeMascotMotions) {
    const first = sampleWardrobeMascotMotion(action.id, 0);
    const last = sampleWardrobeMascotMotion(action.id, 1);
    assert.deepEqual(last, first, `${action.id} must return to its source still`);
    assert.equal(wardrobeMascotTransform(first), "translate3d(0, 0, 0)");
    assert.equal(wardrobeMascotTransform(last), "translate3d(0, 0, 0)");
    assert.equal(first.effectOpacity, 0);
    assert.ok(action.durationMs >= 2000 && action.durationMs <= 3500);
  }
});

test("actions actually move between their static endpoints", () => {
  for (const action of wardrobeMascotMotions) {
    const middle = sampleWardrobeMascotMotion(action.id, .5);
    assert.notEqual(wardrobeMascotTransform(middle), "translate3d(0, 0, 0)", action.id);
    assert.ok(middle.effectOpacity > 0, action.id);
  }
});

test("out-of-range progress cannot leave the character between poses", () => {
  for (const action of wardrobeMascotMotions) {
    assert.equal(wardrobeMascotTransform(sampleWardrobeMascotMotion(action.id, -1)), "translate3d(0, 0, 0)");
    assert.equal(wardrobeMascotTransform(sampleWardrobeMascotMotion(action.id, 2)), "translate3d(0, 0, 0)");
  }
});

test("cloth bends stay in their fitted envelope and settle without an endpoint impulse", () => {
  const rest = { cloth_relax: 0, cloth_lift: 0 };
  assert.deepEqual(sampleWardrobeClothMotion(null, .5), rest);
  for (const action of wardrobeMascotMotions) {
    for (const progress of [-1, 0, 1, 2, NaN, Infinity]) {
      assert.deepEqual(sampleWardrobeClothMotion(action.id, progress), rest);
    }
    for (let frame = 0; frame <= 240; frame++) {
      for (const weight of Object.values(sampleWardrobeClothMotion(action.id, frame / 240))) {
        assert.ok(Number.isFinite(weight) && weight >= 0 && weight <= 1, `${action.id}: fitted shape range`);
      }
    }
    for (const weight of Object.values(sampleWardrobeClothMotion(action.id, .5))) assert.ok(weight > .1);
    const epsilon = .00001;
    for (const nearEndpoint of [epsilon, 1 - epsilon]) {
      for (const weight of Object.values(sampleWardrobeClothMotion(action.id, nearEndpoint))) {
        assert.ok(weight / epsilon < .001, `${action.id}: cloth must enter and settle with zero velocity`);
      }
    }
  }
});
