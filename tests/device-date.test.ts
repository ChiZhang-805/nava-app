import assert from "node:assert/strict";
import test from "node:test";
import { rollingDateWindow, sevenDayDateRange, shiftDateISO, todayISO } from "../src/services/date.ts";

test("rolling date windows end on the device-local calendar day", () => {
  assert.deepEqual(rollingDateWindow("2026-08-30"), [
    "2026-08-24",
    "2026-08-25",
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
  ]);
});

test("local date helpers cross month and leap-day boundaries", () => {
  assert.equal(shiftDateISO("2028-03-01", -1), "2028-02-29");
  assert.equal(todayISO(new Date(2026, 7, 30, 0, 1)), "2026-08-30");
});

test("weekly periods use the supplied device-local reference day", () => {
  assert.deepEqual(sevenDayDateRange(todayISO(new Date(2026, 7, 30, 0, 1))), {
    startDate: "2026-08-24",
    endDate: "2026-08-30",
  });
});
