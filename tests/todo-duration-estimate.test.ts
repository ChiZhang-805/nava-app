import test from "node:test";
import assert from "node:assert/strict";
import { durationActivityReference, fallbackTodoDurationSeconds, matchedFocusDuration, parseExplicitTodoDuration, parseTodoDurationEstimate } from "../src/services/todoDurationContract.ts";

test("duration evidence keeps daily survey totals and measured personal sessions distinct", () => {
  assert.deepEqual(durationActivityReference("准备做饭"), { source: "US BLS ATUS 2025", activity: "food preparation and cleanup", participantDayMeanMinutes: 65 });
  assert.equal(durationActivityReference("先买菜再做饭"), null);
  const row = (task: string, minutes: number, provenance = "timer") => ({
    fields: { task }, focus: { elapsedMs: minutes * 60_000, provenance, startedAt: "recorded", endedAt: "recorded" },
  });
  assert.deepEqual(matchedFocusDuration("读论文", [row("读论文", 20), row("读论文。", 36), row("读论文", 100, "self-reported"), row("写论文", 45)]), {
    samples: 2, medianSessionSeconds: 28 * 60,
  });
  assert.equal(matchedFocusDuration("写论文", [row("读论文", 20), row("写论文", 30)]), null);
});

test("accepts bounded duration tokens even when the model wraps them", () => {
  assert.equal(parseTodoDurationEstimate("DURATION_SECONDS=3723"), 3723);
  assert.equal(parseTodoDurationEstimate("  DURATION_SECONDS = 1  "), 1);
  assert.equal(parseTodoDurationEstimate("DURATION_SECONDS=359999"), 359999);
  assert.equal(parseTodoDurationEstimate("```text\nDURATION_SECONDS=2880\n```"), 2880);
  assert.equal(parseTodoDurationEstimate('{"durationSeconds":1980}'), 1980);
});

test("rejects prose, invalid precision and out-of-range estimates", () => {
  for (const value of [
    "大约一小时",
    "DURATION_SECONDS=0",
    "DURATION_SECONDS=360000",
    "DURATION_SECONDS=12.5",
  ]) assert.throws(() => parseTodoDurationEstimate(value), /invalid_duration_estimate/);
});

test("extracts explicit task durations before asking the model", () => {
  assert.equal(parseExplicitTodoDuration("完成一次48分钟的有氧跑"), 48 * 60);
  assert.equal(parseExplicitTodoDuration("整理资料 1小时 12分钟 9秒"), 4329);
  assert.equal(parseExplicitTodoDuration("run for 32 min"), 1920);
  assert.equal(parseExplicitTodoDuration("整理明天的资料"), null);
});

test("fallback estimates are stable, bounded, and not mechanically rounded", () => {
  const first = fallbackTodoDurationSeconds("阅读一篇论文");
  assert.equal(first, fallbackTodoDurationSeconds("阅读一篇论文"));
  assert.ok(first >= 8 * 60 && first <= 180 * 60);
  assert.notEqual((first / 60) % 5, 0);
  assert.notEqual(fallbackTodoDurationSeconds("回复两封邮件"), fallbackTodoDurationSeconds("完成有氧跑"));
});
