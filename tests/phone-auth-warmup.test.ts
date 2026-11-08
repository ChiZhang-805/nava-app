import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const authScreen = readFileSync(new URL("../src/features/AuthScreen.tsx", import.meta.url), "utf8");
const authService = readFileSync(new URL("../src/services/auth.ts", import.meta.url), "utf8");
const warmupService = readFileSync(new URL("../src/services/smsRelayWarmup.ts", import.meta.url), "utf8");

test("phone OTP button stays silent and disabled until relay warmup completes", () => {
  assert.match(authScreen, /accountIsPhone && !smsRelayReady/);
  assert.match(authScreen, /void warmSmsRelay\(\)\.then/);
  assert.doesNotMatch(authScreen, /正在准备短信服务|preparing sms|warming/i);
});

test("phone OTP uses Supabase Phone Auth and the configured Send SMS hook", () => {
  assert.match(authService, /signInWithOtp\(\{[\s\S]*phone: toAuthPhone\(phone\)/);
  assert.match(authService, /verifyOtp\(\{[\s\S]*type: "sms"/);
  assert.doesNotMatch(authService, /invokeAuthFunction\("aliyun-sms-(send|verify)"/);
});

test("relay warmup is public, deduplicated, bounded, and credential-free", () => {
  assert.match(warmupService, /inFlightWarmup/);
  assert.match(warmupService, /mode: "no-cors"/);
  assert.match(warmupService, /credentials: "omit"/);
  assert.match(warmupService, /AbortController/);
});
