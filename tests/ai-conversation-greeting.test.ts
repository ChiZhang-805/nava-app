import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildConversationGreeting } from "../src/services/aiConversationSessions.ts";

const aiScreen = readFileSync(new URL("../src/features/AIScreen.tsx", import.meta.url), "utf8");

test("fresh conversations start with varied, concise prompts", () => {
  const greetings = Array.from({ length: 5 }, (_, seed) => buildConversationGreeting("zh", seed));
  assert.equal(new Set(greetings).size, 5);
  assert.ok(greetings.every((greeting) => greeting.startsWith("嗨") || greeting.startsWith("你好")));
  assert.ok(greetings.every((greeting) => greeting.length < 45 && greeting.includes("？")));
});

test("empty, daily rollover, manual new, and clear states all create a greeting", () => {
  assert.ok((aiScreen.match(/createConversationGreeting/g) ?? []).length >= 5);
  assert.doesNotMatch(aiScreen, /ai\.emptyTitle/);
  assert.doesNotMatch(aiScreen, /className="empty-chat"/);
});
