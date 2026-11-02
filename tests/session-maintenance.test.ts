import assert from "node:assert/strict";
import test from "node:test";
import { loadSleepMaintenance, sleepMaintenanceElapsedMinutes, sleepMaintenanceFields, type SleepMaintenanceSession } from "../src/services/sessionMaintenance.ts";

const session: SleepMaintenanceSession = { version: 1, startedAt: "2026-09-05T15:30:00.000Z" };

test('unavailable storage and corrupt cache cannot crash sleep-session loading', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    for (const read of [() => { throw new Error('storage denied'); }, () => '{bad-json']) {
      Object.defineProperty(globalThis, 'window', {configurable:true, value:{localStorage:{getItem:read,removeItem(){throw new Error('storage denied');}}}});
      assert.equal(loadSleepMaintenance('test-user'), null);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test("sleep maintenance converts a completed interval into editable fields", () => {
  const fields = sleepMaintenanceFields(session, new Date("2026-09-05T23:10:00.000Z"));
  assert.equal(fields.durationMinutes, 460);
  assert.deepEqual([fields.deepMinutes, fields.lightMinutes, fields.remMinutes], [0, 0, 0]);
});

test("sleep maintenance reports whole elapsed minutes and never a negative value", () => {
  assert.equal(sleepMaintenanceElapsedMinutes(session, new Date("2026-09-05T15:51:59.000Z")), 21);
  assert.equal(sleepMaintenanceElapsedMinutes(session, new Date("2026-09-05T15:20:00.000Z")), 0);
});
