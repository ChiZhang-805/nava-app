import test from "node:test";
import assert from "node:assert/strict";
import { parseTodoDurationEstimate } from "../src/services/todoDurationContract.ts";

test("accepts only a bounded DeepSeek duration token", () => {
  assert.equal(parseTodoDurationEstimate("DURATION_SECONDS=3723"), 3723);
  assert.equal(parseTodoDurationEstimate("  DURATION_SECONDS = 1  "), 1);
  assert.equal(parseTodoDurationEstimate("DURATION_SECONDS=359999"), 359999);
});

test("rejects prose, invalid precision and out-of-range estimates", () => {
  for (const value of [
    "大约一小时",
    "DURATION_SECONDS=3600 seconds",
    "DURATION_SECONDS=0",
    "DURATION_SECONDS=360000",
    "DURATION_SECONDS=12.5",
    '{"seconds":3600}',
  ]) assert.throws(() => parseTodoDurationEstimate(value), /invalid_duration_estimate/);
});
