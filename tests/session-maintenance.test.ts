import assert from "node:assert/strict";
import test from "node:test";
import { sleepMaintenanceElapsedMinutes, sleepMaintenanceFields, type SleepMaintenanceSession } from "../src/services/sessionMaintenance.ts";

const session: SleepMaintenanceSession = { version: 1, startedAt: "2026-09-05T15:30:00.000Z" };

test("sleep maintenance converts a completed interval into editable fields", () => {
  const fields = sleepMaintenanceFields(session, new Date("2026-09-05T23:10:00.000Z"));
  assert.equal(fields.durationMinutes, 460);
  assert.equal(fields.deepMinutes + fields.lightMinutes + fields.remMinutes, 460);
});

test("sleep maintenance reports whole elapsed minutes and never a negative value", () => {
  assert.equal(sleepMaintenanceElapsedMinutes(session, new Date("2026-09-05T15:51:59.000Z")), 21);
  assert.equal(sleepMaintenanceElapsedMinutes(session, new Date("2026-09-05T15:20:00.000Z")), 0);
});
