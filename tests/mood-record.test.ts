import test from "node:test";
import assert from "node:assert/strict";
import { isCompleteMoodRecord, moodBandForScore, moodDateWindow } from "../src/services/mood.ts";

test("mood score bands cover every integer from 0 through 100 exactly once", () => {
  const expected = [
    { from: 0, to: 20, key: "low" },
    { from: 21, to: 40, key: "tired" },
    { from: 41, to: 60, key: "neutral" },
    { from: 61, to: 80, key: "calm" },
    { from: 81, to: 100, key: "bright" },
  ];
  for (const range of expected) {
    for (let score = range.from; score <= range.to; score += 1) {
      assert.equal(moodBandForScore(score).key, range.key, `score ${score}`);
    }
  }
});

test("seven-day mood window ends on the selected day without skipping dates", () => {
  assert.deepEqual(moodDateWindow("2026-08-28"), [
    "2026-08-22",
    "2026-08-23",
    "2026-08-24",
    "2026-08-25",
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
  ]);
});

test("a mood check-in completes only with a cause and written note", () => {
  assert.equal(isCompleteMoodRecord({ factors: [], diary_content: "今天不错" }), false);
  assert.equal(isCompleteMoodRecord({ factors: ["睡眠"], diary_content: "   " }), false);
  assert.equal(isCompleteMoodRecord({ factors: ["睡眠"], diary_content: "今天更平静。" }), true);
});
