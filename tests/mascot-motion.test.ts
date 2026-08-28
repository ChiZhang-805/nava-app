import assert from "node:assert/strict";
import test from "node:test";
import {
  mascotMotionAt,
  mascotMotionSequence,
  nextMascotMotionIndex,
} from "../src/services/mascotMotion.ts";

test("the mascot plays five distinct motions in the requested order", () => {
  assert.deepEqual(
    mascotMotionSequence.map(({ id }) => id),
    ["wave", "tail", "read", "sleep", "lift"],
  );
});

test("every mascot motion lasts between three and four seconds", () => {
  mascotMotionSequence.forEach(({ durationMs }) => {
    assert.ok(durationMs >= 3_000);
    assert.ok(durationMs <= 4_000);
  });
});

test("mascot motion selection advances and wraps predictably", () => {
  assert.equal(mascotMotionAt(0).id, "wave");
  assert.equal(mascotMotionAt(-1).id, "lift");
  assert.equal(nextMascotMotionIndex(0), 1);
  assert.equal(nextMascotMotionIndex(mascotMotionSequence.length - 1), 0);
});
