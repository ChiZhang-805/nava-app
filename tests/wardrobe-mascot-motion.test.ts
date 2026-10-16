import assert from "node:assert/strict";
import test from "node:test";
import { sampleWardrobeMascotMotion, wardrobeMascotMotions, wardrobeMascotTransform } from "../src/services/wardrobeMascotMotion.ts";

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
