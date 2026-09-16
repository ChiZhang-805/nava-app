import test from "node:test";
import assert from "node:assert/strict";
import { initialPhoneState, phoneTransition as step } from "../src/services/previewPhoneSystem.ts";

test("unlocked app and home receive banner; lock wakes to full slider; ending preserves return surface", () => {
  for (const surface of ["app", "home"] as const) {
    const start = { ...initialPhoneState, surface, returnTo: surface };
    assert.equal(step(start, "call").call, "banner");
    let state = step(step(start, "lock"), "call");
    assert.equal(state.surface, "locked"); assert.equal(state.call, "full"); assert.equal(state.callLocked, true);
    state = step(step(state, "answer"), "end-call");
    assert.equal(state.surface, "locked"); assert.equal(step(state, "unlock").surface, surface);
  }
});
test("repeated incoming call cannot reset connected call; unlock cannot bypass ringing lock screen", () => {
  let state = step(step(initialPhoneState, "lock"), "call");
  assert.deepEqual(step(state, "unlock"), state);
  state = step(state, "answer");
  assert.deepEqual(step(state, "call"), state);
  assert.deepEqual(step(state, "app"), state);
  assert.equal(step(state, "side").call, "none");
});
test("side key silences without answering; wake and background preserve app state contract", () => {
  const incoming = step(initialPhoneState, "call");
  assert.equal(step(incoming, "side").muted, true);
  assert.equal(step(incoming, "side").call, "banner");
  const off = step(initialPhoneState, "lock");
  assert.equal(off.surface, "off"); assert.equal(step(off, "wake").surface, "locked");
  assert.equal(step(step(off, "wake"), "unlock").surface, "app");
});
