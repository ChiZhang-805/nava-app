import assert from "node:assert/strict";
import test from "node:test";
import { canUseReviewAi, isReviewOriginAllowed } from "../supabase/functions/ai-chat-reply/review-access.ts";

const publicOrigin = "https://chizhang-805.github.io";
const configuredOrigins = `${publicOrigin},http://127.0.0.1,http://localhost`;

test("allows the configured public preview origin", () => {
  assert.equal(isReviewOriginAllowed(publicOrigin, configuredOrigins), true);
});

test("allows local review ports but rejects lookalike remote origins", () => {
  assert.equal(isReviewOriginAllowed("http://127.0.0.1:4173", configuredOrigins), true);
  assert.equal(isReviewOriginAllowed("https://chizhang-805.github.io.attacker.example", configuredOrigins), false);
});

test("never treats an allowed Origin header as AI authentication", () => {
  assert.equal(canUseReviewAi({ requested: true, enabled: "true", origin: publicOrigin, configuredOrigins }), false);
  assert.equal(canUseReviewAi({ requested: true, enabled: "false", origin: publicOrigin, configuredOrigins }), false);
  assert.equal(canUseReviewAi({ requested: false, enabled: "true", origin: publicOrigin, configuredOrigins }), false);
});
