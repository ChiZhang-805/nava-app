import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const recordsScreen = readFileSync(new URL("../src/features/RecordsScreen.tsx", import.meta.url), "utf8");
const reportFunction = readFileSync(new URL("../supabase/functions/ai-health-report/index.ts", import.meta.url), "utf8");

test("weekly insight UI loads the authenticated cloud AI report", () => {
  assert.match(recordsScreen, /loadHealthAiReport\(\{ scope: "weekly"/);
  assert.doesNotMatch(recordsScreen, /buildWeeklyInsights/);
});

test("weekly AI report is persisted and rejects non-model providers", () => {
  assert.match(reportFunction, /from\("ai_health_reports"\)\.upsert/);
  assert.match(reportFunction, /row\.provider !== "deepseek"/);
  assert.match(reportFunction, /bullets\.length !== 4/);
});
