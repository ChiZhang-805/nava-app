import assert from "node:assert/strict";
import test from "node:test";
import { chatMessageParts, spokenAssistantMessage } from "../src/services/chatMessagePresentation.ts";
import { encodeChatReplySegments } from "../supabase/functions/_shared/chat-reply-segments.ts";
import type { ChatMessage } from "../src/types.ts";

const envelope = encodeChatReplySegments([{ type: "text", text: "收到啦～" }, { type: "sticker", id: "hug" }, { type: "text", text: "慢慢来呀。" }]);
const message: ChatMessage = { id: "response", role: "assistant", content: envelope, created_at: new Date().toISOString() };

test("one persisted assistant response reopens as its exact text/sticker groups", () => {
  const saved = JSON.parse(JSON.stringify(message));
  assert.deepEqual(chatMessageParts(saved), [{ type: "text", text: "收到啦～" }, { type: "sticker", id: "hug" }, { type: "text", text: "慢慢来呀。" }]);
});
test("plain responses remain one bubble, with punctuation and newlines preserved", () => {
  const content = "第一句。第二句！\n还有这一行？";
  assert.deepEqual(chatMessageParts({ ...message, content }), [{ type: "text", text: content }]);
});
test("a user cannot create assistant groups by typing an envelope", () => {
  assert.deepEqual(chatMessageParts({ ...message, role: "user" }), [{ type: "text", text: envelope }]);
});
test("unknown sticker URLs or malformed groups stay inert text", () => {
  const content = '[nava-reply:v1][{"type":"sticker","id":"https://attacker.invalid/image.svg"}]';
  assert.deepEqual(chatMessageParts({ ...message, content }), [{ type: "text", text: content }]);
});
test("speech reads complete text without envelope syntax or sticker IDs", () => {
  assert.equal(spokenAssistantMessage(envelope), "收到啦～\n\n慢慢来呀。");
});
