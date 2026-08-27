import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicRoute, normalizeModelRoute } from "../supabase/functions/ai-chat-reply/router.ts";
import { buildSystemPrompt } from "../supabase/functions/ai-chat-reply/prompt.ts";

test("explicit multi-record messages route without another model call", () => {
  const route = buildDeterministicRoute("我今天睡了3小时，还跑了30分钟，吃了两个鸡蛋和五片面包", "multi", {
    records: [
      { dataType: "sleep", extractedData: { sleepDurationMinutes: 180 } },
      { dataType: "exercise", extractedData: { exerciseMinutes: 30 } },
      { dataType: "nutrition", extractedData: { totalCalories: 515 } },
    ],
  });
  assert.deepEqual(route?.domains, ["sleep", "exercise", "nutrition"]);
  assert.equal(route?.intent, "record");
  assert.equal(route?.source, "deterministic");
});

test("model routes are bounded to three supported domains and safe lookbacks", () => {
  const route = normalizeModelRoute({
    intent: "advice",
    domains: ["sleep", "mood", "nutrition", "unknown", "exercise"],
    lookbackDays: 23,
    complexity: "complex",
  });
  assert.deepEqual(route.domains, ["sleep", "mood", "nutrition"]);
  assert.equal(route.lookbackDays, 14);
  assert.equal(route.complexity, "complex");
});

test("system prompt includes only route-relevant profile variables and records", () => {
  const route = {
    intent: "advice",
    domains: ["sleep"],
    lookbackDays: 7,
    complexity: "simple",
    source: "deterministic",
  } as const;
  const prompt = buildSystemPrompt("zh", {
    profile: {
      personalizationAllowed: true,
      ageGroup: "18_24",
      occupation: "student",
      sleepDuration: "6_7h",
      exerciseDuration: "4_7h",
      dietPreferences: ["high_protein"],
    },
    healthDataAllowed: true,
    recent: {
      sleep: [{ date: "2026-08-27", minutes: 365 }],
    },
  }, route);
  assert.match(prompt, /年龄段=18–24 岁/);
  assert.match(prompt, /身份=学生/);
  assert.match(prompt, /通常睡眠=6–7 小时/);
  assert.doesNotMatch(prompt, /通常运动=/);
  assert.doesNotMatch(prompt, /饮食=/);
  assert.match(prompt, /2026-08-27/);
  assert.match(prompt, /只模仿表达，不复制事实/);
});
