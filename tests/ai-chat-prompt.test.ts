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
