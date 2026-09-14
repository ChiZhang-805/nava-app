import assert from "node:assert/strict";
import test from "node:test";
import { getPreviewActivity, registerPreviewActivity, simulatePreviewInterruption, subscribePreviewActivity } from "../src/services/previewEnvironment.ts";

test("only visible owner receives events; pending pause blocks repeated clicks", () => {
  const received: string[] = [];
  const old = registerPreviewActivity({ module: "sleep", state: "running" }, () => received.push("sleep"));
  const latest = registerPreviewActivity({ module: "exercise", state: "running" }, (reason) => received.push(reason));
  old();
  assert.equal(getPreviewActivity()?.module, "exercise");
  assert.equal(simulatePreviewInterruption("distraction"), false);
  assert.equal(simulatePreviewInterruption("call"), true);
  assert.equal(simulatePreviewInterruption("message"), false);
  assert.deepEqual(received, ["call"]);
  latest();
  assert.equal(getPreviewActivity(), null);
});

test("ready/paused states do nothing, leaving screen revokes controls", () => {
  let notifications = 0;
  const stop = subscribePreviewActivity(() => notifications++);
  for (const state of ["ready", "paused"] as const) {
    const unregister = registerPreviewActivity({ module: "focus", state }, () => assert.fail("inactive event"));
    assert.equal(simulatePreviewInterruption("call"), false);
    unregister();
  }
  assert.equal(notifications, 4);
  stop();
  assert.equal(simulatePreviewInterruption("other"), false);
});
