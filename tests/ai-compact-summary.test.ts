import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validCompactReportBullet } from "../src/services/reportSummaryContract.ts";
import {
  conversationArchiveId,
  conversationNeedsDailyRollover,
  fallbackConversationTitle,
  normalizeGeneratedConversationTitle,
} from "../src/services/aiConversationSessions.ts";

const healthFunction = readFileSync(new URL("../supabase/functions/ai-health-report/index.ts", import.meta.url), "utf8");
const dietFunction = readFileSync(new URL("../supabase/functions/ai-diet-report/index.ts", import.meta.url), "utf8");
const recordsScreen = readFileSync(new URL("../src/features/RecordsScreen.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/features/RecordModuleDashboard.tsx", import.meta.url), "utf8");
const healthService = readFileSync(new URL("../src/services/healthReport.ts", import.meta.url), "utf8");
const dietService = readFileSync(new URL("../src/services/dietReport.ts", import.meta.url), "utf8");
const aiService = readFileSync(new URL("../src/services/ai.ts", import.meta.url), "utf8");
const mediaService = readFileSync(new URL("../src/services/media.ts", import.meta.url), "utf8");
const aiScreen = readFileSync(new URL("../src/features/AIScreen.tsx", import.meta.url), "utf8");
const userCloudState = readFileSync(new URL("../src/services/userCloudState.ts", import.meta.url), "utf8");

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

test("all twenty report prose placements and auxiliary AI entry routes are wired", () => {
  const placements = {
    moduleTrendInsights: 6,
    moduleOverviewFeedback: 6,
    moduleCompactSummaries: 6,
    recordHubOverview: 1,
    weeklyInsight: 1,
  };
  assert.equal(Object.values(placements).reduce((sum, count) => sum + count, 0), 20);

  assert.match(healthService, /type HealthReportScope = "mood" \| "sleep" \| "exercise" \| "focus" \| "face" \| "weekly"/);
  assert.match(healthService, /functions\.invoke<HealthAiReport>\("ai-health-report"/);
  assert.match(healthService, /report\.provider !== "deepseek"/);
  assert.match(dietService, /functions\.invoke<DietAiReport>\("ai-diet-report"/);

  assert.match(dashboard, /module !== "diet"[\s\S]+loadHealthAiReport\(\{ scope: module/);
  assert.match(dashboard, /module === "diet"[\s\S]+loadDietAiReport\(\{ date: props\.recordDate/);
  assert.match(dashboard, /module-overview-ai/);
  assert.match(dashboard, /reportInsights\.map/);

  assert.match(recordsScreen, /const recordedModules = recordModules/);
  assert.match(recordsScreen, /module === "diet"[\s\S]+loadDietAiReport\(\{ date: recordDate/);
  assert.match(recordsScreen, /scope: "weekly", endDate: recordDate/);
  assert.match(recordsScreen, /scope: "weekly", endDate: availableEndDate/);
  assert.match(recordsScreen, /AI 本周节律洞察/);

  assert.match(aiService, /functions\.invoke\("ai-extract-data"/);
  assert.match(aiService, /functions\.invoke<Response>\("ai-chat-reply"/);
  assert.match(mediaService, /functions\.invoke<[\s\S]+>\("diet-extract"/);
  assert.match(mediaService, /functions\.invoke<FaceAnalysisResult>\("face-analyze"/);
  assert.match(dashboard, /focus-ai-priority-button[\s\S]+onOpenAi/);
  assert.match(dashboard, /focus-ai-plan-button[\s\S]+onOpenAi/);
});

test("AI conversations roll over by the device calendar day and receive stable archive identities", () => {
  const messages = [{
    id: "25ab4e21-bf1b-4ab5-8f99-5e903aac9b36",
    role: "user",
    content: "昨晚睡眠不够，今天怎样安排？",
    created_at: "2026-09-07T08:00:00.000Z",
  }];
  assert.equal(conversationNeedsDailyRollover(messages, "2026-09-08"), true);
  assert.equal(conversationNeedsDailyRollover(messages, "2026-09-07"), false);
  assert.equal(conversationArchiveId(messages), messages[0].id);
});

test("conversation archive titles use AI-sized titles with dated multi-chat fallbacks", () => {
  assert.equal(normalizeGeneratedConversationTitle("标题：改善睡眠稳定日间节律", "zh"), "改善睡眠稳定日间节律");
  assert.equal(normalizeGeneratedConversationTitle("太短", "zh"), null);
  assert.equal(fallbackConversationTitle("2026-09-08", "zh", []), "9月8日 AI 对话");
  assert.equal(fallbackConversationTitle("2026-09-08", "zh", [{ dayKey: "2026-09-08" }]), "9月8日 AI 对话之二");
});

test("conversation lifecycle persists metadata, removes active rows, and supports history deletion", () => {
  assert.match(userCloudState, /__navaArchive: \{ version: 1, dayKey, title \}/);
  assert.match(userCloudState, /ai_conversation_archives"\)\.delete\(\)\.eq\("user_id", userId\)\.eq\("id", archiveId\)/);
  assert.match(aiService, /ai_conversations"\)[\s\S]+\.delete\(\)[\s\S]+\.eq\("user_id", userId\)[\s\S]+\.in\("id"/);
  assert.match(aiScreen, /conversationNeedsDailyRollover\(conversation, deviceDayKey\)/);
  assert.equal(aiScreen.match(/prepareConversationForMessage\(\)/g)?.length, 3);
  assert.match(aiScreen, /profile\?\.ai_personalization_consent !== true/);
  assert.match(aiScreen, /generateConversationTitle\(current, locale\)/);
  assert.match(aiScreen, /className="ai-history-delete"/);
  assert.match(aiScreen, /历史会话只读预览/);
});
