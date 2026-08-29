import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyInsights } from "../src/services/weeklyReport.ts";

test("weekly AI report always presents four concise Chinese insights", () => {
  const insights = buildWeeklyInsights({
    locale: "zh",
    weekChange: 8,
    completedModules: 6,
    loading: false,
    report: {
      status: "ready",
      evidenceLevel: "candidate",
      recommendations: [],
      contributors: [{ feature: "activity.minutes", module: "activity", strength: 0.8, direction: "up", reliability: 0.9 }],
    },
  });

  assert.equal(insights.length, 4);
  insights.forEach((insight) => {
    const length = [...insight].length;
    assert.ok(length >= 15 && length <= 18, `${insight} should contain 15–18 Chinese characters`);
  });
});

test("weekly AI report adapts its trend and recommendation to real inputs", () => {
  const insights = buildWeeklyInsights({
    locale: "zh",
    weekChange: -4,
    completedModules: 3,
    loading: false,
    report: {
      status: "ready",
      evidenceLevel: "supported",
      recommendations: [],
      contributors: [{ feature: "nutrition.protein", module: "nutrition", strength: 0.7, direction: "mixed", reliability: 0.8 }],
    },
  });

  assert.match(insights[0], /回落/);
  assert.match(insights[1], /缺项/);
  assert.match(insights[2], /数据支持/);
  assert.match(insights[3], /均衡饮食/);
});
