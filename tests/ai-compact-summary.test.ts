import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validCompactReportBullet } from "../src/services/reportSummaryContract.ts";

const healthFunction = readFileSync(new URL("../supabase/functions/ai-health-report/index.ts", import.meta.url), "utf8");
const dietFunction = readFileSync(new URL("../supabase/functions/ai-diet-report/index.ts", import.meta.url), "utf8");
const recordsScreen = readFileSync(new URL("../src/features/RecordsScreen.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/features/RecordModuleDashboard.tsx", import.meta.url), "utf8");
const healthService = readFileSync(new URL("../src/services/healthReport.ts", import.meta.url), "utf8");

test("Chinese compact AI summaries accept exactly seven Han characters only", () => {
  assert.equal(validCompactReportBullet("近周节律较平稳", "zh"), true);
  assert.equal(validCompactReportBullet("近周节律平稳", "zh"), false);
  assert.equal(validCompactReportBullet("近周节律保持平稳", "zh"), false);
  assert.equal(validCompactReportBullet("近周节律较平稳。", "zh"), false);
  assert.equal(validCompactReportBullet("近周节律较平一", "zh"), true);
});

test("both AI functions generate and cache normal and compact summaries in one model result", () => {
  for (const source of [healthFunction, dietFunction]) {
    assert.match(source, /compactBullets/);
    assert.match(source, /Array\.from\(cleaned\)\.length === 7/);
    assert.match(source, /\^\\p\{Script=Han\}\{7\}\$\/u/);
  }
  assert.match(healthFunction, /不能只是截断 headline/);
  assert.match(dietFunction, /不能只是截断 bullets/);
  assert.match(healthFunction, /bullets: \{ \.\.\.report, sourceFingerprint: fingerprint \}/);
  assert.match(dietFunction, /ai_feedback: JSON\.stringify\(stored\)/);
});

test("small report cards use compact output while detailed reports keep normal bullets", () => {
  assert.match(recordsScreen, /report\.compactBullets/);
  assert.match(recordsScreen, /data-summary-source=\{compactPoints \? "ai-compact"/);
  assert.match(dashboard, /reportInsights = .*dietReport\?\.bullets/);
  assert.match(dashboard, /healthReport\?\.bullets/);
});

test("health report results stay in memory and saved data relies on the server source fingerprint", () => {
  assert.match(healthService, /sourceRevision: string; report: HealthAiReport/);
  assert.match(healthService, /const userKey = sessionData\.session\?\.user\.id \?\? "anonymous"/);
  assert.match(healthService, /if \(input\.refresh\) resolved\.delete\(baseKey\)/);
  assert.match(healthService, /cached\?\.sourceRevision === input\.sourceRevision/);
  assert.match(healthService, /resolved\.set\(baseKey, \{ sourceRevision: input\.sourceRevision, report \}\)/);
  assert.match(healthService, /healthReportSourceRevision/);
  assert.match(healthService, /healthMetrics: inPeriod\(bundle\.healthMetrics\)/);
  assert.doesNotMatch(recordsScreen, /loadHealthAiReport\([^\n]+refresh: true/);
  assert.doesNotMatch(recordsScreen, /loadDietAiReport\([^\n]+refresh: true/);
});
