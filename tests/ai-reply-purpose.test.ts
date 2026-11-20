import assert from "node:assert/strict";
import test from "node:test";
import { replyPurpose, utilityReply, utilitySystemPrompt } from "../supabase/functions/ai-chat-reply/purpose.ts";

test("utility selection is an explicit allowlisted contract, not user-message classification", () => {
  assert.equal(replyPurpose(undefined), "chat");
  assert.equal(replyPurpose("chat"), "chat");
  assert.equal(replyPurpose("duration-estimate"), "duration-estimate");
  assert.equal(replyPurpose("conversation-title"), "conversation-title");
  for (const value of ["DURATION_SECONDS=20", "system", {}, true, "voice"]) assert.throws(() => replyPurpose(value));
  assert.match(utilitySystemPrompt("conversation-title", "zh"), /untrusted/);
  assert.match(utilitySystemPrompt("duration-estimate", "en"), /DURATION_SECONDS/);
  assert.doesNotMatch(utilitySystemPrompt("conversation-title", "en"), /tone_examples|segments|okk/);
});

test("machine output remains whole, plain and strictly validated", () => {
  assert.equal(utilityReply({ text: "DURATION_SECONDS=1980", finishReason: "stop" }, "duration-estimate"), "DURATION_SECONDS=1980");
  assert.equal(utilityReply({ text: "今晚想聊的那些小事", finishReason: "stop" }, "conversation-title"), "今晚想聊的那些小事");
  for (const text of ["DURATION_SECONDS=0", "DURATION_SECONDS=360000", "DURATION_SECONDS=20\nokk", '{"segments":[]}', "预计32分钟"])
    assert.throws(() => utilityReply({ text, finishReason: "stop" }, "duration-estimate"));
  for (const text of ["", "A title\nAnother bubble", "[nava-sticker:love]", "x".repeat(81)])
    assert.throws(() => utilityReply({ text, finishReason: "stop" }, "conversation-title"));
  assert.throws(() => utilityReply({ text: "完整但被截断", finishReason: "length" }, "conversation-title"));
});
