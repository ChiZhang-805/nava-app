import assert from "node:assert/strict";
import test from "node:test";
import { AI_REPLY_LIMITS, buildSystemPrompt, enforceReplyLength } from "../supabase/functions/ai-chat-reply/prompt.ts";

test("Chinese prompt answers the explicit question before rhythm interpretation", () => {
  const prompt = buildSystemPrompt("zh");
  assert.match(prompt, /第一句话必须直接回答/);
  assert.match(prompt, /今天吃什么好/);
  assert.match(prompt, /40-120 个中文字符/);
  assert.match(prompt, /不得超过 180 个中文字符/);
});

test("English prompt defines direct-answer and bounded-length behavior", () => {
  const prompt = buildSystemPrompt("en");
  assert.match(prompt, /Answer the user's explicit question in the first sentence/);
  assert.match(prompt, /Never exceed 100 words/);
});

test("authorized profile changes Chinese response style by age and role", () => {
  const prompt = buildSystemPrompt("zh", {
    profile: {
      personalizationAllowed: true,
      ageGroup: "65_plus",
      occupation: "retired",
      hobbies: ["reading"],
      sleepDuration: "6_7h",
      exerciseDuration: "under_1h",
      dietPreferences: ["light", "restrictions"],
    },
  });
  assert.match(prompt, /65 岁以上/);
  assert.match(prompt, /退休人士/);
  assert.match(prompt, /日常词和短步骤/);
  assert.match(prompt, /不套用职场假设/);
  assert.match(prompt, /不得向用户宣读、罗列或机械复述画像/);
});

test("profile data is excluded from personalization when consent is not granted", () => {
  const prompt = buildSystemPrompt("zh", {
    profile: { personalizationAllowed: false, ageGroup: "18_24", occupation: "student" },
  });
  assert.match(prompt, /未授权或不可用/);
  assert.doesNotMatch(prompt, /18–24 岁/);
  assert.doesNotMatch(prompt, /学生/);
});

test("English personalization is concise and avoids age stereotypes", () => {
  const prompt = buildSystemPrompt("en", {
    profile: { personalizationAllowed: true, ageGroup: "18_24", occupation: "student" },
  });
  assert.match(prompt, /Avoid lecturing or forced youth slang/);
  assert.match(prompt, /Fit suggestions around classes, exams, and a limited budget/);
  assert.match(prompt, /Gender must never determine tone or create stereotypes/);
});

test("Chinese replies are hard-limited on the server", () => {
  const output = enforceReplyLength("这".repeat(260), "zh");
  assert.ok(Array.from(output).length <= AI_REPLY_LIMITS.zh.hardMaxCharacters);
  assert.match(output, /…$/);
});

test("English replies are hard-limited on the server", () => {
  const output = enforceReplyLength(Array.from({ length: 130 }, (_, index) => `word${index}`).join(" "), "en");
  assert.ok(output.split(/\s+/).length <= AI_REPLY_LIMITS.en.hardMaxWords);
  assert.match(output, /…$/);
});
