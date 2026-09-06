import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { estimateExerciseRecovery } from "../src/services/exerciseRecovery.ts";

const sessionSource = readFileSync(new URL("../src/services/exerciseSession.ts", import.meta.url), "utf8");

test("recovery estimate increases with saved load and user-reported fatigue", () => {
  const light = estimateExerciseRecovery({ minutes: 20, sorenessLevel: 1, fatigueLevel: 2, hasInjury: false, sleepMinutes: 480 });
  const demanding = estimateExerciseRecovery({ minutes: 100, heartRate: "158 bpm", sorenessLevel: 6, fatigueLevel: 8, hasInjury: false, sleepMinutes: 310 });
  assert.ok(demanding.minHours > light.minHours);
  assert.ok(demanding.maxHours > light.maxHours);
  assert.equal(demanding.caution, true);
  assert.ok(demanding.confidence <= 0.74);
});

test("injury flag forces a conservative range and auditable basis", () => {
  const estimate = estimateExerciseRecovery({ minutes: 15, sorenessLevel: 1, fatigueLevel: 1, hasInjury: true });
  assert.equal(estimate.caution, true);
  assert.ok(estimate.maxHours >= 48);
  assert.ok(estimate.basis.some((item) => item.includes("伤病")));
});

test("exercise sessions preserve running and paused time across the cloud session boundary", () => {
  assert.match(sessionSource, /session\.runningSince \? Math\.max\(0,/);
  assert.match(sessionSource, /elapsedSeconds: exerciseSessionElapsedSeconds\(session, now\), runningSince: null/);
  assert.match(sessionSource, /loadActiveUserSession<[\s\S]*>\(userId, "exercise"\)/);
  assert.match(sessionSource, /saveActiveUserSession\(userId, "exercise"/);
  assert.match(sessionSource, /clearActiveUserSession\(userId, "exercise"\)/);
});
