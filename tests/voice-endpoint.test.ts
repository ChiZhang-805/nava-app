import assert from "node:assert/strict";
import test from "node:test";
import { voiceEndpointDelayMs } from "../src/services/voiceEndpoint.ts";

test("waits longer when a Chinese turn sounds unfinished", () => {
  assert.ok(voiceEndpointDelayMs("我觉得", true) > voiceEndpointDelayMs("我觉得可以。", true));
  assert.ok(voiceEndpointDelayMs("还有，", true) >= 2800);
});

test("waits longer for interim recognition than an explicit sentence ending", () => {
  assert.ok(voiceEndpointDelayMs("今天先休息", false) > voiceEndpointDelayMs("今天先休息。", true));
});
