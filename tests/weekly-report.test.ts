import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateWeeklyModuleScores } from "../src/services/weeklyModuleScores.ts";
import { naturalWeekDateRange } from "../src/services/date.ts";
import type { TrendBundle } from "../src/types.ts";

const recordsScreen = readFileSync(new URL("../src/features/RecordsScreen.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const reportFunction = readFileSync(new URL("../supabase/functions/ai-health-report/index.ts", import.meta.url), "utf8");
const faceFunction = readFileSync(new URL("../supabase/functions/face-analyze/index.ts", import.meta.url), "utf8");
const faceDraftService = readFileSync(new URL("../src/services/secureFaceDraft.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/features/RecordModuleDashboard.tsx", import.meta.url), "utf8");
const productivity = readFileSync(new URL("../src/services/productivity.ts", import.meta.url), "utf8");
const utilityDrawer = readFileSync(new URL("../src/components/UtilityDrawer.tsx", import.meta.url), "utf8");
const focusImmersion = readFileSync(new URL("../src/services/focusImmersion.ts", import.meta.url), "utf8");
const focusStyles = readFileSync(new URL("../src/styles/figma-v2.css", import.meta.url), "utf8");

test("weekly report periods follow the local Monday-to-Sunday natural week", () => {
  assert.deepEqual(naturalWeekDateRange(new Date("2026-09-02T12:00:00")), {
    startDate: "2026-08-31",
    endDate: "2026-09-06",
  });
  assert.deepEqual(naturalWeekDateRange(new Date("2026-09-06T12:00:00")), {
    startDate: "2026-08-31",
    endDate: "2026-09-06",
  });
});

test("weekly insight UI loads the authenticated cloud AI report", () => {
  assert.match(recordsScreen, /loadHealthAiReport\(\{ scope: "weekly"/);
  assert.doesNotMatch(recordsScreen, /buildWeeklyInsights/);
});

test("one real weekly rhythm point replaces the no-data placeholder", () => {
  assert.match(recordsScreen, /recordedReportPointCount > 0/);
  assert.doesNotMatch(recordsScreen, /recordedReportPointCount >= 2/);
});

test("weekly AI report is persisted and rejects non-model providers", () => {
  assert.match(reportFunction, /from\("ai_health_reports"\)\.upsert/);
  assert.match(reportFunction, /row\.provider !== "deepseek"/);
  assert.match(reportFunction, /deepseek-v4-flash-health-report-v6-health-metrics/);
  assert.match(reportFunction, /expectedIds = \["trend", "variation", "association", "action"\]/);
  assert.match(reportFunction, /bullets: report/);
  assert.match(recordsScreen, /weekly-detail-dialog/);
  assert.match(recordsScreen, /weeklyDetailSection\.evidence/);
  assert.match(reportFunction, /consentAuthorizedCompanionRecords/);
});

test("invalid model JSON gets one targeted repair without weakening evidence checks", () => {
  assert.match(reportFunction, /previousDraft/);
  assert.match(reportFunction, /previousIssues/);
  assert.match(reportFunction, /role: "assistant", content: previousDraft/);
  assert.match(reportFunction, /section_\$\{index \+ 1\}_evidence_grounding/);
  assert.match(reportFunction, /section_\$\{index \+ 1\}_association_boundary/);
  assert.match(reportFunction, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
});

test("face makeup routing uses a real vision-model output and a confidence gate", () => {
  assert.match(faceFunction, /makeup_level/);
  assert.match(faceFunction, /makeup_confidence/);
  assert.match(recordsScreen, /makeup_confidence \?\? 0\) < 0\.65/);
  assert.match(recordsScreen, /AI 妆容识别需要你确认/);
  assert.doesNotMatch(faceFunction, /captureMode === "makeup" \? "heavy" : "bare"/);
});

test("face capture conditions are optional, model-assessed, and reachable from the page menu", () => {
  assert.match(faceFunction, /capture_conditions/);
  assert.match(faceFunction, /normalizeCaptureConditions/);
  assert.match(recordsScreen, /initialView === "conditions"/);
  assert.match(recordsScreen, /result\.capture_conditions/);
  assert.doesNotMatch(recordsScreen, /faceAnalyzing \|\| !faceCaptureReady/);
  assert.match(appShell, /条件检验/);
});

test("focus offers presets plus a custom duration while sleep shortcuts never invent stages", () => {
  assert.match(recordsScreen, /<option value="25">/);
  assert.match(recordsScreen, /<option value="45">/);
  assert.match(recordsScreen, /<option value="60">/);
  assert.match(recordsScreen, /<option value="custom">/);
  assert.doesNotMatch(recordsScreen, /setDeepSleep\(Math\.round\(preset\.minutes/);
  assert.doesNotMatch(recordsScreen, /进度同步到当前账号；结束后仍需你确认并保存正式记录/);
  assert.match(recordsScreen, /开始记录/);
});

test("unfinished face captures are encrypted and scoped to the current tab", () => {
  assert.match(faceDraftService, /AES-GCM/);
  assert.match(faceDraftService, /window\.sessionStorage/);
  assert.match(faceDraftService, /30 \* 60 \* 1000/);
  assert.match(faceDraftService, /crypto\.subtle\.decrypt/);
});

test("focus todo plans persist time, duration and session count and complete from real sessions", () => {
  assert.match(productivity, /focus_sessions/);
  assert.match(productivity, /reminder_at/);
  assert.match(dashboard, /selectedTodoCompletedSessions \+ 1 >= \(selectedTodo\.focusSessions \?\? 1\)/);
  assert.match(dashboard, /计划专注次数/);
});

test("drawer todos launch a prefilled linked focus session without conflating completion", () => {
  assert.match(utilityDrawer, /drawer-todo-check/);
  assert.match(utilityDrawer, /drawer-todo-launch/);
  assert.match(utilityDrawer, /onStartFocus\(todo\)/);
  assert.match(appShell, /navigate\("record", "focus", "editor"\)/);
  assert.match(recordsScreen, /selectedTodoId: focusTodoId/);
  assert.match(dashboard, /setSelectedTodoId\(focusLaunch\.selectedTodoId \?\? null\)/);
});

test("immersive focus uses screen wake lock, browser full screen and a viewport fallback", () => {
  assert.match(focusImmersion, /wakeLock/);
  assert.match(focusImmersion, /requestFullscreen/);
  assert.match(dashboard, /data-wake-lock/);
  assert.match(dashboard, /focus-immersive-tools/);
  assert.match(focusStyles, /\.focus-immersive \{[\s\S]*position: fixed;[\s\S]*height: 100dvh;/);
});

test("weekly radar averages only recorded days and preserves a wholly missing dimension as missing", () => {
  const bundle: TrendBundle = {
    moods: [
      { id: "m1", record_date: "2026-08-24", mood_score: 80, factors: [], diary_content: null, ai_feedback: null },
      { id: "m2", record_date: "2026-08-26", mood_score: 60, factors: [], diary_content: null, ai_feedback: null },
    ],
    sleeps: [
      { id: "s1", record_date: "2026-08-24", sleep_start: null, sleep_end: null, sleep_duration_minutes: null, deep_sleep_minutes: null, light_sleep_minutes: null, rem_minutes: null, self_rating: null, rhythm_score: 80, ai_feedback: null },
      { id: "s2", record_date: "2026-08-26", sleep_start: null, sleep_end: null, sleep_duration_minutes: null, deep_sleep_minutes: null, light_sleep_minutes: null, rem_minutes: null, self_rating: null, rhythm_score: 60, ai_feedback: null },
    ],
    exercises: [
      { id: "e1", record_date: "2026-08-24", steps: 8000, calories: null, exercise_minutes: null, heart_rate: null, spo2: null, self_rating: null, ai_feedback: null },
      { id: "e2", record_date: "2026-08-26", steps: 4000, calories: null, exercise_minutes: null, heart_rate: null, spo2: null, self_rating: null, ai_feedback: null },
    ],
    nutritions: [
      { id: "n1", record_date: "2026-08-24", total_calories: 1800, health_rating: 4, ai_feedback: null },
      { id: "n2", record_date: "2026-08-26", total_calories: 1800, health_rating: 5, ai_feedback: null },
    ],
    faces: [
      { id: "f1", record_date: "2026-08-24", image_path: null, overall_score: 90, skin_age: null, annotations: [], feedback: null, model_version: null },
      { id: "f2", record_date: "2026-08-26", image_path: null, overall_score: 70, skin_age: null, annotations: [], feedback: null, model_version: null },
    ],
    focus: [], focusDistributions: [], healthMetrics: [], rhythms: [],
  };
  const scores = Object.fromEntries(calculateWeeklyModuleScores(bundle, "2026-08-24", "2026-08-30").map((item) => [item.key, item]));
  assert.deepEqual(scores.mood, { key: "mood", value: 70, recordedDays: 2 });
  assert.deepEqual(scores.sleep, { key: "sleep", value: 70, recordedDays: 2 });
  assert.deepEqual(scores.exercise, { key: "exercise", value: 75, recordedDays: 2 });
  assert.deepEqual(scores.nutrition, { key: "nutrition", value: 90, recordedDays: 2 });
  assert.deepEqual(scores.face, { key: "face", value: 80, recordedDays: 2 });
  assert.deepEqual(scores.focus, { key: "focus", value: null, recordedDays: 0 });
});

test("weekly focus score aggregates sessions by day before averaging the week", () => {
  const bundle = {
    moods: [], sleeps: [], exercises: [], nutritions: [], faces: [], focusDistributions: [], healthMetrics: [], rhythms: [],
    focus: [
      { id: "a", task_id: "1", record_date: "2026-08-24", completed_sessions: 1, total_minutes: 60 },
      { id: "b", task_id: "2", record_date: "2026-08-24", completed_sessions: 1, total_minutes: 60 },
      { id: "c", task_id: "3", record_date: "2026-08-26", completed_sessions: 1, total_minutes: 60 },
    ],
  } satisfies TrendBundle;
  const focus = calculateWeeklyModuleScores(bundle, "2026-08-24", "2026-08-30").find((item) => item.key === "focus");
  assert.deepEqual(focus, { key: "focus", value: 75, recordedDays: 2 });
});
