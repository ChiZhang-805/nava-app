import assert from "node:assert/strict";
import test from "node:test";
import { resolveAiSpeechStyle, sanitizeSpeechText, takeSpeakableChunks } from "../src/services/aiSpeech.ts";

test("streams complete Chinese sentences and keeps an unfinished tail", () => {
  const result = takeSpeakableChunks("先喝一杯水。然后休息五分钟，再继续");
  assert.deepEqual(result.chunks, ["先喝一杯水。"]);
  assert.equal(result.remainder, "然后休息五分钟，再继续");
});

test("flushes the final sentence when the model stream ends", () => {
  const result = takeSpeakableChunks("最后记得早点休息", true);
  assert.deepEqual(result.chunks, ["最后记得早点休息"]);
  assert.equal(result.remainder, "");
});

test("breaks a long streaming sentence at a natural clause boundary", () => {
  const prefix = "先根据你最近几天的睡眠和运动记录做一个简短判断，再把今天最值得完成的一步压缩到足够轻松的程度";
  const result = takeSpeakableChunks(`${prefix}，后面的内容还在生成`);
  assert.equal(result.chunks.length, 1);
  assert.match(result.chunks[0], /，$/);
  assert.equal(result.remainder, "后面的内容还在生成");
});

test("uses a brighter style only when personalization is allowed", () => {
  const personalized = resolveAiSpeechStyle({
    occupation: "student",
    age_group: "18_24",
    ai_personalization_consent: true,
    onboarding_answers: null,
  }, "zh");
  const neutral = resolveAiSpeechStyle({
    occupation: "student",
    age_group: "18_24",
    ai_personalization_consent: false,
    onboarding_answers: null,
  }, "zh");
  assert.ok(personalized.rate > neutral.rate);
  assert.ok(personalized.pitch > neutral.pitch);
});

test("removes markdown controls before narration", () => {
  assert.equal(sanitizeSpeechText("**建议**：[喝水](https://example.com)"), "建议：喝水");
});
