import assert from "node:assert/strict";
import test from "node:test";
import {
  mascotArtworkFrame,
  mascotDisplayFrameCount,
  mascotFramesPerSecond,
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

test("the mascot renders a four-second 24 fps display timeline", () => {
  assert.equal(mascotFramesPerSecond, 24);
  assert.equal(mascotDisplayFrameCount, 96);
  mascotMotionSequence.forEach(({ durationMs }) => assert.equal(durationMs, 4_000));
});

test("every animation starts and settles on a valid drawn frame", () => {
  assert.equal(mascotArtworkFrame("wave", 0), 0);
  assert.equal(mascotArtworkFrame("wave", 95), 23);
  assert.equal(mascotArtworkFrame("tail", 95), 23);
  assert.equal(mascotArtworkFrame("read", 95), 23);
  assert.equal(mascotArtworkFrame("sleep", 95), 23);
  assert.equal(mascotArtworkFrame("lift", 95), 19);
});

test("mascot motion selection advances and wraps predictably", () => {
  assert.equal(mascotMotionAt(0).id, "wave");
  assert.equal(mascotMotionAt(-1).id, "lift");
  assert.equal(nextMascotMotionIndex(0), 1);
  assert.equal(nextMascotMotionIndex(mascotMotionSequence.length - 1), 0);
});
