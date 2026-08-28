import assert from "node:assert/strict";
import test from "node:test";
import { rewardLabel, rewardPoints } from "../src/services/rewardPresentation.ts";

test("daily reward labels match the completed record or task", () => {
  assert.equal(rewardLabel("2026-08-28:sleep", "zh"), "睡眠记录完成");
  assert.equal(rewardLabel("2026-08-28:task", "en"), "Daily task completed");
  assert.equal(rewardLabel("profile:goal", "zh"), "节律目标已设定");
});

test("one completion can combine a base reward and its bonus", () => {
  assert.equal(rewardPoints([
    { eventKey: "2026-08-28:face", points: 15, source: "verified_record" },
    { eventKey: "2026-08-28:bare-face-bonus", points: 15, source: "verified_record" },
  ]), 30);
});

test("invalid negative presentation values never reduce a celebration total", () => {
  assert.equal(rewardPoints([
    { eventKey: "2026-08-28:mood", points: 20, source: "verified_record" },
    { eventKey: "invalid", points: -100, source: "verified_record" },
  ]), 20);
});
