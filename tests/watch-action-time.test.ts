import assert from "node:assert/strict";
import test from "node:test";
import { watchActionDate, watchActionLocalHour } from "../supabase/functions/_shared/watch-action-time.ts";

test("Watch actions preserve the device-local record date across UTC midnight", () => {
  const action = {
    endedAt: "2026-09-05T16:30:00.000Z",
    localDate: "2026-09-06",
    timezoneOffsetMinutes: 480,
  };
  assert.equal(watchActionDate(action, "2026-09-05"), "2026-09-06");
  assert.equal(watchActionLocalHour(action), 0);
});

test("legacy Watch actions use their own timestamp instead of server arrival time", () => {
  const action = { endedAt: "2026-09-05T08:15:00.000Z" };
  assert.equal(watchActionDate(action, "2026-09-06"), "2026-09-05");
  assert.equal(watchActionLocalHour(action), 8);
});
